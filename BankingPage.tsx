import { useMemo, useState, type FormEvent } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Grid, MenuItem,
  Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { AccountBalanceRounded, SwapHorizRounded } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { resources } from '../resources/definitions';
import ResourcePage from '../resources/ResourcePage';
import BankReconciliationPanel from './BankReconciliationPanel';
import { resourceRepository } from '../../services/repository';
import { isLocalDemoEnabled, localDemoCreateBankTransfer, localDemoList } from '../../services/localDemo';
import { supabase } from '../../lib/supabase';
import type { DbRow } from '../../types';
import { getSelectedMosqueId, useMosqueScope } from '../mosques/MosqueScope';

const pageOptions = { page: 0, pageSize: 500, search: '', sortBy: 'account_name', sortDirection: 'asc' as const };
const rolesAllowed = ['admin', 'mosque_manager', 'accountant'];

function localRows(table: string, sortBy: string): DbRow[] {
  return localDemoList(table, {
    page: 0, pageSize: 5000, search: '', sortBy, sortDirection: 'asc', searchFields: [],
    mosqueId: getSelectedMosqueId(),
  }).rows;
}

function currencyText(amount: number, currency: string, locale: 'ur' | 'en') {
  try {
    return new Intl.NumberFormat(locale === 'ur' ? 'ur-PK' : 'en-PK', {
      style: 'currency', currency, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function AccountOverview() {
  const { t, locale } = useI18n();
  const { mosqueId } = useMosqueScope();
  const demo = isLocalDemoEnabled();
  const accountQuery = useQuery<DbRow[]>({
    queryKey: ['bank-account-balances', mosqueId],
    queryFn: async () => {
      if (demo) {
        const accounts = localDemoList('bank_accounts', {
          page: 0, pageSize: 500, search: '', sortBy: 'account_name', sortDirection: 'asc', searchFields: [],
        }).rows.filter((account) => account.account_type === 'central' || account.mosque_id === mosqueId);
        const transactions = localRows('bank_transactions', 'transaction_date');
        return accounts.map((account) => {
          if (account.account_type === 'central') {
            const balance = accounts.filter((child) => child.parent_account_id === account.id)
              .reduce((sum, child) => sum + Number(child.opening_balance ?? 0)
                + transactions.filter((transaction) => transaction.bank_account_id === child.id)
                  .reduce((total, transaction) => total + (transaction.entry_type === 'deposit'
                    ? Number(transaction.amount) : -Number(transaction.amount)), 0), 0);
            return { ...account, current_balance: balance };
          }
          const movements = transactions.filter((transaction) => transaction.bank_account_id === account.id)
            .reduce((sum, transaction) => sum + (transaction.entry_type === 'deposit'
              ? Number(transaction.amount) : -Number(transaction.amount)), 0);
          return { ...account, current_balance: Number(account.opening_balance ?? 0) + movements };
        });
      }
      const { data, error } = await supabase.from('bank_account_balances').select('*')
        .or(`account_type.eq.central,mosque_id.eq.${mosqueId}`)
        .order('account_name').returns<DbRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const accounts = accountQuery.data ?? [];
  const central = accounts.filter((account) => account.account_type === 'central');
  const childAccounts = accounts.filter((account) => account.account_type === 'mosque');
  const currencies = useMemo(() => [...new Set(childAccounts.map((account) => String(account.currency ?? 'PKR')))], [childAccounts]);

  return <Stack spacing={2.2}>
    {accountQuery.error && <Alert severity="error">{accountQuery.error.message}</Alert>}
    {accountQuery.isLoading && <Box display="grid" sx={{ placeItems: 'center', py: 4 }}><CircularProgress /></Box>}
    {!accountQuery.isLoading && !central.length && <Alert severity="info">{t('createCentralFirst')}</Alert>}
    <Grid container spacing={2}>
      {central.map((account) => <Grid key={String(account.id)} size={{ xs: 12, md: 6, xl: 4 }}>
        <Card sx={{ height: '100%' }}><CardContent>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <AccountBalanceRounded color="primary" />
            <Box><Typography color="text.secondary" variant="body2">{t('centralAccount')}</Typography><Typography variant="h6" fontWeight={800}>{String(account.account_name)}</Typography></Box>
          </Stack>
          {currencies.map((currency) => <Typography key={currency} variant="h5" fontWeight={800} mt={2}>{currencyText(
            childAccounts.filter((child) => child.parent_account_id === account.id && child.currency === currency)
              .reduce((sum, child) => sum + Number(child.current_balance ?? 0), 0), currency, locale,
          )}</Typography>)}
          <Typography variant="caption" color="text.secondary">{t('combinedChildBalances')}</Typography>
        </CardContent></Card>
      </Grid>)}
    </Grid>
    <Typography variant="h6" fontWeight={800}>{t('masjidBankAccounts')}</Typography>
    {childAccounts.map((account) => <Card key={String(account.id)} variant="outlined"><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
        <Box>
          <Typography fontWeight={750}>{String(account.account_name)}</Typography>
          <Typography variant="body2" color="text.secondary">
            {String(account.bank_name ?? '')}{account.branch_name ? ` · ${String(account.branch_name)}` : ''}
            {' · '}{t('accountEnding')}{' '}{String(account.account_last4 ?? '----')}
          </Typography>
        </Box>
        <Typography variant="h6" fontWeight={800}>{currencyText(Number(account.current_balance ?? 0), String(account.currency ?? 'PKR'), locale)}</Typography>
      </Stack>
    </CardContent></Card>)}
    {!accountQuery.isLoading && childAccounts.length === 0 && <Alert severity="info">{t('noMasjidAccounts')}</Alert>}
  </Stack>;
}

function BankTransferForm() {
  const { t } = useI18n();
  const cache = useQueryClient();
  const { mosqueId } = useMosqueScope();
  const demo = isLocalDemoEnabled();
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const accountsQuery = useQuery({
    queryKey: ['bank-transfer-accounts', mosqueId],
    queryFn: async () => {
      if (demo) {
        return localDemoList('bank_accounts', {
          page: 0, pageSize: 500, search: '', sortBy: 'account_name', sortDirection: 'asc', searchFields: [],
        }).rows;
      }
      const { data, error } = await supabase.from('bank_accounts')
        .select('id,account_name,account_last4,account_type,parent_account_id,mosque_id,active')
        .eq('account_type', 'mosque').eq('active', true)
        .order('account_name').returns<DbRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const accounts = (accountsQuery.data ?? []).filter((row) => row.account_type === 'mosque' && row.active);
  const transfer = useMutation({
    mutationFn: async () => {
      const numericAmount = Number(amount);
      if (!fromAccount || !toAccount || fromAccount === toAccount || !date || !description.trim()
        || !Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error(t('invalidTransfer'));
      }
      const input = {
        from_account_id: fromAccount,
        to_account_id: toAccount,
        amount: numericAmount,
        transaction_date: date,
        description: description.trim(),
      };
      if (demo) {
        localDemoCreateBankTransfer(input);
        return;
      }
      const { error } = await supabase.rpc('record_masjid_bank_transfer', {
        from_account_id: input.from_account_id,
        to_account_id: input.to_account_id,
        transfer_amount: input.amount,
        transfer_date: input.transaction_date,
        transfer_description: input.description,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setAmount('');
      setDescription('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['bank-account-balances'] }),
        cache.invalidateQueries({ queryKey: ['resource'] }),
      ]);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    transfer.mutate();
  }

  return <Card><CardContent>
    <Typography variant="h6" fontWeight={800} mb={2}>{t('transferBetweenMasajid')}</Typography>
    <Box component="form" onSubmit={submit}>
      <Stack spacing={1.7}>
        {transfer.error && <Alert severity="error">{transfer.error.message}</Alert>}
        {transfer.isSuccess && <Alert severity="success">{t('transferRecorded')}</Alert>}
        {accountsQuery.error && <Alert severity="error">{accountsQuery.error.message}</Alert>}
        <Alert severity="info">{t('transferIsRecordOnly')}</Alert>
        <TextField select required label={t('fromAccount')} value={fromAccount} onChange={(event) => setFromAccount(event.target.value)}>
          {accounts.map((account) => <MenuItem key={String(account.id)} value={String(account.id)}>{String(account.account_name)} · {String(account.account_last4 ?? '')}</MenuItem>)}
        </TextField>
        <TextField select required label={t('toAccount')} value={toAccount} onChange={(event) => setToAccount(event.target.value)}>
          {accounts.filter((account) => account.id !== fromAccount).map((account) => <MenuItem key={String(account.id)} value={String(account.id)}>{String(account.account_name)} · {String(account.account_last4 ?? '')}</MenuItem>)}
        </TextField>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField required type="number" label={t('amount')} value={amount} onChange={(event) => setAmount(event.target.value)} slotProps={{ htmlInput: { min: 0.01, step: '0.01' } }} />
          <TextField required type="date" label={t('date')} value={date} onChange={(event) => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
        <TextField required label={t('description')} value={description} onChange={(event) => setDescription(event.target.value)} inputProps={{ maxLength: 500 }} />
        <Box><Button type="submit" variant="contained" startIcon={<SwapHorizRounded />} disabled={transfer.isPending || accounts.length < 2}>
          {transfer.isPending ? <CircularProgress size={20} color="inherit" /> : t('recordTransfer')}
        </Button></Box>
      </Stack>
    </Box>
  </CardContent></Card>;
}

export default function BankingPage() {
  const { t } = useI18n();
  const { role } = useAuth();
  const { mosqueId } = useMosqueScope();
  const [tab, setTab] = useState(0);
  const accountRowsQuery = useQuery({
    queryKey: ['bank-accounts-for-reconciliation', mosqueId],
    queryFn: async () => (await resourceRepository.list(resources.bankAccounts, pageOptions)).rows,
  });

  if (!role || !rolesAllowed.includes(role)) return <Alert severity="error">{t('noPermission')}</Alert>;

  return <Stack spacing={2.2} className="page-enter">
    <Box>
      <Typography variant="h4" fontWeight={800}>{t('banking')}</Typography>
      <Typography color="text.secondary" mt={0.5}>{t('bankingDescription')}</Typography>
    </Box>
    <Alert severity="warning">{t('bankPrivacyNotice')}</Alert>
    <Tabs value={tab} onChange={(_event, value: number) => setTab(value)} variant="scrollable" allowScrollButtonsMobile>
      <Tab label={t('bankOverview')} />
      <Tab label={t('bankAccounts')} />
      <Tab label={t('bankTransactions')} />
      <Tab label={t('chequeBook')} />
      <Tab label={t('transfers')} />
      <Tab label={t('reconciliation')} />
    </Tabs>
    {tab === 0 && <AccountOverview />}
    {tab === 1 && <ResourcePage definition={resources.bankAccounts} />}
    {tab === 2 && <ResourcePage definition={resources.bankTransactions} />}
    {tab === 3 && <ResourcePage definition={resources.bankCheques} />}
    {tab === 4 && <BankTransferForm />}
    {tab === 5 && (accountRowsQuery.error
      ? <Alert severity="error">{accountRowsQuery.error.message}</Alert>
      : <BankReconciliationPanel accountRows={accountRowsQuery.data ?? []} />)}
  </Stack>;
}
