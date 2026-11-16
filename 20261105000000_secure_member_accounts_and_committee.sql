begin;

create table public.masjid_member_accounts (
  member_number text primary key check (member_number ~ '^USER-00[1-9]$'),
  full_name text not null check (length(btrim(full_name)) between 1 and 100),
  email text not null,
  role text not null check (role in ('imam', 'committee', 'worshipper')),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  worshipper_id uuid unique references public.worshippers(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'invited', 'active', 'error')),
  created_at timestamptz not null default now()
);

create unique index masjid_member_accounts_email_idx on public.masjid_member_accounts (lower(email));
alter table public.masjid_member_accounts enable row level security;
revoke all on public.masjid_member_accounts from public, anon, authenticated;
grant all on public.masjid_member_accounts to service_role;

create policy prayer_schedules_committee_manage on public.prayer_schedules for all to authenticated
using (public.has_masjid_role(array['committee']))
with check (public.has_masjid_role(array['committee']));

create policy worshippers_committee_read on public.worshippers for select to authenticated
using (public.has_masjid_role(array['committee']));
create policy worshippers_committee_manage on public.worshippers for all to authenticated
using (public.has_masjid_role(array['committee']))
with check (public.has_masjid_role(array['committee']));

create policy prayer_attendance_committee_read on public.prayer_attendance for select to authenticated
using (public.has_masjid_role(array['committee']));
create policy prayer_attendance_committee_manage on public.prayer_attendance for all to authenticated
using (public.has_masjid_role(array['committee']))
with check (public.has_masjid_role(array['committee']));

create policy programs_committee_manage on public.community_programs for all to authenticated
using (public.has_masjid_role(array['committee']))
with check (public.has_masjid_role(array['committee']));

create policy registrations_committee_read on public.program_registrations for select to authenticated
using (public.has_masjid_role(array['committee']));
create policy registrations_committee_manage on public.program_registrations for all to authenticated
using (public.has_masjid_role(array['committee']))
with check (public.has_masjid_role(array['committee']));

create policy announcements_community_read on public.announcements for select to authenticated
using (public.has_masjid_role(array['imam', 'committee']));
create policy announcements_community_manage on public.announcements for all to authenticated
using (public.has_masjid_role(array['imam', 'committee']))
with check (public.has_masjid_role(array['imam', 'committee']));

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
  can_community boolean := public.has_masjid_role(array['admin', 'mosque_manager', 'imam', 'committee']);
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

commit;
