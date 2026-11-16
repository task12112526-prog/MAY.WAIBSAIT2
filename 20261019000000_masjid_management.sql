begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

set local search_path = public, extensions;

create or replace function public.has_masjid_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = any(required_roles), false);
$$;

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  job_title text not null,
  monthly_salary numeric(12,2) not null default 0 check (monthly_salary >= 0),
  start_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table public.rental_properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  property_type text not null check (property_type in ('shop', 'house', 'hall', 'other')),
  address text not null,
  monthly_rent numeric(12,2) not null default 0 check (monthly_rent >= 0),
  status text not null default 'vacant' check (status in ('vacant', 'occupied', 'maintenance')),
  created_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  national_id text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table public.rental_leases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  start_date date not null,
  end_date date,
  rent_due_day integer not null default 1 check (rent_due_day between 1 and 31),
  security_deposit numeric(12,2) not null default 0 check (security_deposit >= 0),
  status text not null default 'active' check (status in ('active', 'ended', 'pending')),
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create or replace function public.sync_property_occupancy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.property_id is distinct from new.property_id) then
    update public.rental_properties p
    set status = case when exists (
      select 1 from public.rental_leases l where l.property_id = old.property_id and l.status = 'active'
        and l.start_date <= current_date and (l.end_date is null or l.end_date >= current_date)
    ) then 'occupied' else 'vacant' end
    where p.id = old.property_id and p.status <> 'maintenance';
  end if;
  if tg_op <> 'DELETE' then
    update public.rental_properties p
    set status = case when exists (
      select 1 from public.rental_leases l where l.property_id = new.property_id and l.status = 'active'
        and l.start_date <= current_date and (l.end_date is null or l.end_date >= current_date)
    ) then 'occupied' else 'vacant' end
    where p.id = new.property_id and p.status <> 'maintenance';
    return new;
  end if;
  return old;
end;
$$;

create trigger rental_leases_sync_occupancy
after insert or update or delete on public.rental_leases
for each row execute function public.sync_property_occupancy();

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('income', 'expense')),
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  entry_date date not null default current_date,
  reference text,
  source_type text,
  source_id uuid,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create table public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.rental_leases(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  period text not null,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'online')),
  reference text,
  created_at timestamptz not null default now()
);

create table public.utility_bills (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete restrict,
  utility_type text not null check (utility_type in ('electricity', 'gas', 'water', 'other')),
  billing_period text not null,
  amount numeric(12,2) not null check (amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  due_date date not null,
  paid_at date,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'overdue')),
  created_at timestamptz not null default now(),
  unique (property_id, utility_type, billing_period)
);

create or replace function public.set_utility_bill_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.paid_amount >= new.amount then
    new.status := 'paid';
    new.paid_at := coalesce(new.paid_at, current_date);
  elsif new.due_date < current_date then
    new.status := 'overdue';
    new.paid_at := null;
  else
    new.status := 'unpaid';
    new.paid_at := null;
  end if;
  return new;
end;
$$;

create trigger utility_bills_set_status
before insert or update on public.utility_bills
for each row execute function public.set_utility_bill_status();

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete restrict,
  requested_by_user uuid references auth.users(id) on delete set null default auth.uid(),
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed')),
  requested_at timestamptz not null default now()
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique default ('DON-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  donor_name text not null,
  donor_phone text,
  donation_type text not null check (donation_type in ('general', 'zakat', 'sadaqah', 'fitrana', 'construction')),
  amount numeric(12,2) not null check (amount > 0),
  donation_date date not null default current_date,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'online')),
  notes text,
  created_at timestamptz not null default now()
);

create table public.prayer_schedules (
  id uuid primary key default gen_random_uuid(),
  prayer_name text not null check (prayer_name in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah')),
  adhan_time time not null,
  jamaat_time time not null,
  effective_from date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (prayer_name, effective_from)
);

create table public.worshippers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  family_size integer not null default 1 check (family_size > 0),
  contact_consent boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  check (contact_consent or (phone is null and email is null))
);

create table public.prayer_attendance (
  id uuid primary key default gen_random_uuid(),
  prayer_date date not null default current_date,
  prayer_name text not null check (prayer_name in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah')),
  attendance_mode text not null check (attendance_mode in ('aggregate', 'individual')),
  attendee_count integer not null default 1 check (attendee_count >= 0),
  worshipper_id uuid references public.worshippers(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((attendance_mode = 'aggregate' and worshipper_id is null) or
         (attendance_mode = 'individual' and worshipper_id is not null and attendee_count = 1))
);

create or replace function public.set_prayer_attendance_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.attendance_mode = 'individual' then
    select w.user_id into new.user_id from public.worshippers w where w.id = new.worshipper_id;
  else
    new.user_id := null;
  end if;
  return new;
end;
$$;

create trigger prayer_attendance_set_owner
before insert or update on public.prayer_attendance
for each row execute function public.set_prayer_attendance_owner();

create table public.community_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  program_type text not null check (program_type in ('quran', 'dars', 'youth', 'community')),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  instructor_name text,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create table public.program_registrations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.community_programs(id) on delete cascade,
  worshipper_id uuid not null references public.worshippers(id) on delete cascade,
  registered_at timestamptz not null default now(),
  status text not null default 'registered' check (status in ('registered', 'attended', 'cancelled')),
  unique (program_id, worshipper_id)
);

create table public.facility_bookings (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  event_name text not null,
  requested_by text not null,
  requested_by_user uuid references auth.users(id) on delete set null default auth.uid(),
  requester_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'public' check (audience in ('public', 'tenants', 'worshippers', 'staff')),
  publish_at timestamptz not null default now(),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'system',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index rental_leases_property_status_idx on public.rental_leases(property_id, status);
create index rental_leases_tenant_status_idx on public.rental_leases(tenant_id, status);
create index rent_payments_lease_date_idx on public.rent_payments(lease_id, payment_date desc);
create index rent_payments_period_idx on public.rent_payments(period);
create index utility_bills_due_date_idx on public.utility_bills(due_date desc);
create index maintenance_property_date_idx on public.maintenance_requests(property_id, requested_at desc);
create index financial_transactions_date_idx on public.financial_transactions(entry_date desc);
create index donations_date_idx on public.donations(donation_date desc);
create index prayer_schedules_effective_idx on public.prayer_schedules(prayer_name, effective_from desc) where active;
create index prayer_attendance_date_idx on public.prayer_attendance(prayer_date desc, prayer_name);
create index community_programs_starts_idx on public.community_programs(starts_at) where status = 'upcoming';
create index announcements_publication_idx on public.announcements(publish_at desc) where active;
create index user_notifications_user_idx on public.user_notifications(user_id, created_at desc);
create index staff_members_search_name_idx on public.staff_members using gin (full_name gin_trgm_ops);
create index staff_members_search_email_idx on public.staff_members using gin (email gin_trgm_ops);
create index staff_members_search_title_idx on public.staff_members using gin (job_title gin_trgm_ops);
create index rental_properties_search_name_idx on public.rental_properties using gin (name gin_trgm_ops);
create index rental_properties_search_address_idx on public.rental_properties using gin (address gin_trgm_ops);
create index tenants_search_name_idx on public.tenants using gin (full_name gin_trgm_ops);
create index tenants_search_phone_idx on public.tenants using gin (phone gin_trgm_ops);
create index tenants_search_email_idx on public.tenants using gin (email gin_trgm_ops);
create index tenants_search_national_id_idx on public.tenants using gin (national_id gin_trgm_ops);
create index rental_leases_search_status_idx on public.rental_leases using gin (status gin_trgm_ops);
create index rent_payments_search_period_idx on public.rent_payments using gin (period gin_trgm_ops);
create index rent_payments_search_reference_idx on public.rent_payments using gin (reference gin_trgm_ops);
create index rent_payments_search_method_idx on public.rent_payments using gin (payment_method gin_trgm_ops);
create index utility_bills_search_type_idx on public.utility_bills using gin (utility_type gin_trgm_ops);
create index utility_bills_search_period_idx on public.utility_bills using gin (billing_period gin_trgm_ops);
create index utility_bills_search_status_idx on public.utility_bills using gin (status gin_trgm_ops);
create index maintenance_search_title_idx on public.maintenance_requests using gin (title gin_trgm_ops);
create index maintenance_search_description_idx on public.maintenance_requests using gin (description gin_trgm_ops);
create index maintenance_search_status_idx on public.maintenance_requests using gin (status gin_trgm_ops);
create index financial_transactions_search_type_idx on public.financial_transactions using gin (entry_type gin_trgm_ops);
create index financial_transactions_search_category_idx on public.financial_transactions using gin (category gin_trgm_ops);
create index financial_transactions_search_description_idx on public.financial_transactions using gin (description gin_trgm_ops);
create index financial_transactions_search_reference_idx on public.financial_transactions using gin (reference gin_trgm_ops);
create index donations_search_receipt_idx on public.donations using gin (receipt_number gin_trgm_ops);
create index donations_search_name_idx on public.donations using gin (donor_name gin_trgm_ops);
create index donations_search_phone_idx on public.donations using gin (donor_phone gin_trgm_ops);
create index donations_search_type_idx on public.donations using gin (donation_type gin_trgm_ops);
create index prayer_attendance_search_prayer_idx on public.prayer_attendance using gin (prayer_name gin_trgm_ops);
create index prayer_attendance_search_mode_idx on public.prayer_attendance using gin (attendance_mode gin_trgm_ops);
create index worshippers_search_name_idx on public.worshippers using gin (full_name gin_trgm_ops);
create index worshippers_search_phone_idx on public.worshippers using gin (phone gin_trgm_ops);
create index worshippers_search_email_idx on public.worshippers using gin (email gin_trgm_ops);
create index community_programs_search_name_idx on public.community_programs using gin (name gin_trgm_ops);
create index community_programs_search_description_idx on public.community_programs using gin (description gin_trgm_ops);
create index community_programs_search_instructor_idx on public.community_programs using gin (instructor_name gin_trgm_ops);
create index community_programs_search_type_idx on public.community_programs using gin (program_type gin_trgm_ops);
create index community_programs_search_status_idx on public.community_programs using gin (status gin_trgm_ops);
create index facility_bookings_search_facility_idx on public.facility_bookings using gin (facility_name gin_trgm_ops);
create index facility_bookings_search_event_idx on public.facility_bookings using gin (event_name gin_trgm_ops);
create index facility_bookings_search_requester_idx on public.facility_bookings using gin (requested_by gin_trgm_ops);
create index facility_bookings_search_status_idx on public.facility_bookings using gin (status gin_trgm_ops);
create index registrations_search_status_idx on public.program_registrations using gin (status gin_trgm_ops);
create index announcements_search_title_idx on public.announcements using gin (title gin_trgm_ops);
create index announcements_search_body_idx on public.announcements using gin (body gin_trgm_ops);

create or replace function public.sync_donation_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.financial_transactions where source_type = 'donation' and source_id = old.id;
    return old;
  end if;
  insert into public.financial_transactions(entry_type, category, description, amount, entry_date, reference, source_type, source_id)
  values ('income', new.donation_type, 'Donation from ' || new.donor_name, new.amount, new.donation_date, new.receipt_number, 'donation', new.id)
  on conflict (source_type, source_id) do update set
    category = excluded.category, description = excluded.description, amount = excluded.amount,
    entry_date = excluded.entry_date, reference = excluded.reference;
  return new;
end;
$$;

create trigger donations_sync_transaction
after insert or update or delete on public.donations
for each row execute function public.sync_donation_transaction();

create or replace function public.sync_rent_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare lease_property text;
begin
  if tg_op = 'DELETE' then
    delete from public.financial_transactions where source_type = 'rent_payment' and source_id = old.id;
    return old;
  end if;
  select p.name into lease_property
  from public.rental_leases l join public.rental_properties p on p.id = l.property_id
  where l.id = new.lease_id;
  insert into public.financial_transactions(entry_type, category, description, amount, entry_date, reference, source_type, source_id)
  values ('income', 'rent', 'Rent payment: ' || coalesce(lease_property, 'property'), new.amount, new.payment_date, new.reference, 'rent_payment', new.id)
  on conflict (source_type, source_id) do update set
    description = excluded.description, amount = excluded.amount, entry_date = excluded.entry_date, reference = excluded.reference;
  return new;
end;
$$;

create trigger rent_payments_sync_transaction
after insert or update or delete on public.rent_payments
for each row execute function public.sync_rent_transaction();

create or replace function public.sync_utility_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare property_name text;
begin
  if tg_op = 'DELETE' then
    delete from public.financial_transactions where source_type = 'utility_bill' and source_id = old.id;
    return old;
  end if;
  select name into property_name from public.rental_properties where id = new.property_id;
  if new.paid_amount > 0 then
    insert into public.financial_transactions(entry_type, category, description, amount, entry_date, reference, source_type, source_id)
    values ('expense', new.utility_type, new.utility_type || ' bill: ' || coalesce(property_name, 'property'), new.paid_amount, coalesce(new.paid_at, new.due_date), new.billing_period, 'utility_bill', new.id)
    on conflict (source_type, source_id) do update set
      category = excluded.category, description = excluded.description, amount = excluded.amount,
      entry_date = excluded.entry_date, reference = excluded.reference;
  else
    delete from public.financial_transactions where source_type = 'utility_bill' and source_id = new.id;
  end if;
  return new;
end;
$$;

create trigger utility_bills_sync_transaction
after insert or update or delete on public.utility_bills
for each row execute function public.sync_utility_transaction();

create or replace function public.masjid_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  can_finance boolean := public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']);
  can_property boolean := public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']);
  can_community boolean := public.has_masjid_role(array['admin', 'mosque_manager', 'imam']);
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'incomeThisMonth', case when can_finance then coalesce((select sum(amount) from public.financial_transactions where entry_type = 'income' and entry_date >= date_trunc('month', current_date)::date), 0) else 0 end,
    'expensesThisMonth', case when can_finance then coalesce((select sum(amount) from public.financial_transactions where entry_type = 'expense' and entry_date >= date_trunc('month', current_date)::date), 0) else 0 end,
    'outstandingRent', case when can_property then coalesce((
      select sum(greatest(l.monthly_rent - coalesce(paid.amount, 0), 0))
      from public.rental_leases l
      left join lateral (
        select sum(rp.amount) as amount from public.rent_payments rp
        where rp.lease_id = l.id and rp.period = to_char(current_date, 'YYYY-MM')
      ) paid on true
      where l.status = 'active' and l.start_date <= current_date and (l.end_date is null or l.end_date >= current_date)
    ), 0) else 0 end,
    'occupiedProperties', case when can_property then (select count(*) from public.rental_properties where status = 'occupied') else 0 end,
    'totalProperties', case when can_property then (select count(*) from public.rental_properties) else 0 end,
    'worshipperCount', case when can_community then (select count(*) from public.worshippers where status = 'active') else 0 end,
    'donationsThisMonth', case when can_finance then coalesce((select sum(amount) from public.donations where donation_date >= date_trunc('month', current_date)::date), 0) else 0 end,
    'prayerAttendanceToday', case when can_community then coalesce((select sum(attendee_count) from public.prayer_attendance where prayer_date = current_date), 0) else 0 end,
    'todayPrayerTimes', coalesce((
      select jsonb_agg(jsonb_build_object('prayer_name', schedule.prayer_name, 'jamaat_time', schedule.jamaat_time))
      from (
        select distinct on (prayer_name) prayer_name, jamaat_time
        from public.prayer_schedules
        where active and effective_from <= current_date
        order by prayer_name, effective_from desc
      ) schedule
    ), '[]'::jsonb),
    'monthlyTrend', case when can_finance then coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(months.month_start, 'Mon'), 'income', coalesce(totals.income, 0), 'expenses', coalesce(totals.expenses, 0)) order by months.month_start)
      from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') as months(month_start)
      left join lateral (
        select sum(amount) filter (where entry_type = 'income') as income,
               sum(amount) filter (where entry_type = 'expense') as expenses
        from public.financial_transactions
        where entry_date >= months.month_start::date and entry_date < (months.month_start + interval '1 month')::date
      ) totals on true
    ), '[]'::jsonb) else '[]'::jsonb end,
    'recentTransactions', case when can_finance then coalesce((
      select jsonb_agg(jsonb_build_object('id', recent.id, 'entry_type', recent.entry_type, 'category', recent.category, 'amount', recent.amount, 'entry_date', recent.entry_date, 'description', recent.description) order by recent.entry_date desc)
      from (select id, entry_type, category, amount, entry_date, description from public.financial_transactions order by entry_date desc, created_at desc limit 6) recent
    ), '[]'::jsonb) else '[]'::jsonb end,
    'upcomingPrograms', coalesce((
      select jsonb_agg(jsonb_build_object('id', upcoming.id, 'name', upcoming.name, 'starts_at', upcoming.starts_at, 'program_type', upcoming.program_type) order by upcoming.starts_at)
      from (select id, name, starts_at, program_type from public.community_programs where starts_at >= now() and status = 'upcoming' order by starts_at limit 5) upcoming
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

alter table public.staff_members enable row level security;
alter table public.rental_properties enable row level security;
alter table public.tenants enable row level security;
alter table public.rental_leases enable row level security;
alter table public.rent_payments enable row level security;
alter table public.utility_bills enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.donations enable row level security;
alter table public.prayer_schedules enable row level security;
alter table public.prayer_attendance enable row level security;
alter table public.worshippers enable row level security;
alter table public.community_programs enable row level security;
alter table public.program_registrations enable row level security;
alter table public.facility_bookings enable row level security;
alter table public.announcements enable row level security;
alter table public.user_notifications enable row level security;

create policy staff_read on public.staff_members for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']) or user_id = auth.uid());
create policy staff_manage on public.staff_members for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager']));

create policy properties_read on public.rental_properties for select to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']) or
  exists (
    select 1 from public.rental_leases l join public.tenants t on t.id = l.tenant_id
    where l.property_id = rental_properties.id and t.user_id = auth.uid() and l.status = 'active'
  )
);
create policy properties_manage on public.rental_properties for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']));

create policy tenants_read on public.tenants for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']) or user_id = auth.uid());
create policy tenants_manage on public.tenants for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']));

create policy leases_read on public.rental_leases for select to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']) or
  exists (select 1 from public.tenants t where t.id = tenant_id and t.user_id = auth.uid())
);
create policy leases_manage on public.rental_leases for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']));

create policy rent_payments_read on public.rent_payments for select to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager', 'accountant']) or
  exists (select 1 from public.rental_leases l join public.tenants t on t.id = l.tenant_id where l.id = lease_id and t.user_id = auth.uid())
);
create policy rent_payments_manage on public.rent_payments for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']));

create policy utility_bills_read on public.utility_bills for select to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']) or
  exists (select 1 from public.rental_leases l join public.tenants t on t.id = l.tenant_id where l.property_id = utility_bills.property_id and t.user_id = auth.uid() and l.status = 'active')
);
create policy utility_bills_manage on public.utility_bills for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']));

create policy maintenance_read on public.maintenance_requests for select to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']) or
  requested_by_user = auth.uid()
);
create policy maintenance_create on public.maintenance_requests for insert to authenticated
with check (
  (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager'])) or
  (requested_by_user = auth.uid() and exists (
    select 1 from public.rental_leases l join public.tenants t on t.id = l.tenant_id
    where l.property_id = maintenance_requests.property_id and t.user_id = auth.uid() and l.status = 'active'
  ))
);
create policy maintenance_manage on public.maintenance_requests for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']));
create policy maintenance_delete on public.maintenance_requests for delete to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));

create policy finance_read on public.financial_transactions for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']));
create policy finance_create on public.financial_transactions for insert to authenticated
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']) and source_type is null and source_id is null);
create policy finance_update on public.financial_transactions for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']) and source_type is null)
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']) and source_type is null);
create policy finance_delete on public.financial_transactions for delete to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']) and source_type is null);

create policy donations_read on public.donations for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']));
create policy donations_manage on public.donations for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']));

create policy prayer_schedules_read on public.prayer_schedules for select to authenticated
using (true);
create policy prayer_schedules_manage on public.prayer_schedules for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']));

create policy worshippers_read on public.worshippers for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']) or user_id = auth.uid());
create policy worshippers_manage on public.worshippers for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']));

create policy prayer_attendance_read on public.prayer_attendance for select to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'imam']) or
  (attendance_mode = 'individual' and user_id = auth.uid())
);
create policy prayer_attendance_manage on public.prayer_attendance for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']));

create policy programs_read on public.community_programs for select to authenticated
using (true);
create policy programs_manage on public.community_programs for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']));

create policy registrations_read on public.program_registrations for select to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'imam']) or
  exists (select 1 from public.worshippers w where w.id = worshipper_id and w.user_id = auth.uid())
);
create policy registrations_create on public.program_registrations for insert to authenticated
with check (
  public.has_masjid_role(array['admin', 'mosque_manager', 'imam']) or
  (status = 'registered' and exists (select 1 from public.worshippers w where w.id = worshipper_id and w.user_id = auth.uid()))
);
create policy registrations_manage on public.program_registrations for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']));
create policy registrations_delete on public.program_registrations for delete to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));

create policy bookings_read on public.facility_bookings for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']) or requested_by_user = auth.uid());
create policy bookings_create on public.facility_bookings for insert to authenticated
with check (requested_by_user = auth.uid() and status = 'pending');
create policy bookings_manage on public.facility_bookings for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'imam']));
create policy bookings_delete on public.facility_bookings for delete to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));

create policy announcements_read on public.announcements for select to authenticated
using (
  (active and publish_at <= now() and audience = 'public') or
  (active and publish_at <= now() and audience = 'tenants' and public.has_masjid_role(array['tenant'])) or
  (active and publish_at <= now() and audience = 'worshippers' and public.has_masjid_role(array['worshipper'])) or
  (active and publish_at <= now() and audience = 'staff' and public.has_masjid_role(array['admin', 'mosque_manager', 'accountant', 'property_manager', 'imam'])) or
  public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager', 'imam'])
);
create policy announcements_manage on public.announcements for all to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager', 'property_manager']));

create policy notifications_read on public.user_notifications for select to authenticated
using (user_id = auth.uid());
create policy notifications_update on public.user_notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant usage on schema public to authenticated;
revoke all on public.staff_members, public.rental_properties, public.tenants, public.rental_leases,
  public.rent_payments, public.utility_bills, public.maintenance_requests,
  public.financial_transactions, public.donations, public.prayer_schedules,
  public.prayer_attendance, public.worshippers, public.community_programs,
  public.program_registrations, public.facility_bookings, public.announcements,
  public.user_notifications from anon;
grant select, insert, update, delete on
  public.staff_members, public.rental_properties, public.tenants, public.rental_leases,
  public.rent_payments, public.utility_bills, public.maintenance_requests,
  public.financial_transactions, public.donations, public.prayer_schedules,
  public.prayer_attendance, public.worshippers, public.community_programs,
  public.program_registrations, public.facility_bookings, public.announcements,
  public.user_notifications to authenticated;
revoke all on function public.has_masjid_role(text[]) from public, anon;
revoke all on function public.masjid_dashboard_summary() from public, anon;
revoke all on function public.sync_property_occupancy() from public, anon, authenticated;
revoke all on function public.set_utility_bill_status() from public, anon, authenticated;
revoke all on function public.set_prayer_attendance_owner() from public, anon, authenticated;
revoke all on function public.sync_donation_transaction() from public, anon, authenticated;
revoke all on function public.sync_rent_transaction() from public, anon, authenticated;
revoke all on function public.sync_utility_transaction() from public, anon, authenticated;
grant execute on function public.has_masjid_role(text[]) to authenticated;
grant execute on function public.masjid_dashboard_summary() to authenticated;

commit;
