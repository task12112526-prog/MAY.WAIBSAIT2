begin;

alter table public.mosque_committee_members
  add column cnic_number text
    check (cnic_number is null or cnic_number ~ '^[0-9]{13}$');

create index mosque_committee_members_cnic_number_idx
  on public.mosque_committee_members(cnic_number)
  where cnic_number is not null;
create index mosque_committee_members_phone_digits_idx
  on public.mosque_committee_members((regexp_replace(phone, '[^0-9]', '', 'g')));

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
    committee_id, full_name, phone, email, cnic_number, address, member_position,
    department, authority_level, status, notes
  )
  select new_committee_id, full_name, phone, email, cnic_number, address, member_position,
         department, authority_level, 'candidate', notes
    from public.mosque_committee_members
    where committee_id = old_committee.id and status = 'active';

  return new_committee_id;
end;
$$;

create table public.mosque_committee_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.mosque_committee_members(id) on delete restrict,
  period_starts_on date not null,
  period_ends_on date not null,
  rating text not null check (rating in ('excellent', 'good', 'needs_improvement', 'unsatisfactory')),
  completed_tasks text not null check (length(btrim(completed_tasks)) between 1 and 3000),
  pending_tasks text check (pending_tasks is null or length(pending_tasks) <= 3000),
  achievements text check (achievements is null or length(achievements) <= 3000),
  improvement_notes text check (improvement_notes is null or length(improvement_notes) <= 3000),
  reviewer_name text not null check (length(btrim(reviewer_name)) between 1 and 160),
  reviewed_on date not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (period_ends_on >= period_starts_on),
  check (reviewed_on >= period_ends_on and reviewed_on <= current_date)
);

create index mosque_committee_performance_member_period_idx
  on public.mosque_committee_performance_reviews(member_id, period_ends_on desc);

create or replace function public.validate_mosque_committee_performance_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  committee_start date;
  committee_end date;
  member_status text;
begin
  select committee.term_starts_on, committee.term_ends_on, member.status
    into committee_start, committee_end, member_status
    from public.mosque_committee_members as member
    join public.mosque_committees as committee on committee.id = member.committee_id
    where member.id = new.member_id;

  if not found or new.created_by is distinct from auth.uid() then
    raise exception 'A valid committee member and authenticated reviewer are required.';
  end if;
  if member_status = 'candidate' then
    raise exception 'Performance reviews are only for members who served on the committee.';
  end if;
  if new.period_starts_on < committee_start or new.period_ends_on > committee_end then
    raise exception 'The review period must fall within the committee member term.';
  end if;
  return new;
end;
$$;

create trigger mosque_committee_performance_reviews_validate
before insert on public.mosque_committee_performance_reviews
for each row execute function public.validate_mosque_committee_performance_review();

alter table public.mosque_committee_performance_reviews enable row level security;
revoke all on public.mosque_committee_performance_reviews from public, anon, authenticated;
grant select, insert on public.mosque_committee_performance_reviews to authenticated;

create policy mosque_committee_performance_reviews_read
on public.mosque_committee_performance_reviews for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));

create policy mosque_committee_performance_reviews_create
on public.mosque_committee_performance_reviews for insert to authenticated
with check (
  public.has_masjid_role(array['admin', 'mosque_manager'])
  and created_by = auth.uid()
);

create or replace function public.search_mosque_committee_history(p_search text)
returns table (
  member_id uuid,
  committee_id uuid,
  committee_title text,
  mosque_id uuid,
  mosque_name text,
  term_starts_on date,
  term_ends_on date,
  committee_status text,
  full_name text,
  phone text,
  cnic_last_digit text,
  member_position text,
  department text,
  member_status text
)
language sql
stable
set search_path = ''
as $$
  with search_terms as (
    select btrim(coalesce(p_search, '')) as search_text,
      regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g') as digits
  )
  select member.id, committee.id, committee.title, mosque.id, mosque.name,
    committee.term_starts_on, committee.term_ends_on, committee.status,
    member.full_name, member.phone, right(member.cnic_number, 1), member.member_position,
    member.department, member.status
  from public.mosque_committee_members as member
  join public.mosque_committees as committee on committee.id = member.committee_id
  join public.mosque_registrations as mosque on mosque.id = committee.mosque_id
  cross join search_terms
  where public.has_masjid_role(array['admin', 'mosque_manager'])
    and length(search_terms.search_text) >= 3
    and (
      (length(search_terms.digits) = 13 and member.cnic_number = search_terms.digits)
      or (
        length(search_terms.digits) between 7 and 14
        and regexp_replace(member.phone, '[^0-9]', '', 'g') = search_terms.digits
      )
      or member.full_name ilike '%' || search_terms.search_text || '%'
    )
  order by member.full_name, committee.term_starts_on desc
  limit 100;
$$;

revoke all on function public.search_mosque_committee_history(text) from public, anon;
grant execute on function public.search_mosque_committee_history(text) to authenticated;

commit;
