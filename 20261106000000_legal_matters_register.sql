begin;

create sequence public.legal_matter_number_seq;

create table public.legal_matters (
  id uuid primary key default gen_random_uuid(),
  matter_number text not null unique,
  title text not null check (length(btrim(title)) between 1 and 200),
  matter_area text not null check (matter_area in ('mosque', 'shop', 'employee')),
  reference_number text,
  related_party text,
  opened_on date not null default current_date,
  deadline date,
  status text not null default 'open' check (status in ('open', 'waiting', 'resolved', 'closed')),
  lawyer_contact text,
  summary text not null check (length(btrim(summary)) between 1 and 10000),
  next_action text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deadline is null or deadline >= opened_on)
);

create index legal_matters_area_status_idx on public.legal_matters(matter_area, status);
create index legal_matters_deadline_idx on public.legal_matters(deadline)
  where deadline is not null and status not in ('resolved', 'closed');
create index legal_matters_search_title_idx on public.legal_matters using gin (title public.gin_trgm_ops);

create or replace function public.set_legal_matter_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.assign_legal_matter_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.matter_number is null or new.matter_number = '' then
    new.matter_number := 'LGL-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.legal_matter_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

alter table public.legal_matters alter column matter_number drop default;
create trigger legal_matters_assign_number
before insert on public.legal_matters
for each row execute function public.assign_legal_matter_number();
create trigger legal_matters_set_updated_at
before update on public.legal_matters
for each row execute function public.set_legal_matter_updated_at();

alter table public.legal_matters enable row level security;
revoke all on public.legal_matters from public, anon;
revoke all on sequence public.legal_matter_number_seq from public, anon, authenticated;
grant select, insert, update, delete on public.legal_matters to authenticated;
revoke all on function public.assign_legal_matter_number() from public, anon, authenticated;

create policy legal_matters_read on public.legal_matters for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));

create policy legal_matters_create on public.legal_matters for insert to authenticated
with check (public.has_masjid_role(array['admin', 'mosque_manager']) and created_by = auth.uid());

create policy legal_matters_update on public.legal_matters for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager']));

create policy legal_matters_delete on public.legal_matters for delete to authenticated
using (public.has_masjid_role(array['admin']));

commit;
