begin;

set local search_path = public, extensions;

-- Set app.masjid_id here only when more than one mosque is registered and
-- unassigned legacy records should belong to a specific mosque.
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
      raise exception 'Register a mosque before applying mosque scoping.';
    elsif mosque_count > 1 then
      raise exception 'More than one mosque is registered. Set app.masjid_id to the intended mosque UUID at the start of this migration and run it again.';
    end if;
  end if;
end
$$;

alter table public.staff_members add column if not exists education_level text;
alter table public.staff_members add column if not exists education_details text;

alter table public.staff_members add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.rental_properties add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.tenants add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.rental_leases add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.financial_transactions add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.rent_payments add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.utility_bills add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.maintenance_requests add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.donations add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.prayer_schedules add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.worshippers add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.prayer_attendance add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.community_programs add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.program_registrations add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.facility_bookings add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.announcements add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.user_notifications add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.staff_salary_payments add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.legal_matters add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.bank_accounts add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.bank_transactions add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.bank_cheques add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.bank_reconciliations add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.bank_statement_lines add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.masjid_member_accounts add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.mosque_committee_members add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.mosque_committee_interviews add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.mosque_committee_pledges add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;
alter table public.mosque_committee_performance_reviews add column if not exists mosque_id uuid references public.mosque_registrations(id) on delete restrict;

do $$
declare
  selected_mosque uuid;
  table_name text;
begin
  selected_mosque := coalesce(
    nullif(current_setting('app.masjid_id', true), '')::uuid,
    (select (array_agg(id))[1] from public.mosque_registrations)
  );
  if exists (
    select imam_staff_id from public.mosque_registrations
    where imam_staff_id is not null
    group by imam_staff_id
    having count(distinct id) > 1
  ) then
    raise exception 'A staff member is assigned as imam to more than one mosque. Resolve those assignments before applying mosque scoping.';
  end if;
  update public.staff_members staff
  set mosque_id = mosque.id
  from public.mosque_registrations mosque
  where mosque.imam_staff_id = staff.id and staff.mosque_id is null;

  foreach table_name in array array[
    'staff_members', 'rental_properties', 'tenants', 'rental_leases',
    'financial_transactions', 'rent_payments', 'utility_bills', 'maintenance_requests',
    'donations', 'prayer_schedules', 'worshippers', 'prayer_attendance',
    'community_programs', 'program_registrations', 'facility_bookings',
    'announcements', 'user_notifications', 'staff_salary_payments', 'legal_matters',
    'bank_accounts', 'bank_transactions', 'bank_cheques', 'bank_reconciliations',
    'bank_statement_lines', 'masjid_member_accounts'
  ] loop
    execute format('update public.%I set mosque_id = $1 where mosque_id is null', table_name)
      using selected_mosque;
  end loop;

  update public.rental_leases lease set mosque_id = property.mosque_id
    from public.rental_properties property where property.id = lease.property_id;
  update public.rent_payments payment set mosque_id = lease.mosque_id
    from public.rental_leases lease where lease.id = payment.lease_id;
  update public.utility_bills bill set mosque_id = property.mosque_id
    from public.rental_properties property where property.id = bill.property_id;
  update public.maintenance_requests request set mosque_id = property.mosque_id
    from public.rental_properties property where property.id = request.property_id;
  update public.staff_salary_payments payment set mosque_id = staff.mosque_id
    from public.staff_members staff where staff.id = payment.staff_id;
  update public.prayer_attendance attendance set mosque_id = worshipper.mosque_id
    from public.worshippers worshipper
    where attendance.worshipper_id = worshipper.id and attendance.attendance_mode = 'individual';
  update public.program_registrations registration set mosque_id = program.mosque_id
    from public.community_programs program where program.id = registration.program_id;
  update public.bank_transactions transaction set mosque_id = account.mosque_id
    from public.bank_accounts account where account.id = transaction.bank_account_id;
  update public.bank_cheques cheque set mosque_id = account.mosque_id
    from public.bank_accounts account where account.id = cheque.bank_account_id;
  update public.bank_reconciliations reconciliation set mosque_id = account.mosque_id
    from public.bank_accounts account where account.id = reconciliation.bank_account_id;
  update public.bank_statement_lines line set mosque_id = reconciliation.mosque_id
    from public.bank_reconciliations reconciliation where reconciliation.id = line.reconciliation_id;
  update public.mosque_committee_members member set mosque_id = committee.mosque_id
    from public.mosque_committees committee where committee.id = member.committee_id;
  update public.mosque_committee_interviews interview set mosque_id = committee.mosque_id
    from public.mosque_committee_members member
    join public.mosque_committees committee on committee.id = member.committee_id
    where member.id = interview.member_id;
  update public.mosque_committee_pledges pledge set mosque_id = committee.mosque_id
    from public.mosque_committee_members member
    join public.mosque_committees committee on committee.id = member.committee_id
    where member.id = pledge.member_id;
  update public.mosque_committee_performance_reviews review set mosque_id = committee.mosque_id
    from public.mosque_committee_members member
    join public.mosque_committees committee on committee.id = member.committee_id
    where member.id = review.member_id;

  update public.financial_transactions transaction set mosque_id = donation.mosque_id
    from public.donations donation
    where transaction.source_type = 'donation' and transaction.source_id = donation.id;
  update public.financial_transactions transaction set mosque_id = payment.mosque_id
    from public.rent_payments payment
    where transaction.source_type = 'rent_payment' and transaction.source_id = payment.id;
  update public.financial_transactions transaction set mosque_id = bill.mosque_id
    from public.utility_bills bill
    where transaction.source_type = 'utility_bill' and transaction.source_id = bill.id;
  update public.financial_transactions transaction set mosque_id = payment.mosque_id
    from public.staff_salary_payments payment
    where transaction.source_type = 'staff_salary' and transaction.source_id = payment.id;
end
$$;

alter table public.staff_members alter column mosque_id set not null;
alter table public.rental_properties alter column mosque_id set not null;
alter table public.tenants alter column mosque_id set not null;
alter table public.rental_leases alter column mosque_id set not null;
alter table public.financial_transactions alter column mosque_id set not null;
alter table public.rent_payments alter column mosque_id set not null;
alter table public.utility_bills alter column mosque_id set not null;
alter table public.maintenance_requests alter column mosque_id set not null;
alter table public.donations alter column mosque_id set not null;
alter table public.prayer_schedules alter column mosque_id set not null;
alter table public.worshippers alter column mosque_id set not null;
alter table public.prayer_attendance alter column mosque_id set not null;
alter table public.community_programs alter column mosque_id set not null;
alter table public.program_registrations alter column mosque_id set not null;
alter table public.facility_bookings alter column mosque_id set not null;
alter table public.announcements alter column mosque_id set not null;
alter table public.user_notifications alter column mosque_id set not null;
alter table public.staff_salary_payments alter column mosque_id set not null;
alter table public.legal_matters alter column mosque_id set not null;
alter table public.bank_accounts alter column mosque_id set not null;
alter table public.bank_transactions alter column mosque_id set not null;
alter table public.bank_cheques alter column mosque_id set not null;
alter table public.bank_reconciliations alter column mosque_id set not null;
alter table public.bank_statement_lines alter column mosque_id set not null;
alter table public.masjid_member_accounts alter column mosque_id set not null;
alter table public.mosque_committee_members alter column mosque_id set not null;
alter table public.mosque_committee_interviews alter column mosque_id set not null;
alter table public.mosque_committee_pledges alter column mosque_id set not null;
alter table public.mosque_committee_performance_reviews alter column mosque_id set not null;

alter table public.staff_members add constraint staff_members_education_level_check
  check (education_level is null or length(btrim(education_level)) between 1 and 120) not valid;
alter table public.staff_members add constraint staff_members_cnic_format_check
  check (national_id is null or national_id ~ '^[0-9]{5}-?[0-9]{7}-?[0-9]$') not valid;

alter table public.prayer_schedules
  drop constraint if exists prayer_schedules_prayer_name_effective_from_key;
create unique index if not exists prayer_schedules_mosque_prayer_effective_uidx
  on public.prayer_schedules(mosque_id, prayer_name, effective_from);

create table public.staff_interviews (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosque_registrations(id) on delete restrict,
  staff_id uuid not null references public.staff_members(id) on delete restrict,
  interview_date date not null default current_date,
  panel_members text[] not null check (cardinality(panel_members) between 2 and 8),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  assessment text not null check (length(btrim(assessment)) between 1 and 3000),
  score integer check (score is null or score between 0 and 100),
  outcome text not null check (outcome in ('recommended', 'conditional', 'not_recommended')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.staff_interviews enable row level security;
revoke all on public.staff_interviews from public, anon;
grant select, insert on public.staff_interviews to authenticated;
create policy staff_interviews_read on public.staff_interviews for select to authenticated
  using (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy staff_interviews_create on public.staff_interviews for insert to authenticated
  with check (
    public.has_masjid_role(array['admin', 'mosque_manager'])
    and created_by = auth.uid()
  );
create index staff_interviews_mosque_staff_date_idx
  on public.staff_interviews(mosque_id, staff_id, interview_date desc);

create or replace function public.validate_mosque_linkage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_mosque uuid;
begin
  if tg_table_name = 'rental_leases' then
    select mosque_id into parent_mosque from public.rental_properties where id = new.property_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Property must belong to the selected mosque.' using errcode = '23514'; end if;
    select mosque_id into parent_mosque from public.tenants where id = new.tenant_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Tenant must belong to the selected mosque.' using errcode = '23514'; end if;
  elsif tg_table_name = 'rent_payments' then
    select mosque_id into parent_mosque from public.rental_leases where id = new.lease_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Lease must belong to the selected mosque.' using errcode = '23514'; end if;
  elsif tg_table_name in ('utility_bills', 'maintenance_requests') then
    select mosque_id into parent_mosque from public.rental_properties where id = new.property_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Property must belong to the selected mosque.' using errcode = '23514'; end if;
  elsif tg_table_name = 'staff_salary_payments' then
    select mosque_id into parent_mosque from public.staff_members where id = new.staff_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Staff member must belong to the selected mosque.' using errcode = '23514'; end if;
  elsif tg_table_name = 'prayer_attendance' and new.worshipper_id is not null then
    select mosque_id into parent_mosque from public.worshippers where id = new.worshipper_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Worshipper must belong to the selected mosque.' using errcode = '23514'; end if;
  elsif tg_table_name = 'program_registrations' then
    select mosque_id into parent_mosque from public.community_programs where id = new.program_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Program must belong to the selected mosque.' using errcode = '23514'; end if;
    select mosque_id into parent_mosque from public.worshippers where id = new.worshipper_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Worshipper must belong to the selected mosque.' using errcode = '23514'; end if;
  elsif tg_table_name = 'bank_transactions' then
    select mosque_id into parent_mosque from public.bank_accounts where id = new.bank_account_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Bank account must belong to the selected mosque.' using errcode = '23514'; end if;
  elsif tg_table_name = 'bank_cheques' then
    select mosque_id into parent_mosque from public.bank_accounts where id = new.bank_account_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Bank account must belong to the selected mosque.' using errcode = '23514'; end if;
    if new.bank_transaction_id is not null then
      select mosque_id into parent_mosque from public.bank_transactions where id = new.bank_transaction_id;
      new.mosque_id := coalesce(new.mosque_id, parent_mosque);
      if parent_mosque is distinct from new.mosque_id then raise exception 'Bank transaction must belong to the selected mosque.' using errcode = '23514'; end if;
    end if;
  elsif tg_table_name = 'bank_reconciliations' then
    select mosque_id into parent_mosque from public.bank_accounts where id = new.bank_account_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Bank account must belong to the selected mosque.' using errcode = '23514'; end if;
  elsif tg_table_name = 'bank_statement_lines' then
    select mosque_id into parent_mosque from public.bank_reconciliations where id = new.reconciliation_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Reconciliation must belong to the selected mosque.' using errcode = '23514'; end if;
    if new.matched_transaction_id is not null then
      select mosque_id into parent_mosque from public.bank_transactions where id = new.matched_transaction_id;
      new.mosque_id := coalesce(new.mosque_id, parent_mosque);
      if parent_mosque is distinct from new.mosque_id then raise exception 'Matched transaction must belong to the selected mosque.' using errcode = '23514'; end if;
    end if;
  elsif tg_table_name = 'staff_interviews' then
    select mosque_id into parent_mosque from public.staff_members where id = new.staff_id;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Staff member must belong to the selected mosque.' using errcode = '23514'; end if;
  elsif tg_table_name = 'financial_transactions' and new.source_type is not null then
    if new.source_type = 'donation' then
      select mosque_id into parent_mosque from public.donations where id = new.source_id;
    elsif new.source_type = 'rent_payment' then
      select mosque_id into parent_mosque from public.rent_payments where id = new.source_id;
    elsif new.source_type = 'utility_bill' then
      select mosque_id into parent_mosque from public.utility_bills where id = new.source_id;
    elsif new.source_type = 'staff_salary' then
      select mosque_id into parent_mosque from public.staff_salary_payments where id = new.source_id;
    end if;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is not null and parent_mosque is distinct from new.mosque_id then
      raise exception 'Source record must belong to the selected mosque.' using errcode = '23514';
    end if;
  elsif tg_table_name in ('mosque_committee_members', 'mosque_committee_interviews', 'mosque_committee_pledges', 'mosque_committee_performance_reviews') then
    if tg_table_name = 'mosque_committee_members' then
      select mosque_id into parent_mosque from public.mosque_committees where id = new.committee_id;
    else
      select committee.mosque_id into parent_mosque
        from public.mosque_committee_members member
        join public.mosque_committees committee on committee.id = member.committee_id
        where member.id = new.member_id;
    end if;
    new.mosque_id := coalesce(new.mosque_id, parent_mosque);
    if parent_mosque is distinct from new.mosque_id then raise exception 'Committee record must belong to its committee mosque.' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;

create trigger rental_leases_mosque_validate before insert or update on public.rental_leases for each row execute function public.validate_mosque_linkage();
create trigger rent_payments_mosque_validate before insert or update on public.rent_payments for each row execute function public.validate_mosque_linkage();
create trigger utility_bills_mosque_validate before insert or update on public.utility_bills for each row execute function public.validate_mosque_linkage();
create trigger maintenance_requests_mosque_validate before insert or update on public.maintenance_requests for each row execute function public.validate_mosque_linkage();
create trigger staff_salary_payments_mosque_validate before insert or update on public.staff_salary_payments for each row execute function public.validate_mosque_linkage();
create trigger prayer_attendance_mosque_validate before insert or update on public.prayer_attendance for each row execute function public.validate_mosque_linkage();
create trigger program_registrations_mosque_validate before insert or update on public.program_registrations for each row execute function public.validate_mosque_linkage();
create trigger bank_transactions_mosque_validate before insert or update on public.bank_transactions for each row execute function public.validate_mosque_linkage();
create trigger bank_cheques_mosque_validate before insert or update on public.bank_cheques for each row execute function public.validate_mosque_linkage();
create trigger bank_reconciliations_mosque_validate before insert or update on public.bank_reconciliations for each row execute function public.validate_mosque_linkage();
create trigger bank_statement_lines_mosque_validate before insert or update on public.bank_statement_lines for each row execute function public.validate_mosque_linkage();
create trigger staff_interviews_mosque_validate before insert or update on public.staff_interviews for each row execute function public.validate_mosque_linkage();
create trigger financial_transactions_mosque_validate before insert or update on public.financial_transactions for each row execute function public.validate_mosque_linkage();
create trigger bank_accounts_mosque_validate before insert or update on public.bank_accounts for each row execute function public.validate_mosque_linkage();
create trigger committee_members_mosque_validate before insert or update on public.mosque_committee_members for each row execute function public.validate_mosque_linkage();
create trigger committee_interviews_mosque_validate before insert or update on public.mosque_committee_interviews for each row execute function public.validate_mosque_linkage();
create trigger committee_pledges_mosque_validate before insert or update on public.mosque_committee_pledges for each row execute function public.validate_mosque_linkage();
create trigger committee_reviews_mosque_validate before insert or update on public.mosque_committee_performance_reviews for each row execute function public.validate_mosque_linkage();

create unique index if not exists staff_members_id_mosque_uidx on public.staff_members(id, mosque_id);
create unique index if not exists rental_properties_id_mosque_uidx on public.rental_properties(id, mosque_id);
create unique index if not exists tenants_id_mosque_uidx on public.tenants(id, mosque_id);
create unique index if not exists rental_leases_id_mosque_uidx on public.rental_leases(id, mosque_id);
create unique index if not exists worshippers_id_mosque_uidx on public.worshippers(id, mosque_id);
create unique index if not exists community_programs_id_mosque_uidx on public.community_programs(id, mosque_id);
create unique index if not exists bank_accounts_id_mosque_uidx on public.bank_accounts(id, mosque_id);
create unique index if not exists bank_transactions_id_mosque_uidx on public.bank_transactions(id, mosque_id);
create unique index if not exists bank_reconciliations_id_mosque_uidx on public.bank_reconciliations(id, mosque_id);
create unique index if not exists mosque_committees_id_mosque_uidx on public.mosque_committees(id, mosque_id);
create unique index if not exists mosque_committee_members_id_mosque_uidx on public.mosque_committee_members(id, mosque_id);

alter table public.rental_leases add constraint rental_leases_property_mosque_fk foreign key (property_id, mosque_id) references public.rental_properties(id, mosque_id);
alter table public.rental_leases add constraint rental_leases_tenant_mosque_fk foreign key (tenant_id, mosque_id) references public.tenants(id, mosque_id);
alter table public.rent_payments add constraint rent_payments_lease_mosque_fk foreign key (lease_id, mosque_id) references public.rental_leases(id, mosque_id);
alter table public.utility_bills add constraint utility_bills_property_mosque_fk foreign key (property_id, mosque_id) references public.rental_properties(id, mosque_id);
alter table public.maintenance_requests add constraint maintenance_requests_property_mosque_fk foreign key (property_id, mosque_id) references public.rental_properties(id, mosque_id);
alter table public.staff_salary_payments add constraint staff_salary_payments_staff_mosque_fk foreign key (staff_id, mosque_id) references public.staff_members(id, mosque_id);
alter table public.prayer_attendance add constraint prayer_attendance_worshipper_mosque_fk foreign key (worshipper_id, mosque_id) references public.worshippers(id, mosque_id);
alter table public.program_registrations add constraint program_registrations_program_mosque_fk foreign key (program_id, mosque_id) references public.community_programs(id, mosque_id);
alter table public.program_registrations add constraint program_registrations_worshipper_mosque_fk foreign key (worshipper_id, mosque_id) references public.worshippers(id, mosque_id);
alter table public.bank_transactions add constraint bank_transactions_account_mosque_fk foreign key (bank_account_id, mosque_id) references public.bank_accounts(id, mosque_id);
alter table public.bank_cheques add constraint bank_cheques_account_mosque_fk foreign key (bank_account_id, mosque_id) references public.bank_accounts(id, mosque_id);
alter table public.bank_cheques add constraint bank_cheques_transaction_mosque_fk foreign key (bank_transaction_id, mosque_id) references public.bank_transactions(id, mosque_id);
alter table public.bank_reconciliations add constraint bank_reconciliations_account_mosque_fk foreign key (bank_account_id, mosque_id) references public.bank_accounts(id, mosque_id);
alter table public.bank_statement_lines add constraint bank_statement_lines_reconciliation_mosque_fk foreign key (reconciliation_id, mosque_id) references public.bank_reconciliations(id, mosque_id);
alter table public.bank_statement_lines add constraint bank_statement_lines_transaction_mosque_fk foreign key (matched_transaction_id, mosque_id) references public.bank_transactions(id, mosque_id);
alter table public.staff_interviews add constraint staff_interviews_staff_mosque_fk foreign key (staff_id, mosque_id) references public.staff_members(id, mosque_id);
alter table public.masjid_member_accounts add constraint member_accounts_worshipper_mosque_fk foreign key (worshipper_id, mosque_id) references public.worshippers(id, mosque_id);
alter table public.mosque_committee_members add constraint committee_members_committee_mosque_fk foreign key (committee_id, mosque_id) references public.mosque_committees(id, mosque_id);
alter table public.mosque_committee_interviews add constraint committee_interviews_member_mosque_fk foreign key (member_id, mosque_id) references public.mosque_committee_members(id, mosque_id);
alter table public.mosque_committee_pledges add constraint committee_pledges_member_mosque_fk foreign key (member_id, mosque_id) references public.mosque_committee_members(id, mosque_id);
alter table public.mosque_committee_performance_reviews add constraint committee_reviews_member_mosque_fk foreign key (member_id, mosque_id) references public.mosque_committee_members(id, mosque_id);

alter table public.mosque_registrations drop constraint if exists mosque_registrations_imam_staff_id_fkey;
alter table public.mosque_registrations add constraint mosque_registrations_imam_mosque_fk
  foreign key (imam_staff_id, id) references public.staff_members(id, mosque_id)
  on delete set null (imam_staff_id);
alter table public.mosque_committees drop constraint if exists mosque_committees_previous_committee_id_fkey;
alter table public.mosque_committees add constraint mosque_committees_previous_mosque_fk
  foreign key (previous_committee_id, mosque_id) references public.mosque_committees(id, mosque_id)
  on delete set null (previous_committee_id);

alter table public.staff_interviews enable row level security;

create or replace view public.rent_due_status
with (security_invoker = true)
as
select
  lease.id as lease_id,
  lease.lease_number,
  property.name as property_name,
  property.property_number,
  tenant.full_name as tenant_name,
  tenant.tenant_number,
  to_char(current_date, 'YYYY-MM') as period,
  lease.monthly_rent,
  coalesce(sum(payment.amount), 0)::numeric(12,2) as paid_amount,
  greatest(lease.monthly_rent - coalesce(sum(payment.amount), 0), 0)::numeric(12,2) as balance_due,
  make_date(
    extract(year from current_date)::integer,
    extract(month from current_date)::integer,
    least(lease.rent_due_day, extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::integer)
  ) as due_date,
  lease.mosque_id
from public.rental_leases lease
join public.rental_properties property on property.id = lease.property_id
join public.tenants tenant on tenant.id = lease.tenant_id
left join public.rent_payments payment on payment.lease_id = lease.id and payment.period = to_char(current_date, 'YYYY-MM')
where lease.status = 'active' and lease.start_date <= current_date
  and (lease.end_date is null or lease.end_date >= current_date)
group by lease.id, property.name, property.property_number, tenant.full_name, tenant.tenant_number, lease.mosque_id;

create or replace view public.staff_benefit_summary
with (security_invoker = true)
as
select
  staff.id,
  staff.staff_number,
  staff.full_name,
  staff.staff_type,
  staff.job_title,
  staff.start_date,
  staff.monthly_salary,
  staff.pension_deduction_percent,
  round(staff.monthly_salary * staff.pension_deduction_percent / 100, 2)::numeric(12,2) as monthly_pension_deduction,
  staff.medical_allowance,
  staff.housing_allowance,
  staff.transport_allowance,
  staff.other_benefit_name,
  staff.other_benefit_amount,
  (staff.medical_allowance + staff.housing_allowance + staff.transport_allowance + staff.other_benefit_amount)::numeric(12,2) as monthly_benefits_total,
  staff.gratuity_eligible,
  case when staff.start_date is null then 0
    else greatest(extract(year from age(current_date, staff.start_date))::integer, 0) end as completed_service_years,
  case when staff.gratuity_eligible and staff.start_date is not null
    then (staff.monthly_salary * greatest(extract(year from age(current_date, staff.start_date))::integer, 0))::numeric(12,2)
    else 0::numeric(12,2) end as estimated_gratuity,
  staff.mosque_id
from public.staff_members staff;

create or replace view public.bank_account_balances
with (security_invoker = true)
as
select
  account.id,
  account.account_name,
  account.account_type,
  account.parent_account_id,
  account.bank_name,
  account.branch_name,
  account.account_last4,
  account.currency,
  account.opening_balance,
  account.active,
  case when account.account_type = 'central' then null::numeric
    else account.opening_balance + coalesce((
      select sum(case when transaction.entry_type = 'deposit' then transaction.amount else -transaction.amount end)
      from public.bank_transactions transaction where transaction.bank_account_id = account.id
    ), 0)
  end as current_balance,
  account.mosque_id
from public.bank_accounts account;

create or replace view public.bank_masjid_account_options
with (security_invoker = true)
as
select id, account_name, mosque_id
from public.bank_accounts
where account_type = 'mosque' and active;

create or replace function public.has_masjid_access(p_mosque_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.has_masjid_role(array['admin', 'mosque_manager', 'accountant', 'property_manager'])
    or exists (
      select 1 from public.masjid_member_accounts account
      where account.auth_user_id = auth.uid()
        and account.mosque_id = p_mosque_id
        and account.role = auth.jwt() -> 'app_metadata' ->> 'role'
    )
    or exists (
      select 1 from public.staff_members staff
      where staff.user_id = auth.uid() and staff.mosque_id = p_mosque_id
        and staff.staff_type = 'imam'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'imam'
    )
    or exists (
      select 1 from public.tenants tenant
      where tenant.user_id = auth.uid() and tenant.mosque_id = p_mosque_id
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'tenant'
    )
    or exists (
      select 1 from public.worshippers worshipper
      where worshipper.user_id = auth.uid() and worshipper.mosque_id = p_mosque_id
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'worshipper'
    )
  );
$$;

create or replace function public.sync_donation_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.financial_transactions where source_type = 'donation' and source_id = old.id;
    return old;
  end if;
  insert into public.financial_transactions(mosque_id, entry_type, category, description, amount, entry_date, reference, source_type, source_id)
  values (new.mosque_id, 'income', new.donation_type, 'Donation from ' || new.donor_name, new.amount, new.donation_date, new.receipt_number, 'donation', new.id)
  on conflict (source_type, source_id) do update set
    mosque_id = excluded.mosque_id, category = excluded.category, description = excluded.description,
    amount = excluded.amount, entry_date = excluded.entry_date, reference = excluded.reference;
  return new;
end;
$$;

create or replace function public.sync_rent_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lease_property text;
begin
  if tg_op = 'DELETE' then
    delete from public.financial_transactions where source_type = 'rent_payment' and source_id = old.id;
    return old;
  end if;
  select property.name into lease_property from public.rental_leases lease
    join public.rental_properties property on property.id = lease.property_id where lease.id = new.lease_id;
  insert into public.financial_transactions(mosque_id, entry_type, category, description, amount, entry_date, reference, source_type, source_id)
  values (new.mosque_id, 'income', 'rent', 'Rent payment: ' || coalesce(lease_property, 'property'), new.amount, new.payment_date, new.reference, 'rent_payment', new.id)
  on conflict (source_type, source_id) do update set
    mosque_id = excluded.mosque_id, description = excluded.description, amount = excluded.amount,
    entry_date = excluded.entry_date, reference = excluded.reference;
  return new;
end;
$$;

create or replace function public.sync_utility_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare property_name text;
begin
  if tg_op = 'DELETE' then
    delete from public.financial_transactions where source_type = 'utility_bill' and source_id = old.id;
    return old;
  end if;
  select name into property_name from public.rental_properties where id = new.property_id;
  if new.paid_amount > 0 then
    insert into public.financial_transactions(mosque_id, entry_type, category, description, amount, entry_date, reference, source_type, source_id)
    values (new.mosque_id, 'expense', new.utility_type, new.utility_type || ' bill: ' || coalesce(property_name, 'property'), new.paid_amount, coalesce(new.paid_at, new.due_date), new.billing_period, 'utility_bill', new.id)
    on conflict (source_type, source_id) do update set
      mosque_id = excluded.mosque_id, category = excluded.category, description = excluded.description,
      amount = excluded.amount, entry_date = excluded.entry_date, reference = excluded.reference;
  else
    delete from public.financial_transactions where source_type = 'utility_bill' and source_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.sync_staff_salary_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare staff_name text;
begin
  if tg_op = 'DELETE' then
    delete from public.financial_transactions where source_type = 'staff_salary' and source_id = old.id;
    return old;
  end if;
  select full_name into staff_name from public.staff_members where id = new.staff_id;
  insert into public.financial_transactions(mosque_id, entry_type, category, description, amount, entry_date, reference, source_type, source_id)
  values (new.mosque_id, 'expense', 'salary', 'Salary payment: ' || coalesce(staff_name, 'staff'), new.amount, new.paid_at, coalesce(new.reference, new.receipt_number), 'staff_salary', new.id)
  on conflict (source_type, source_id) do update set
    mosque_id = excluded.mosque_id, description = excluded.description, amount = excluded.amount,
    entry_date = excluded.entry_date, reference = excluded.reference;
  return new;
end;
$$;

grant select on public.rent_due_status, public.staff_benefit_summary, public.bank_account_balances, public.bank_masjid_account_options to authenticated;

create or replace function public.list_mosque_options()
returns table(id uuid, name text, registration_number text)
language sql
stable
security definer
set search_path = ''
as $$
  select mosque.id, mosque.name, mosque.registration_number
  from public.mosque_registrations mosque
  where auth.uid() is not null
    and public.has_masjid_role(array['admin', 'mosque_manager', 'accountant', 'property_manager', 'imam', 'committee', 'tenant', 'worshipper'])
    and public.has_masjid_access(mosque.id)
  order by mosque.name;
$$;

create or replace function public.masjid_dashboard_summary(p_mosque_id uuid)
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
  if auth.uid() is null or not public.has_masjid_access(p_mosque_id) then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.mosque_registrations where id = p_mosque_id) then
    raise exception 'Select a registered mosque.';
  end if;

  select jsonb_build_object(
    'incomeThisMonth', case when can_finance then coalesce((select sum(amount) from public.financial_transactions where mosque_id = p_mosque_id and entry_type = 'income' and entry_date >= date_trunc('month', current_date)::date), 0) else 0 end,
    'expensesThisMonth', case when can_finance then coalesce((select sum(amount) from public.financial_transactions where mosque_id = p_mosque_id and entry_type = 'expense' and entry_date >= date_trunc('month', current_date)::date), 0) else 0 end,
    'outstandingRent', case when can_property then coalesce((
      select sum(greatest(lease.monthly_rent - coalesce(paid.amount, 0), 0))
      from public.rental_leases lease
      left join lateral (
        select sum(payment.amount) as amount from public.rent_payments payment
        where payment.lease_id = lease.id and payment.mosque_id = p_mosque_id and payment.period = to_char(current_date, 'YYYY-MM')
      ) paid on true
      where lease.mosque_id = p_mosque_id and lease.status = 'active' and lease.start_date <= current_date and (lease.end_date is null or lease.end_date >= current_date)
    ), 0) else 0 end,
    'occupiedProperties', case when can_property then (select count(*) from public.rental_properties where mosque_id = p_mosque_id and status = 'occupied') else 0 end,
    'totalProperties', case when can_property then (select count(*) from public.rental_properties where mosque_id = p_mosque_id) else 0 end,
    'worshipperCount', case when can_community then (select count(*) from public.worshippers where mosque_id = p_mosque_id and status = 'active') else 0 end,
    'donationsThisMonth', case when can_finance then coalesce((select sum(amount) from public.donations where mosque_id = p_mosque_id and donation_date >= date_trunc('month', current_date)::date), 0) else 0 end,
    'prayerAttendanceToday', case when can_community then coalesce((select sum(attendee_count) from public.prayer_attendance where mosque_id = p_mosque_id and prayer_date = current_date), 0) else 0 end,
    'todayPrayerTimes', coalesce((
      select jsonb_agg(jsonb_build_object('prayer_name', schedule.prayer_name, 'jamaat_time', schedule.jamaat_time))
      from (
        select distinct on (prayer_name) prayer_name, jamaat_time
        from public.prayer_schedules
        where mosque_id = p_mosque_id and active and effective_from <= current_date
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
        where mosque_id = p_mosque_id and entry_date >= months.month_start::date and entry_date < (months.month_start + interval '1 month')::date
      ) totals on true
    ), '[]'::jsonb) else '[]'::jsonb end,
    'recentTransactions', case when can_finance then coalesce((
      select jsonb_agg(jsonb_build_object('id', recent.id, 'entry_type', recent.entry_type, 'category', recent.category, 'amount', recent.amount, 'entry_date', recent.entry_date, 'description', recent.description) order by recent.entry_date desc)
      from (select id, entry_type, category, amount, entry_date, description from public.financial_transactions where mosque_id = p_mosque_id order by entry_date desc, created_at desc limit 6) recent
    ), '[]'::jsonb) else '[]'::jsonb end,
    'upcomingPrograms', coalesce((
      select jsonb_agg(jsonb_build_object('id', upcoming.id, 'name', upcoming.name, 'starts_at', upcoming.starts_at, 'program_type', upcoming.program_type) order by upcoming.starts_at)
      from (select id, name, starts_at, program_type from public.community_programs where mosque_id = p_mosque_id and starts_at >= now() and status = 'upcoming' order by starts_at limit 5) upcoming
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

drop function if exists public.masjid_dashboard_summary();
revoke all on function public.masjid_dashboard_summary(uuid) from public, anon;
grant execute on function public.masjid_dashboard_summary(uuid) to authenticated;
revoke all on function public.list_mosque_options() from public, anon;
grant execute on function public.list_mosque_options() to authenticated;
revoke all on function public.has_masjid_access(uuid) from public, anon;
grant execute on function public.has_masjid_access(uuid) to authenticated;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'staff_members', 'rental_properties', 'tenants', 'rental_leases',
    'financial_transactions', 'rent_payments', 'utility_bills', 'maintenance_requests',
    'donations', 'prayer_schedules', 'worshippers', 'prayer_attendance',
    'community_programs', 'program_registrations', 'facility_bookings',
    'announcements', 'user_notifications', 'staff_salary_payments', 'legal_matters',
    'bank_accounts', 'bank_transactions', 'bank_cheques', 'bank_reconciliations',
    'bank_statement_lines', 'mosque_committees', 'mosque_committee_members',
    'mosque_committee_interviews', 'mosque_committee_pledges',
    'mosque_committee_performance_reviews', 'staff_interviews'
  ] loop
    policy_name := left(table_name, 42) || '_mosque_scope';
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.has_masjid_access(mosque_id)) with check (public.has_masjid_access(mosque_id))',
      policy_name, table_name
    );
    execute format(
      'create index if not exists %I on public.%I(mosque_id)',
      left(table_name, 42) || '_mosque_idx', table_name
    );
  end loop;
end
$$;

commit;
