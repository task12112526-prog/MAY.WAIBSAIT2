begin;

alter table public.staff_members
  add column if not exists pension_deduction_percent numeric(5,2) not null default 0,
  add column if not exists medical_allowance numeric(12,2) not null default 0,
  add column if not exists housing_allowance numeric(12,2) not null default 0,
  add column if not exists transport_allowance numeric(12,2) not null default 0,
  add column if not exists other_benefit_name text,
  add column if not exists other_benefit_amount numeric(12,2) not null default 0,
  add column if not exists gratuity_eligible boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_members_pension_percent_check') then
    alter table public.staff_members add constraint staff_members_pension_percent_check
      check (pension_deduction_percent between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_members_benefits_nonnegative_check') then
    alter table public.staff_members add constraint staff_members_benefits_nonnegative_check
      check (medical_allowance >= 0 and housing_allowance >= 0 and transport_allowance >= 0 and other_benefit_amount >= 0);
  end if;
end
$$;

alter table public.staff_salary_payments
  add column if not exists gross_salary numeric(12,2) not null default 0,
  add column if not exists pension_deduction numeric(12,2) not null default 0,
  add column if not exists benefit_amount numeric(12,2) not null default 0;

update public.staff_salary_payments
set gross_salary = amount
where gross_salary = 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_salary_payment_components_nonnegative_check') then
    alter table public.staff_salary_payments add constraint staff_salary_payment_components_nonnegative_check
      check (gross_salary >= 0 and pension_deduction >= 0 and benefit_amount >= 0);
  end if;
end
$$;

create or replace function public.calculate_staff_salary_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_row record;
begin
  select monthly_salary, pension_deduction_percent, medical_allowance, housing_allowance,
         transport_allowance, other_benefit_amount
  into staff_row
  from public.staff_members
  where id = new.staff_id;

  if not found then
    raise exception 'Staff member % does not exist.', new.staff_id;
  end if;

  if new.gross_salary <= 0 then
    new.gross_salary := coalesce(nullif(new.amount, 0), staff_row.monthly_salary);
  end if;

  new.pension_deduction := round(new.gross_salary * staff_row.pension_deduction_percent / 100, 2);
  new.benefit_amount := staff_row.medical_allowance + staff_row.housing_allowance
    + staff_row.transport_allowance + staff_row.other_benefit_amount;
  new.amount := new.gross_salary + new.benefit_amount - new.pension_deduction;

  if new.amount <= 0 then
    raise exception 'Net salary must be greater than zero after pension deduction.';
  end if;

  return new;
end;
$$;

drop trigger if exists staff_salary_payments_calculate on public.staff_salary_payments;
create trigger staff_salary_payments_calculate
before insert or update on public.staff_salary_payments
for each row execute function public.calculate_staff_salary_payment();

create or replace view public.staff_benefit_summary
with (security_invoker = true)
as
select
  s.id,
  s.staff_number,
  s.full_name,
  s.staff_type,
  s.job_title,
  s.start_date,
  s.monthly_salary,
  s.pension_deduction_percent,
  round(s.monthly_salary * s.pension_deduction_percent / 100, 2)::numeric(12,2) as monthly_pension_deduction,
  s.medical_allowance,
  s.housing_allowance,
  s.transport_allowance,
  s.other_benefit_name,
  s.other_benefit_amount,
  (s.medical_allowance + s.housing_allowance + s.transport_allowance + s.other_benefit_amount)::numeric(12,2) as monthly_benefits_total,
  s.gratuity_eligible,
  case
    when s.start_date is null then 0
    else greatest(extract(year from age(current_date, s.start_date))::integer, 0)
  end as completed_service_years,
  case
    when s.gratuity_eligible and s.start_date is not null
      then (s.monthly_salary * greatest(extract(year from age(current_date, s.start_date))::integer, 0))::numeric(12,2)
    else 0::numeric(12,2)
  end as estimated_gratuity
from public.staff_members s;

grant select on public.staff_benefit_summary to authenticated;
grant select, insert, update, delete on public.staff_salary_payments to authenticated;
grant usage, select on sequence public.masjid_salary_receipt_seq to authenticated;
revoke all on public.staff_benefit_summary from anon;
revoke all on function public.calculate_staff_salary_payment() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
