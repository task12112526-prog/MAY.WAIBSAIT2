begin;

create table public.mosque_committees (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosque_registrations(id) on delete restrict,
  previous_committee_id uuid references public.mosque_committees(id) on delete set null,
  title text not null default 'Masjid management committee' check (length(btrim(title)) between 1 and 160),
  term_starts_on date not null,
  term_ends_on date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'expired', 'dissolved')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (term_ends_on >= term_starts_on)
);

create unique index mosque_committees_one_active_per_mosque_idx
  on public.mosque_committees(mosque_id) where status = 'active';
create index mosque_committees_mosque_term_idx
  on public.mosque_committees(mosque_id, term_starts_on desc);

create table public.mosque_committee_members (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.mosque_committees(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  phone text not null check (length(btrim(phone)) between 7 and 40),
  email text check (email is null or length(btrim(email)) <= 254),
  address text not null check (length(btrim(address)) between 1 and 500),
  member_position text not null default 'member' check (member_position in ('supervisor', 'member')),
  department text not null check (department in (
    'finance', 'maintenance', 'events', 'administration', 'education', 'welfare', 'security', 'facilities'
  )),
  authority_level text not null default 'propose' check (authority_level in ('view', 'propose', 'approve', 'manage')),
  status text not null default 'candidate' check (status in ('candidate', 'active', 'removed')),
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index mosque_committee_members_committee_idx
  on public.mosque_committee_members(committee_id, status, member_position, full_name);

create table public.mosque_committee_interviews (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.mosque_committee_members(id) on delete cascade,
  interview_date date not null,
  interviewer_name text not null check (length(btrim(interviewer_name)) between 1 and 160),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  assessment text not null check (length(btrim(assessment)) between 1 and 2000),
  recommendation text not null check (recommendation in ('suitable', 'conditional', 'not_suitable')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index mosque_committee_interviews_member_date_idx
  on public.mosque_committee_interviews(member_id, interview_date desc, created_at desc);

create or replace function public.validate_mosque_committee_activation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  member_count integer;
  supervisor_count integer;
  unassessed_count integer;
  current_committee public.mosque_committees%rowtype;
begin
  if new.status <> 'active' then
    return new;
  end if;

  if new.term_starts_on > current_date or new.term_ends_on < current_date then
    raise exception 'An active committee term must include today.';
  end if;

  select count(*) filter (where member_position = 'member'),
         count(*) filter (where member_position = 'supervisor')
    into member_count, supervisor_count
    from public.mosque_committee_members
    where committee_id = new.id and status = 'active';

  if member_count not between 5 and 7 or supervisor_count <> 1 then
    raise exception 'An active committee needs one supervisor and 5 to 7 active members.';
  end if;

  select count(*) into unassessed_count
    from public.mosque_committee_members member
    where member.committee_id = new.id and member.status = 'active'
      and coalesce((
        select interview.recommendation in ('suitable', 'conditional')
        from public.mosque_committee_interviews interview
        where interview.member_id = member.id
        order by interview.interview_date desc, interview.created_at desc
        limit 1
      ), false) = false;
  if unassessed_count > 0 then
    raise exception 'Every active committee member must have a suitable or conditional interview record.';
  end if;

  select * into current_committee
    from public.mosque_committees
    where mosque_id = new.mosque_id and status = 'active' and id <> new.id
    for update;
  if found then
    if new.term_starts_on <= current_committee.term_starts_on then
      raise exception 'The new committee term must start after the current committee term began.';
    end if;
    update public.mosque_committees
      set status = 'expired', term_ends_on = least(term_ends_on, new.term_starts_on - 1)
      where id = current_committee.id;
  end if;
  return new;
end;
$$;

create trigger mosque_committees_validate_activation
before insert or update of status, term_starts_on, term_ends_on on public.mosque_committees
for each row execute function public.validate_mosque_committee_activation();

create or replace function public.protect_active_mosque_committee_members()
returns trigger
language plpgsql
set search_path = ''
as $$
declare committee_status text;
begin
  select status into committee_status
    from public.mosque_committees
    where id = case when tg_op = 'DELETE' then old.committee_id else new.committee_id end;
  if committee_status = 'active' then
    raise exception 'End or renew the active committee term before changing its roster.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger mosque_committee_members_protect_active
before insert or update or delete on public.mosque_committee_members
for each row execute function public.protect_active_mosque_committee_members();

create or replace function public.renew_mosque_committee(
  p_committee_id uuid,
  p_term_starts_on date,
  p_term_ends_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_committee public.mosque_committees%rowtype;
  new_committee_id uuid;
begin
  if auth.uid() is null or not public.has_masjid_role(array['admin', 'mosque_manager']) then
    raise exception 'You are not allowed to renew this committee.' using errcode = '42501';
  end if;
  if p_term_starts_on < current_date or p_term_ends_on < p_term_starts_on then
    raise exception 'Enter a valid future committee term.';
  end if;

  select * into old_committee
    from public.mosque_committees
    where id = p_committee_id and status = 'active'
    for update;
  if not found then
    raise exception 'Only an active committee can be renewed.';
  end if;
  if p_term_starts_on <= old_committee.term_starts_on then
    raise exception 'The renewed term must start after the current term began.';
  end if;

  insert into public.mosque_committees(
    mosque_id, previous_committee_id, title, term_starts_on, term_ends_on, status, created_by
  ) values (
    old_committee.mosque_id, old_committee.id, old_committee.title,
    p_term_starts_on, p_term_ends_on, 'draft', auth.uid()
  ) returning id into new_committee_id;

  insert into public.mosque_committee_members(
    committee_id, full_name, phone, email, address, member_position, department, authority_level, status, notes
  )
  select new_committee_id, full_name, phone, email, address, member_position, department, authority_level,
         'candidate', notes
    from public.mosque_committee_members
    where committee_id = old_committee.id and status = 'active';

  return new_committee_id;
end;
$$;

alter table public.mosque_committees enable row level security;
alter table public.mosque_committee_members enable row level security;
alter table public.mosque_committee_interviews enable row level security;

revoke all on public.mosque_committees, public.mosque_committee_members, public.mosque_committee_interviews from public, anon, authenticated;
grant select, insert on public.mosque_committees to authenticated;
grant update (mosque_id, previous_committee_id, title, term_starts_on, term_ends_on, status)
  on public.mosque_committees to authenticated;
grant select, insert, update on public.mosque_committee_members to authenticated;
grant select, insert on public.mosque_committee_interviews to authenticated;
revoke all on function public.renew_mosque_committee(uuid, date, date) from public, anon;
grant execute on function public.renew_mosque_committee(uuid, date, date) to authenticated;

create policy mosque_committees_read on public.mosque_committees for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy mosque_committees_create on public.mosque_committees for insert to authenticated
with check (public.has_masjid_role(array['admin', 'mosque_manager']) and created_by = auth.uid());
create policy mosque_committees_update on public.mosque_committees for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy mosque_committee_members_read on public.mosque_committee_members for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy mosque_committee_members_create on public.mosque_committee_members for insert to authenticated
with check (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy mosque_committee_members_update on public.mosque_committee_members for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager']));

create policy mosque_committee_interviews_read on public.mosque_committee_interviews for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy mosque_committee_interviews_create on public.mosque_committee_interviews for insert to authenticated
with check (public.has_masjid_role(array['admin', 'mosque_manager']) and created_by = auth.uid());

commit;
