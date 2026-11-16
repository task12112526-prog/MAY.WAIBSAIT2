begin;

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null check (length(btrim(account_name)) between 1 and 120),
  account_type text not null check (account_type in ('central', 'mosque')),
  parent_account_id uuid references public.bank_accounts(id) on delete restrict,
  bank_name text,
  branch_name text,
  account_last4 text check (account_last4 is null or account_last4 ~ '^[0-9]{4}$'),
  currency text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  opening_balance numeric(14,2) not null default 0,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check ((account_type = 'central' and parent_account_id is null) or
         (account_type = 'mosque' and parent_account_id is not null))
);

create unique index bank_accounts_child_name_idx
  on public.bank_accounts(parent_account_id, lower(account_name))
  where parent_account_id is not null;
create index bank_accounts_type_active_idx on public.bank_accounts(account_type, active);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  entry_type text not null check (entry_type in ('deposit', 'withdrawal')),
  category text not null check (length(btrim(category)) between 1 and 80),
  description text not null check (length(btrim(description)) between 1 and 500),
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  reference text,
  cheque_number text,
  transfer_group_id uuid,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index bank_transactions_account_date_idx
  on public.bank_transactions(bank_account_id, transaction_date desc, created_at desc);
create index bank_transactions_transfer_idx on public.bank_transactions(transfer_group_id)
  where transfer_group_id is not null;
create unique index bank_transactions_transfer_side_idx
  on public.bank_transactions(transfer_group_id, entry_type)
  where transfer_group_id is not null;

create view public.bank_account_balances
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
  end as current_balance
from public.bank_accounts account;

create view public.bank_masjid_account_options
with (security_invoker = true)
as
select id, account_name
from public.bank_accounts
where account_type = 'mosque' and active;

create table public.bank_cheques (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  bank_transaction_id uuid references public.bank_transactions(id) on delete set null,
  cheque_number text not null check (length(btrim(cheque_number)) between 1 and 40),
  payee text not null check (length(btrim(payee)) between 1 and 160),
  amount numeric(14,2) not null check (amount > 0),
  issue_date date not null default current_date,
  status text not null default 'issued' check (status in ('issued', 'cleared', 'void', 'bounced')),
  cleared_date date,
  reference text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (bank_account_id, cheque_number),
  check (status <> 'cleared' or bank_transaction_id is not null),
  check (cleared_date is null or cleared_date >= issue_date)
);
create unique index bank_cheques_transaction_unique_idx
  on public.bank_cheques(bank_transaction_id)
  where bank_transaction_id is not null;

create table public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  statement_opening_balance numeric(14,2) not null,
  statement_closing_balance numeric(14,2) not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (period_end >= period_start),
  check ((status = 'in_progress' and completed_at is null) or
         (status = 'completed' and completed_at is not null))
);

create index bank_reconciliations_account_period_idx
  on public.bank_reconciliations(bank_account_id, period_start desc);

create table public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.bank_reconciliations(id) on delete cascade,
  transaction_date date not null,
  description text not null check (length(btrim(description)) between 1 and 500),
  amount numeric(14,2) not null check (amount <> 0),
  reference text,
  matched_transaction_id uuid references public.bank_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index bank_statement_lines_reconciliation_idx
  on public.bank_statement_lines(reconciliation_id, transaction_date);
create unique index bank_statement_lines_no_duplicate_import_idx
  on public.bank_statement_lines(
    reconciliation_id,
    transaction_date,
    amount,
    coalesce(reference, ''),
    description
  );
create unique index bank_statement_lines_matched_transaction_idx
  on public.bank_statement_lines(matched_transaction_id)
  where matched_transaction_id is not null;

create or replace function public.validate_masjid_bank_account()
returns trigger
language plpgsql
set search_path = ''
as $$
declare parent_type text;
begin
  if tg_op = 'UPDATE' and (
    new.opening_balance is distinct from old.opening_balance
    or new.currency is distinct from old.currency
  ) and (
    exists (select 1 from public.bank_transactions where bank_account_id = old.id)
    or exists (select 1 from public.bank_reconciliations where bank_account_id = old.id)
  ) then
    raise exception 'Opening balance and currency cannot be changed after bank activity is recorded.';
  end if;
  if new.account_type = 'central' then
    if new.parent_account_id is not null or new.opening_balance <> 0 then
      raise exception 'A central account is a grouping record; it cannot have a parent or balance.';
    end if;
    if new.account_last4 is not null or new.bank_name is not null or new.branch_name is not null then
      raise exception 'Keep real bank details on each masjid account, not the central grouping record.';
    end if;
    if exists (select 1 from public.bank_accounts where parent_account_id = new.id) then
      raise exception 'A central account with linked masjid accounts cannot be converted to a masjid account.';
    end if;
  else
    select account_type into parent_type
    from public.bank_accounts where id = new.parent_account_id;
    if parent_type is distinct from 'central' then
      raise exception 'Each masjid bank account must be under a central account.';
    end if;
    if nullif(btrim(new.bank_name), '') is null or new.account_last4 is null then
      raise exception 'Enter the bank name and only the last four account digits.';
    end if;
  end if;
  return new;
end;
$$;

create trigger bank_accounts_validate
before insert or update on public.bank_accounts
for each row execute function public.validate_masjid_bank_account();

create or replace function public.validate_masjid_bank_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.transfer_group_id is not null then
      raise exception 'A transfer is a paired record and cannot be deleted from the transaction list.';
    end if;
    if exists (select 1 from public.bank_statement_lines where matched_transaction_id = old.id)
      or exists (select 1 from public.bank_cheques where bank_transaction_id = old.id) then
      raise exception 'A reconciled or cheque-linked transaction cannot be deleted.';
    end if;
    return old;
  end if;
  if not exists (
    select 1 from public.bank_accounts
    where id = new.bank_account_id and account_type = 'mosque' and active
  ) then
    raise exception 'Choose an active masjid bank account; central accounts cannot hold transactions.';
  end if;
  if tg_op = 'UPDATE' and old.transfer_group_id is not null
    and (new.bank_account_id is distinct from old.bank_account_id
      or new.entry_type is distinct from old.entry_type
      or new.amount is distinct from old.amount
      or new.transfer_group_id is distinct from old.transfer_group_id) then
    raise exception 'A transfer is a paired record and cannot be changed from the transaction list.';
  end if;
  if tg_op = 'UPDATE' and exists (
    select 1 from public.bank_cheques cheque
    where cheque.bank_transaction_id = old.id
      and (new.bank_account_id is distinct from old.bank_account_id
        or new.entry_type is distinct from 'withdrawal'
        or new.amount is distinct from old.amount
        or new.cheque_number is distinct from old.cheque_number
        or new.transaction_date is distinct from old.transaction_date)
  ) then
    raise exception 'This transaction is linked to a cleared cheque and cannot be changed.';
  end if;
  if tg_op = 'UPDATE' and exists (
    select 1 from public.bank_statement_lines where matched_transaction_id = old.id
  ) then
    raise exception 'A reconciled transaction cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger bank_transactions_validate
before insert or update or delete on public.bank_transactions
for each row execute function public.validate_masjid_bank_transaction();

create or replace function public.validate_masjid_bank_cheque()
returns trigger
language plpgsql
set search_path = ''
as $$
declare ledger_entry public.bank_transactions%rowtype;
begin
  if new.status = 'cleared' then
    if new.bank_transaction_id is null or new.cleared_date is null then
      raise exception 'Link a cleared cheque to its withdrawal transaction and cleared date.';
    end if;
    select * into ledger_entry
      from public.bank_transactions where id = new.bank_transaction_id;
    if ledger_entry.id is null
      or ledger_entry.bank_account_id <> new.bank_account_id
      or ledger_entry.entry_type <> 'withdrawal'
      or ledger_entry.amount <> new.amount
      or ledger_entry.cheque_number is distinct from new.cheque_number
      or ledger_entry.transaction_date <> new.cleared_date then
      raise exception 'The linked bank transaction must be a same-account withdrawal with the same amount and cheque number.';
    end if;
  else
    new.bank_transaction_id := null;
    new.cleared_date := null;
  end if;
  return new;
end;
$$;

create trigger bank_cheques_validate
before insert or update on public.bank_cheques
for each row execute function public.validate_masjid_bank_cheque();

create or replace function public.validate_masjid_bank_statement_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  reconciliation public.bank_reconciliations%rowtype;
  transaction_row public.bank_transactions%rowtype;
  signed_amount numeric;
begin
  select * into reconciliation
    from public.bank_reconciliations where id = new.reconciliation_id;
  if reconciliation.id is null or reconciliation.status <> 'in_progress'
    or new.transaction_date < reconciliation.period_start
    or new.transaction_date > reconciliation.period_end then
    raise exception 'Statement lines must belong to an open reconciliation and fall within its period.';
  end if;
  if new.matched_transaction_id is not null then
    select * into transaction_row
      from public.bank_transactions where id = new.matched_transaction_id;
    if transaction_row.id is null or transaction_row.bank_account_id <> reconciliation.bank_account_id then
      raise exception 'The matched transaction must belong to the reconciliation account.';
    end if;
    signed_amount := case when transaction_row.entry_type = 'deposit'
      then transaction_row.amount else -transaction_row.amount end;
    if transaction_row.transaction_date <> new.transaction_date or signed_amount <> new.amount then
      raise exception 'The matched transaction date and signed amount must match the statement line.';
    end if;
  end if;
  return new;
end;
$$;

create trigger bank_statement_lines_validate
before insert or update on public.bank_statement_lines
for each row execute function public.validate_masjid_bank_statement_line();

create or replace function public.record_masjid_bank_transfer(
  from_account_id uuid,
  to_account_id uuid,
  transfer_amount numeric,
  transfer_date date,
  transfer_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_id uuid := gen_random_uuid();
  clean_description text := nullif(btrim(transfer_description), '');
begin
  if auth.uid() is null or not public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']) then
    raise exception 'You are not allowed to record bank transfers.' using errcode = '42501';
  end if;
  if from_account_id = to_account_id or transfer_amount is null or transfer_amount <= 0
    or transfer_date is null or clean_description is null or length(clean_description) > 500 then
    raise exception 'Enter two different accounts, a positive amount, a date and a description.';
  end if;
  if (select count(*) from public.bank_accounts
      where id in (from_account_id, to_account_id) and account_type = 'mosque' and active) <> 2 then
    raise exception 'Both accounts must be active masjid bank accounts.';
  end if;

  insert into public.bank_transactions(
    bank_account_id, entry_type, category, description, amount, transaction_date, reference, transfer_group_id
  ) values
    (from_account_id, 'withdrawal', 'transfer', clean_description, transfer_amount, transfer_date, transfer_id::text, transfer_id),
    (to_account_id, 'deposit', 'transfer', clean_description, transfer_amount, transfer_date, transfer_id::text, transfer_id);

  return transfer_id;
end;
$$;

create or replace function public.match_masjid_bank_statement_line(
  statement_line_id uuid,
  bank_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_reconciliation public.bank_reconciliations%rowtype;
  statement_line public.bank_statement_lines%rowtype;
  bank_transaction public.bank_transactions%rowtype;
  signed_transaction_amount numeric;
begin
  if auth.uid() is null or not public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']) then
    raise exception 'You are not allowed to match bank statement lines.' using errcode = '42501';
  end if;

  select * into statement_line from public.bank_statement_lines where id = statement_line_id for update;
  if statement_line.id is null or statement_line.matched_transaction_id is not null then
    raise exception 'The statement line is missing or already matched.';
  end if;
  select * into line_reconciliation
    from public.bank_reconciliations where id = statement_line.reconciliation_id for update;
  if line_reconciliation.status <> 'in_progress' then
    raise exception 'This reconciliation has already been completed.';
  end if;
  select * into bank_transaction from public.bank_transactions where id = bank_transaction_id;
  if bank_transaction.id is null or bank_transaction.bank_account_id <> line_reconciliation.bank_account_id then
    raise exception 'Choose a transaction from the same masjid bank account.';
  end if;
  signed_transaction_amount := case when bank_transaction.entry_type = 'deposit'
    then bank_transaction.amount else -bank_transaction.amount end;
  if signed_transaction_amount <> statement_line.amount
    or bank_transaction.transaction_date <> statement_line.transaction_date then
    raise exception 'The transaction date and signed amount must match the statement line.';
  end if;
  if exists (
    select 1 from public.bank_statement_lines
    where matched_transaction_id = bank_transaction_id
  ) then
    raise exception 'That transaction has already been matched.';
  end if;
  update public.bank_statement_lines
    set matched_transaction_id = bank_transaction_id
    where id = statement_line_id;
end;
$$;

create or replace function public.complete_masjid_bank_reconciliation(p_reconciliation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reconciliation public.bank_reconciliations%rowtype;
  line_count bigint;
  matched_count bigint;
  calculated_balance numeric(14,2);
begin
  if auth.uid() is null or not public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']) then
    raise exception 'You are not allowed to complete bank reconciliations.' using errcode = '42501';
  end if;
  select * into reconciliation
    from public.bank_reconciliations where id = p_reconciliation_id for update;
  if reconciliation.id is null or reconciliation.status <> 'in_progress' then
    raise exception 'The reconciliation is missing or already completed.';
  end if;
  select count(*), count(*) filter (where matched_transaction_id is not null),
    reconciliation.statement_opening_balance + coalesce(sum(amount), 0)
    into line_count, matched_count, calculated_balance
    from public.bank_statement_lines where bank_statement_lines.reconciliation_id = p_reconciliation_id;
  if line_count = 0 or matched_count <> line_count then
    raise exception 'Match every statement line before completing reconciliation.';
  end if;
  if abs(calculated_balance - reconciliation.statement_closing_balance) > 0.01 then
    raise exception 'The statement lines do not add up to the closing balance.';
  end if;
  update public.bank_reconciliations
    set status = 'completed', completed_at = now()
    where id = p_reconciliation_id;
end;
$$;

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_cheques enable row level security;
alter table public.bank_reconciliations enable row level security;
alter table public.bank_statement_lines enable row level security;

revoke all on public.bank_accounts, public.bank_transactions, public.bank_cheques,
  public.bank_reconciliations, public.bank_statement_lines from public, anon;
revoke all on public.bank_account_balances from public, anon;
revoke all on public.bank_masjid_account_options from public, anon;
grant select on public.bank_account_balances, public.bank_masjid_account_options to authenticated;
grant select, insert, update, delete on public.bank_accounts, public.bank_transactions,
  public.bank_cheques, public.bank_reconciliations, public.bank_statement_lines to authenticated;

create policy bank_accounts_read on public.bank_accounts for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']));
create policy bank_accounts_manage on public.bank_accounts for insert to authenticated
with check (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy bank_accounts_update on public.bank_accounts for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy bank_accounts_delete on public.bank_accounts for delete to authenticated
using (public.has_masjid_role(array['admin']));

create policy bank_transactions_read on public.bank_transactions for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']));
create policy bank_transactions_create on public.bank_transactions for insert to authenticated
with check (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and transfer_group_id is null
  and created_by = auth.uid()
);
create policy bank_transactions_update on public.bank_transactions for update to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and transfer_group_id is null
)
with check (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and transfer_group_id is null
);
create policy bank_transactions_delete on public.bank_transactions for delete to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and transfer_group_id is null
);

create policy bank_cheques_read on public.bank_cheques for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']));
create policy bank_cheques_create on public.bank_cheques for insert to authenticated
with check (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and created_by = auth.uid()
  and exists (select 1 from public.bank_accounts where id = bank_account_id and account_type = 'mosque')
);
create policy bank_cheques_update on public.bank_cheques for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']))
with check (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and exists (select 1 from public.bank_accounts where id = bank_account_id and account_type = 'mosque')
);
create policy bank_cheques_delete on public.bank_cheques for delete to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']));

create policy bank_reconciliations_read on public.bank_reconciliations for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager', 'accountant']));
create policy bank_reconciliations_create on public.bank_reconciliations for insert to authenticated
with check (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and created_by = auth.uid()
  and status = 'in_progress'
  and exists (select 1 from public.bank_accounts where id = bank_account_id and account_type = 'mosque')
);
create policy bank_reconciliations_delete on public.bank_reconciliations for delete to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and status = 'in_progress'
);

create policy bank_statement_lines_read on public.bank_statement_lines for select to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and exists (
    select 1 from public.bank_reconciliations r
    where r.id = reconciliation_id
  )
);
create policy bank_statement_lines_create on public.bank_statement_lines for insert to authenticated
with check (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and exists (
    select 1 from public.bank_reconciliations r
    where r.id = reconciliation_id and r.status = 'in_progress'
  )
);
create policy bank_statement_lines_update on public.bank_statement_lines for update to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and matched_transaction_id is null
  and exists (
    select 1 from public.bank_reconciliations r
    where r.id = reconciliation_id and r.status = 'in_progress'
  )
)
with check (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and exists (
    select 1 from public.bank_reconciliations r
    where r.id = reconciliation_id and r.status = 'in_progress'
  )
);
create policy bank_statement_lines_delete on public.bank_statement_lines for delete to authenticated
using (
  public.has_masjid_role(array['admin', 'mosque_manager', 'accountant'])
  and matched_transaction_id is null
  and exists (
    select 1 from public.bank_reconciliations r
    where r.id = reconciliation_id and r.status = 'in_progress'
  )
);

revoke all on function public.record_masjid_bank_transfer(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.record_masjid_bank_transfer(uuid, uuid, numeric, date, text) to authenticated;
revoke all on function public.match_masjid_bank_statement_line(uuid, uuid) from public, anon;
grant execute on function public.match_masjid_bank_statement_line(uuid, uuid) to authenticated;
revoke all on function public.complete_masjid_bank_reconciliation(uuid) from public, anon;
grant execute on function public.complete_masjid_bank_reconciliation(uuid) to authenticated;

commit;
