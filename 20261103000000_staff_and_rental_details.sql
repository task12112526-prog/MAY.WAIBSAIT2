begin;

set local search_path = public, extensions;

create sequence if not exists public.masjid_staff_number_seq;
create sequence if not exists public.masjid_property_number_seq;
create sequence if not exists public.masjid_tenant_number_seq;
create sequence if not exists public.masjid_lease_number_seq;
create sequence if not exists public.masjid_rent_receipt_seq;
create sequence if not exists public.masjid_salary_receipt_seq;

alter table public.staff_members
  add column if not exists staff_number text not null default ('STF-' || lpad(nextval('public.masjid_staff_number_seq')::text, 6, '0')),
  add column if not exists staff_type text not null default 'other',
  add column if not exists national_id text,
  add column if not exists salary_frequency text not null default 'monthly',
  add column if not exists address text,
  add column if not exists emergency_contact text,
  add column if not exists notes text;

alter table public.rental_properties
  add column if not exists property_number text not null default ('PRP-' || lpad(nextval('public.masjid_property_number_seq')::text, 6, '0')),
  add column if not exists unit_number text,
  add column if not exists electricity_meter text,
  add column if not exists gas_meter text;

alter table public.tenants
  add column if not exists tenant_number text not null default ('TNT-' || lpad(nextval('public.masjid_tenant_number_seq')::text, 6, '0')),
  add column if not exists tenant_type text not null default 'other',
  add column if not exists business_name text,
  add column if not exists address text,
  add column if not exists emergency_contact text,
  add column if not exists notes text;

alter table public.rental_leases
  add column if not exists lease_number text not null default ('LSE-' || lpad(nextval('public.masjid_lease_number_seq')::text, 6, '0')),
  add column if not exists annual_increase_percent numeric(5,2) not null default 0,
  add column if not exists agreement_reference text,
  add column if not exists notes text;

alter table public.rent_payments
  add column if not exists receipt_number text not null default ('RNT-' || lpad(nextval('public.masjid_rent_receipt_seq')::text, 8, '0')),
  add column if not exists received_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists notes text;

create unique index if not exists staff_members_staff_number_uidx on public.staff_members(staff_number);
create unique index if not exists rental_properties_property_number_uidx on public.rental_properties(property_number);
create unique index if not exists tenants_tenant_number_uidx on public.tenants(tenant_number);
create unique index if not exists rental_leases_lease_number_uidx on public.rental_leases(lease_number);
create unique index if not exists rent_payments_receipt_number_uidx on public.rent_payments(receipt_number);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_members_staff_type_check') then
    alter table public.staff_members add constraint staff_members_staff_type_check
      check (staff_type in ('imam', 'muezzin', 'khadim', 'teacher', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_members_salary_frequency_check') then
    alter table public.staff_members add constraint staff_members_salary_frequency_check
      check (salary_frequency in ('monthly', 'weekly', 'daily'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_tenant_type_check') then
    alter table public.tenants add constraint tenants_tenant_type_check
      check (tenant_type in ('shopkeeper', 'resident', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rental_leases_annual_increase_check') then
    alter table public.rental_leases add constraint rental_leases_annual_increase_check
      check (annual_increase_percent between 0 and 100);
  end if;
end
$$;

create table if not exists public.staff_salary_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique default ('SAL-' || lpad(nextval('public.masjid_salary_receipt_seq')::text, 8, '0')),
  staff_id uuid not null references public.staff_members(id) on delete restrict,
  salary_period text not null check (salary_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null default current_date,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'online')),
  reference text,
  notes text,
  paid_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists staff_salary_payments_staff_period_idx
  on public.staff_salary_payments(staff_id, salary_period, paid_at desc);
create index if not exists staff_salary_payments_paid_at_idx
  on public.staff_salary_payments(paid_at desc);
create index if not exists staff_salary_payments_period_search_idx
  on public.staff_salary_payments using gin (salary_period gin_trgm_ops);

create or replace view public.rent_due_status
with (security_invoker = true)
as
select
  l.id as lease_id,
  l.lease_number,
  p.name as property_name,
  p.property_number,
  t.full_name as tenant_name,
  t.tenant_number,
  to_char(current_date, 'YYYY-MM') as period,
  l.monthly_rent,
  coalesce(sum(rp.amount), 0)::numeric(12,2) as paid_amount,
  greatest(l.monthly_rent - coalesce(sum(rp.amount), 0), 0)::numeric(12,2) as balance_due,
  make_date(
    extract(year from current_date)::integer,
    extract(month from current_date)::integer,
    least(l.rent_due_day, extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::integer)
  ) as due_date
from public.rental_leases l
join public.rental_properties p on p.id = l.property_id
join public.tenants t on t.id = l.tenant_id
left join public.rent_payments rp on rp.lease_id = l.id and rp.period = to_char(current_date, 'YYYY-MM')
where l.status = 'active'
  and l.start_date <= current_date
  and (l.end_date is null or l.end_date >= current_date)
group by l.id, p.name, p.property_number, t.full_name, t.tenant_number;

create or replace function public.sync_staff_salary_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare staff_name text;
begin
  if tg_op = 'DELETE' then
    delete from public.financial_transactions where source_type = 'staff_salary' and source_id = old.id;
    return old;
  end if;
  select full_name into staff_name from public.staff_members where id = new.staff_id;
  insert into public.financial_transactions(entry_type, category, description, amount, entry_date, reference, source_type, source_id)
  values ('expense', 'salary', 'Salary payment: ' || coalesce(staff_name, 'staff'), new.amount, new.paid_at, coalesce(new.reference, new.receipt_number), 'staff_salary', new.id)
  on conflict (source_type, source_id) do update set
    description = excluded.description,
    amount = excluded.amount,
    entry_date = excluded.entry_date,
    reference = excluded.reference;
  return new;
end;
$$;

create trigger staff_salary_payments_sync_transaction
after insert or update or delete on public.staff_salary_payments
for each row execute function public.sync_staff_salary_transaction();

alter table public.staff_salary_payments enable row level security;

create policy staff_salary_payments_read on public.staff_salary_payments for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']));
create policy staff_salary_payments_manage on public.staff_salary_payments for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager']));

grant select on public.rent_due_status to authenticated;
grant select, insert, update, delete on public.staff_salary_payments to authenticated;
revoke all on public.rent_due_status, public.staff_salary_payments from anon;
revoke all on function public.sync_staff_salary_transaction() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
