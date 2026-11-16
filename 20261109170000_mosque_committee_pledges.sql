begin;

create table public.mosque_committee_pledges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique
    references public.mosque_committee_members(id) on delete restrict,
  pledge_text text not null check (length(btrim(pledge_text)) between 1 and 5000),
  affirmed_on date not null,
  witness_names text[] not null check (
    cardinality(witness_names) between 1 and 4
    and array_position(witness_names, '') is null
  ),
  recorded_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index mosque_committee_pledges_affirmed_on_idx
  on public.mosque_committee_pledges(affirmed_on desc);

create or replace function public.validate_mosque_committee_pledge()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  member_status text;
  committee_status text;
  term_start date;
  term_end date;
begin
  select member.status, committee.status, committee.term_starts_on, committee.term_ends_on
    into member_status, committee_status, term_start, term_end
    from public.mosque_committee_members as member
    join public.mosque_committees as committee on committee.id = member.committee_id
    where member.id = new.member_id;

  if not found or member_status <> 'active' or committee_status <> 'active' then
    raise exception 'A pledge can only be recorded for an appointed member of an active committee.';
  end if;
  if new.affirmed_on < term_start or new.affirmed_on > term_end or new.affirmed_on > current_date then
    raise exception 'The affirmation date must fall within the committee term and cannot be in the future.';
  end if;
  if new.recorded_by is distinct from auth.uid() then
    raise exception 'The recorded-by user must match the authenticated user.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger mosque_committee_pledges_validate
before insert on public.mosque_committee_pledges
for each row execute function public.validate_mosque_committee_pledge();

alter table public.mosque_committee_pledges enable row level security;
revoke all on public.mosque_committee_pledges from public, anon, authenticated;
grant select, insert on public.mosque_committee_pledges to authenticated;

create policy mosque_committee_pledges_read on public.mosque_committee_pledges
for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));

create policy mosque_committee_pledges_create on public.mosque_committee_pledges
for insert to authenticated
with check (
  public.has_masjid_role(array['admin', 'mosque_manager'])
  and recorded_by = auth.uid()
);

commit;
