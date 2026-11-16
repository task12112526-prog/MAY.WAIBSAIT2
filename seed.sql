-- Fictional development records only. Requires all schema migrations; safe to rerun.
begin;

-- If multiple mosques are registered, set this to the intended mosque UUID.
-- Example: set local app.masjid_id = '00000000-0000-0000-0000-000000000000';
do $$
declare
  selected_mosque uuid;
  mosque_count integer;
  configured_id text;
begin
  configured_id := nullif(current_setting('app.masjid_id', true), '');
  if configured_id is not null then
    selected_mosque := configured_id::uuid;
    if not exists (select 1 from public.mosque_registrations where id = selected_mosque) then
      raise exception 'The configured app.masjid_id does not match a registered mosque.';
    end if;
  else
    select count(*), (array_agg(id))[1] into mosque_count, selected_mosque
      from public.mosque_registrations;
    if mosque_count = 0 then
      raise exception 'Register a mosque before loading seed data.';
    elsif mosque_count > 1 then
      raise exception 'More than one mosque is registered. Set app.masjid_id to the intended mosque UUID before loading seed data.';
    end if;
  end if;
  perform set_config('app.masjid_id', selected_mosque::text, true);
end
$$;

insert into public.staff_members
  (mosque_id, full_name, staff_type, job_title, phone, monthly_salary, salary_frequency, start_date,
   pension_deduction_percent, medical_allowance, housing_allowance, transport_allowance,
   other_benefit_name, other_benefit_amount, gratuity_eligible, status, notes)
select current_setting('app.masjid_id')::uuid, demo.full_name, demo.staff_type, demo.job_title, demo.phone, demo.salary, 'monthly', current_date - 365,
       demo.pension_percent, demo.medical, demo.housing, demo.transport, demo.other_benefit, demo.other_amount, true,
       'active', 'Fictional demo record'
from (values
  ('Demo Imam Ahmad', 'imam', 'Imam', '0300-555-0101', 55000::numeric, 5::numeric, 2500::numeric, 4000::numeric, 1500::numeric, 'Meal allowance', 1000::numeric),
  ('Demo Muezzin Bilal', 'muezzin', 'Muezzin', '0300-555-0102', 35000::numeric, 4::numeric, 2000::numeric, 3000::numeric, 1200::numeric, 'Meal allowance', 800::numeric),
  ('Demo Khadim Hamza', 'khadim', 'Masjid caretaker', '0300-555-0103', 30000::numeric, 3::numeric, 1800::numeric, 2500::numeric, 1000::numeric, null, 0::numeric),
  ('Demo Quran Teacher Yusuf', 'teacher', 'Quran teacher', '0300-555-0104', 32000::numeric, 5::numeric, 2200::numeric, 0::numeric, 1200::numeric, null, 0::numeric)
) as demo(full_name, staff_type, job_title, phone, salary, pension_percent, medical, housing, transport, other_benefit, other_amount)
where not exists (select 1 from public.staff_members s where s.mosque_id = current_setting('app.masjid_id')::uuid and s.full_name = demo.full_name);

update public.staff_members as staff
set pension_deduction_percent = demo.pension_percent,
    medical_allowance = demo.medical,
    housing_allowance = demo.housing,
    transport_allowance = demo.transport,
    other_benefit_name = demo.other_benefit,
    other_benefit_amount = demo.other_amount,
    gratuity_eligible = true
from (values
  ('Demo Imam Ahmad', 5::numeric, 2500::numeric, 4000::numeric, 1500::numeric, 'Meal allowance', 1000::numeric),
  ('Demo Muezzin Bilal', 4::numeric, 2000::numeric, 3000::numeric, 1200::numeric, 'Meal allowance', 800::numeric),
  ('Demo Khadim Hamza', 3::numeric, 1800::numeric, 2500::numeric, 1000::numeric, null, 0::numeric),
  ('Demo Quran Teacher Yusuf', 5::numeric, 2200::numeric, 0::numeric, 1200::numeric, null, 0::numeric)
) as demo(full_name, pension_percent, medical, housing, transport, other_benefit, other_amount)
where staff.full_name = demo.full_name
  and staff.notes = 'Fictional demo record'
  and staff.mosque_id = current_setting('app.masjid_id')::uuid;

insert into public.rental_properties
  (mosque_id, name, property_type, unit_number, address, monthly_rent, electricity_meter, gas_meter, status)
select current_setting('app.masjid_id')::uuid, demo.name, demo.property_type, demo.unit_number, 'Demo address - not a real location', demo.monthly_rent, demo.electricity_meter, demo.gas_meter, 'vacant'
from (values
  ('Demo Shop 1', 'shop', 'SHOP-01', 25000::numeric, 'DEMO-E-001', 'DEMO-G-001'),
  ('Demo Shop 2', 'shop', 'SHOP-02', 30000::numeric, 'DEMO-E-002', 'DEMO-G-002'),
  ('Demo House 1', 'house', 'HOUSE-01', 40000::numeric, 'DEMO-E-003', 'DEMO-G-003'),
  ('Demo House 2', 'house', 'HOUSE-02', 45000::numeric, 'DEMO-E-004', 'DEMO-G-004')
) as demo(name, property_type, unit_number, monthly_rent, electricity_meter, gas_meter)
where not exists (select 1 from public.rental_properties p where p.mosque_id = current_setting('app.masjid_id')::uuid and p.name = demo.name);

insert into public.tenants
  (mosque_id, full_name, tenant_type, business_name, phone, email, national_id, address, status, notes)
select current_setting('app.masjid_id')::uuid, demo.full_name, demo.tenant_type, demo.business_name, demo.phone, demo.email, null, 'Demo address - not a real location', 'active', 'Fictional demo record'
from (values
  ('Demo Shopkeeper Ali', 'shopkeeper', 'Demo General Store', '0300-555-0201', 'shopkeeper1@example.invalid'),
  ('Demo Shopkeeper Usman', 'shopkeeper', 'Demo Book Shop', '0300-555-0202', 'shopkeeper2@example.invalid'),
  ('Demo Resident Sara', 'resident', null, '0300-555-0203', 'resident1@example.invalid'),
  ('Demo Resident Ayesha', 'resident', null, '0300-555-0204', 'resident2@example.invalid')
) as demo(full_name, tenant_type, business_name, phone, email)
where not exists (select 1 from public.tenants t where t.mosque_id = current_setting('app.masjid_id')::uuid and t.full_name = demo.full_name);

insert into public.rental_leases
  (mosque_id, property_id, tenant_id, monthly_rent, start_date, rent_due_day, security_deposit, annual_increase_percent, agreement_reference, status)
select p.mosque_id, p.id, t.id, demo.monthly_rent, current_date - interval '90 days', demo.due_day, demo.deposit, 5, 'DEMO-LEASE-' || demo.unit_number, 'active'
from (values
  ('SHOP-01', 'Demo Shopkeeper Ali', 25000::numeric, 5, 25000::numeric),
  ('SHOP-02', 'Demo Shopkeeper Usman', 30000::numeric, 10, 30000::numeric),
  ('HOUSE-01', 'Demo Resident Sara', 40000::numeric, 5, 40000::numeric),
  ('HOUSE-02', 'Demo Resident Ayesha', 45000::numeric, 15, 45000::numeric)
) as demo(unit_number, tenant_name, monthly_rent, due_day, deposit)
join public.rental_properties p on p.unit_number = demo.unit_number and p.mosque_id = current_setting('app.masjid_id')::uuid
join public.tenants t on t.full_name = demo.tenant_name and t.mosque_id = p.mosque_id
where not exists (
  select 1 from public.rental_leases l where l.mosque_id = p.mosque_id and l.property_id = p.id and l.tenant_id = t.id and l.agreement_reference = 'DEMO-LEASE-' || demo.unit_number
);

insert into public.rent_payments (mosque_id, lease_id, amount, payment_date, period, payment_method, reference, notes)
select l.mosque_id, l.id, l.monthly_rent, current_date, to_char(current_date, 'YYYY-MM'), 'cash', 'DEMO-RENT-' || l.lease_number, 'Fictional sample rent receipt'
from public.rental_leases l
where l.agreement_reference like 'DEMO-LEASE-%'
  and l.mosque_id = current_setting('app.masjid_id')::uuid
  and not exists (select 1 from public.rent_payments rp where rp.mosque_id = l.mosque_id and rp.reference = 'DEMO-RENT-' || l.lease_number);

insert into public.staff_salary_payments
  (mosque_id, staff_id, salary_period, amount, paid_at, payment_method, reference, notes)
select s.mosque_id, s.id, to_char(current_date, 'YYYY-MM'), s.monthly_salary, current_date, 'bank', 'DEMO-SALARY-' || s.staff_number, 'Fictional sample salary payment'
from public.staff_members s
where s.full_name like 'Demo %'
  and s.mosque_id = current_setting('app.masjid_id')::uuid
  and not exists (select 1 from public.staff_salary_payments sp where sp.mosque_id = s.mosque_id and sp.reference = 'DEMO-SALARY-' || s.staff_number);

insert into public.utility_bills
  (mosque_id, property_id, utility_type, billing_period, amount, paid_amount, due_date)
select p.mosque_id, p.id, demo.utility_type, to_char(current_date, 'YYYY-MM'), demo.amount, 0, current_date + 10
from (values
  ('SHOP-01', 'electricity', 4200::numeric),
  ('SHOP-01', 'gas', 1800::numeric),
  ('HOUSE-01', 'electricity', 3600::numeric),
  ('HOUSE-01', 'gas', 2200::numeric)
) as demo(unit_number, utility_type, amount)
join public.rental_properties p on p.unit_number = demo.unit_number and p.mosque_id = current_setting('app.masjid_id')::uuid
on conflict (property_id, utility_type, billing_period) do nothing;

insert into public.donations (mosque_id, donor_name, donation_type, amount, donation_date, payment_method, notes)
select current_setting('app.masjid_id')::uuid, 'Demo Donor ' || demo.suffix, demo.donation_type, demo.amount, current_date, 'cash', 'Fictional development data'
from (values
  ('A', 'general', 5000::numeric),
  ('B', 'sadaqah', 2500::numeric),
  ('C', 'zakat', 10000::numeric)
) as demo(suffix, donation_type, amount)
where not exists (select 1 from public.donations d where d.mosque_id = current_setting('app.masjid_id')::uuid and d.donor_name = 'Demo Donor ' || demo.suffix and d.notes = 'Fictional development data');

insert into public.prayer_schedules (mosque_id, prayer_name, adhan_time, jamaat_time, effective_from, active)
values
  (current_setting('app.masjid_id')::uuid, 'fajr', '05:00', '05:30', current_date, true),
  (current_setting('app.masjid_id')::uuid, 'dhuhr', '12:30', '13:00', current_date, true),
  (current_setting('app.masjid_id')::uuid, 'asr', '16:00', '16:30', current_date, true),
  (current_setting('app.masjid_id')::uuid, 'maghrib', '18:15', '18:20', current_date, true),
  (current_setting('app.masjid_id')::uuid, 'isha', '19:45', '20:15', current_date, true)
on conflict (mosque_id, prayer_name, effective_from) do nothing;

insert into public.prayer_attendance (mosque_id, prayer_date, prayer_name, attendance_mode, attendee_count)
select current_setting('app.masjid_id')::uuid, current_date, demo.prayer_name, 'aggregate', demo.attendee_count
from (values ('fajr', 45), ('dhuhr', 70), ('asr', 55), ('maghrib', 95), ('isha', 65)) as demo(prayer_name, attendee_count)
where not exists (
  select 1 from public.prayer_attendance a
  where a.mosque_id = current_setting('app.masjid_id')::uuid and a.prayer_date = current_date and a.prayer_name = demo.prayer_name and a.attendance_mode = 'aggregate'
);

insert into public.community_programs (mosque_id, name, program_type, starts_at, instructor_name, status)
select current_setting('app.masjid_id')::uuid, demo.name, demo.program_type, now() + demo.days_after * interval '1 day', demo.instructor, 'upcoming'
from (values
  ('Demo Quran Class', 'quran', 2, 'Demo Quran Teacher'),
  ('Demo Community Dars', 'dars', 5, 'Demo Imam')
) as demo(name, program_type, days_after, instructor)
where not exists (select 1 from public.community_programs p where p.mosque_id = current_setting('app.masjid_id')::uuid and p.name = demo.name);

commit;
