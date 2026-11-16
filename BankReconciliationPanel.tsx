import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, IconButton, MenuItem, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { DeleteOutlineRounded } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resourceRepository } from '../../services/repository';
import {
  isLocalDemoEnabled, localDemoCompleteBankReconciliation, localDemoCreateBankReconciliation,
  localDemoImportBankStatementLines, localDemoList, localDemoMatchBankStatementLine, localDemoRemove,
} from '../../services/localDemo';
import { supabase } from '../../lib/supabase';
import { resources } from '../resources/definitions';
import { useI18n } from '../../i18n';
import type { DbRow } from '../../types';
import { csvRecords } from '../../utils/csv';
import { getSelectedMosqueId, useMosqueScope } from '../mosques/MosqueScope';

type StatementLine = {
  transaction_date: string;
  description: string;
  amount: number;
  reference: string | null;
};

const pageOptions = { page: 0, pageSize: 500, search: '', sortBy: 'account_name', sortDirection: 'asc' as const };
const transactionOptions = { ...pageOptions, sortBy: 'transaction_date' };

function columnIndex(headers: string[], terms: string[]): number {
  return headers.findIndex((header) => terms.some((term) => header.includes(term)));
}

function parseStatementCsv(text: string): StatementLine[] {
  const rows = csvRecords(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('The CSV file must contain a header row and at least one statement line.');
  if (rows.length > 5001) throw new Error('Import up to 5,000 statement lines at a time.');
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[_-]+/g, ' ').trim());
  const dateColumn = columnIndex(headers, ['date']);
  const descriptionColumn = columnIndex(headers, ['description', 'narration', 'particular', 'details']);
  const amountColumn = columnIndex(headers, ['amount', 'transaction amount']);
  const debitColumn = columnIndex(headers, ['debit', 'withdrawal', 'paid out']);
  const creditColumn = columnIndex(headers, ['credit', 'deposit', 'paid in']);
  const referenceColumn = columnIndex(headers, ['reference', 'ref no', 'cheque', 'check no']);
  if (dateColumn < 0 || descriptionColumn < 0 || (amountColumn < 0 && debitColumn < 0 && creditColumn < 0)) {
    throw new Error('CSV needs Date, Description and signed Amount columns. Alternatively, provide separate Debit and Credit columns.');
  }

  const parsed = rows.slice(1).map((cells, index): StatementLine => {
    const rawDate = cells[dateColumn]?.trim() ?? '';
    let transactionDate = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) transactionDate = rawDate;
    else {
      const localDate = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (localDate) transactionDate = `${localDate[3]}-${localDate[2].padStart(2, '0')}-${localDate[1].padStart(2, '0')}`;
    }
    if (!transactionDate || Number.isNaN(Date.parse(`${transactionDate}T00:00:00Z`))) {
      throw new Error(`CSV row ${index + 2}: use date format YYYY-MM-DD or DD/MM/YYYY.`);
    }
    const description = cells[descriptionColumn]?.trim() ?? '';
    if (!description || description.length > 500) throw new Error(`CSV row ${index + 2}: enter a description (up to 500 characters).`);

    let rawAmount: string;
    let amountIsDebit = false;
    if (amountColumn >= 0 && cells[amountColumn]?.trim()) rawAmount = cells[amountColumn].trim();
    else {
      const debit = cells[debitColumn]?.trim() ?? '';
      const credit = cells[creditColumn]?.trim() ?? '';
      if (Boolean(debit) === Boolean(credit)) throw new Error(`CSV row ${index + 2}: enter either Debit or Credit, not both.`);
      amountIsDebit = Boolean(debit);
      rawAmount = debit || credit;
    }
    const parenthesized = /^\(.*\)$/.test(rawAmount);
    const amountText = (parenthesized ? rawAmount.slice(1, -1) : rawAmount).trim();
    const amountMatch = amountText.match(/^(?:[A-Z]{3}\s*)?[$£€₨]?\s*([-+]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\s*$/i);
    const numeric = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : Number.NaN;
    if (!Number.isFinite(numeric) || numeric === 0) throw new Error(`CSV row ${index + 2}: amount must be a non-zero number.`);
    const amount = amountIsDebit ? -Math.abs(numeric) : parenthesized ? -Math.abs(numeric) : numeric;
    const reference = referenceColumn >= 0 ? cells[referenceColumn]?.trim() : '';
    return { transaction_date: transactionDate, description, amount, reference: reference || null };
  });
  return parsed;
}

function localRows(table: string, sortBy: string): DbRow[] {
  return localDemoList(table, {
    page: 0, pageSize: 5000, search: '', sortBy, sortDirection: 'desc', searchFields: [],
    mosqueId: getSelectedMosqueId(),
  }).rows;
}

export default function BankReconciliationPanel({ accountRows }: { accountRows: DbRow[] }) {
  const { t } = useI18n();
  const { mosqueId } = useMosqueScope();
  const cache = useQueryClient();
  const demo = isLocalDemoEnabled();
  const childAccounts = useMemo(() => accountRows.filter((account) => account.account_type === 'mosque' && account.active), [accountRows]);
  const [accountId, setAccountId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [lineDate, setLineDate] = useState('');
  const [lineDescription, setLineDescription] = useState('');
  const [lineAmount, setLineAmount] = useState('');
  const [lineReference, setLineReference] = useState('');
  const [fileError, setFileError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<Record<string, string>>({});
  const reconciliationQuery = useQuery({
    queryKey: ['bank-reconciliations', mosqueId],
    queryFn: async () => {
      if (demo) return localRows('bank_reconciliations', 'created_at');
      const { data, error } = await supabase.from('bank_reconciliations').select('*')
        .eq('mosque_id', mosqueId).order('created_at', { ascending: false }).returns<DbRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const activeReconciliations = (reconciliationQuery.data ?? []).filter((row) => row.status === 'in_progress');
  const selected = activeReconciliations.find((row) => row.id === selectedId);
  const lineQuery = useQuery({
    queryKey: ['bank-statement-lines', mosqueId, selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      if (demo) return localRows('bank_statement_lines', 'transaction_date').filter((row) => row.reconciliation_id === selectedId);
      const { data, error } = await supabase.from('bank_statement_lines').select('*')
        .eq('mosque_id', mosqueId).eq('reconciliation_id', selectedId).order('transaction_date').returns<DbRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const transactionsQuery = useQuery({
    queryKey: ['bank-reconciliation-transactions', mosqueId],
    queryFn: () => resourceRepository.list(resources.bankTransactions, transactionOptions),
  });

  async function insertLines(reconciliationId: string, lines: StatementLine[]) {
    if (demo) {
      localDemoImportBankStatementLines(reconciliationId, lines);
      return;
    }
    const { error } = await supabase.from('bank_statement_lines').insert(
      lines.map((line) => ({ reconciliation_id: reconciliationId, ...line })),
    );
    if (error) throw error;
  }

  const createReconciliation = useMutation({
    mutationFn: async () => {
      if (!accountId || !periodStart || !periodEnd || !openingBalance || !closingBalance) {
        throw new Error('Choose an account, period, opening balance and closing balance.');
      }
      if (periodEnd < periodStart) throw new Error('The statement end date must not be before its start date.');
      const values = {
        bank_account_id: accountId,
        period_start: periodStart,
        period_end: periodEnd,
        statement_opening_balance: Number(openingBalance),
        statement_closing_balance: Number(closingBalance),
      };
      if (demo) return localDemoCreateBankReconciliation(values);
      const { data, error } = await supabase.from('bank_reconciliations').insert(values).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async (id) => {
      setSelectedId(id);
      await cache.invalidateQueries({ queryKey: ['bank-reconciliations', mosqueId] });
    },
  });
  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedId) throw new Error('Create or choose an open reconciliation first.');
      if (file.size > 5 * 1024 * 1024) throw new Error('CSV file size must be 5 MB or less.');
      const lines = parseStatementCsv(await file.text());
      const reconciliation = activeReconciliations.find((row) => row.id === selectedId);
      if (!reconciliation) throw new Error('Choose an open reconciliation.');
      if (lines.some((line) => line.transaction_date < String(reconciliation.period_start) || line.transaction_date > String(reconciliation.period_end))) {
        throw new Error('All statement line dates must be inside the reconciliation period.');
      }
      await insertLines(selectedId, lines);
      return lines.length;
    },
    onSuccess: async () => {
      setFileError('');
      await cache.invalidateQueries({ queryKey: ['bank-statement-lines', selectedId] });
    },
    onError: (error: unknown) => setFileError(error instanceof Error ? error.message : t('unexpectedError')),
  });
  const addManualLine = useMutation({
    mutationFn: async () => {
      if (!selectedId || !lineDate || !lineDescription.trim() || !lineAmount) throw new Error('Complete the date, description and signed amount.');
      const line: StatementLine = {
        transaction_date: lineDate,
        description: lineDescription.trim(),
        amount: Number(lineAmount),
        reference: lineReference.trim() || null,
      };
      if (!Number.isFinite(line.amount) || line.amount === 0) throw new Error('Enter a non-zero amount: deposits are positive and withdrawals are negative.');
      if (selected && (line.transaction_date < String(selected.period_start) || line.transaction_date > String(selected.period_end))) {
        throw new Error('The line date must be inside the selected reconciliation period.');
      }
      await insertLines(selectedId, [line]);
    },
    onSuccess: async () => {
      setLineDate('');
      setLineDescription('');
      setLineAmount('');
      setLineReference('');
      await cache.invalidateQueries({ queryKey: ['bank-statement-lines', selectedId] });
    },
  });
  const matchLine = useMutation({
    mutationFn: async ({ lineId, transactionId }: { lineId: string; transactionId: string }) => {
      if (demo) return localDemoMatchBankStatementLine(lineId, transactionId);
      const { error } = await supabase.rpc('match_masjid_bank_statement_line', {
        statement_line_id: lineId, bank_transaction_id: transactionId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['bank-statement-lines', selectedId] }),
        cache.invalidateQueries({ queryKey: ['bank-reconciliation-transactions'] }),
      ]);
    },
  });
  const complete = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Choose an open reconciliation.');
      if (demo) return localDemoCompleteBankReconciliation(selectedId);
      const { error } = await supabase.rpc('complete_masjid_bank_reconciliation', { p_reconciliation_id: selectedId });
      if (error) throw error;
    },
    onSuccess: async () => {
      setSelectedId('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['bank-reconciliations'] }),
        cache.invalidateQueries({ queryKey: ['bank-account-balances'] }),
      ]);
    },
  });
  const removeLine = useMutation({
    mutationFn: async (lineId: string) => {
      if (demo) {
        localDemoRemove('bank_statement_lines', 'id', lineId);
        return;
      }
      const { error } = await supabase.from('bank_statement_lines').delete().eq('id', lineId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['bank-statement-lines', selectedId] });
    },
  });

  const transactions = transactionsQuery.data?.rows ?? [];
  const statementLines = lineQuery.data ?? [];
  const errorMessage = createReconciliation.error ?? addManualLine.error ?? matchLine.error ?? complete.error ?? removeLine.error;
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) importCsv.mutate(file);
    event.target.value = '';
  }

  function submitReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createReconciliation.mutate();
  }

  function submitLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addManualLine.mutate();
  }

  return <Stack spacing={2.2}>
    {errorMessage && <Alert severity="error">{errorMessage instanceof Error ? errorMessage.message : t('unexpectedError')}</Alert>}
    {fileError && <Alert severity="error">{fileError}</Alert>}
    {importCsv.isSuccess && <Alert severity="success">{t('statementLinesImported')}</Alert>}
    {createReconciliation.isSuccess && <Alert severity="success">{t('reconciliationStarted')}</Alert>}
    <Card><CardContent>
      <Typography variant="h6" fontWeight={750} mb={1}>{t('startReconciliation')}</Typography>
      <Box component="form" onSubmit={submitReconciliation}>
        <Stack spacing={1.5}>
          <TextField select required label={t('accountName')} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {childAccounts.map((account) => <MenuItem key={String(account.id)} value={String(account.id)}>{String(account.account_name)}</MenuItem>)}
          </TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField required type="date" label={t('periodStart')} value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField required type="date" label={t('periodEnd')} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField required type="number" label={t('statementOpeningBalance')} value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} slotProps={{ htmlInput: { step: '0.01' } }} />
            <TextField required type="number" label={t('statementClosingBalance')} value={closingBalance} onChange={(event) => setClosingBalance(event.target.value)} slotProps={{ htmlInput: { step: '0.01' } }} />
          </Stack>
          <Box><Button type="submit" variant="contained" disabled={createReconciliation.isPending}>
            {createReconciliation.isPending ? <CircularProgress size={20} color="inherit" /> : t('startReconciliation')}
          </Button></Box>
        </Stack>
      </Box>
    </CardContent></Card>

    <Card><CardContent>
      <Stack spacing={1.5}>
        <Typography variant="h6" fontWeight={750}>{t('matchBankStatement')}</Typography>
        {reconciliationQuery.error && <Alert severity="error">{reconciliationQuery.error.message}</Alert>}
        <TextField select label={t('openReconciliation')} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <MenuItem value="">{t('chooseReconciliation')}</MenuItem>
          {activeReconciliations.map((row) => <MenuItem key={String(row.id)} value={String(row.id)}>
            {String(childAccounts.find((account) => account.id === row.bank_account_id)?.account_name ?? row.bank_account_id)}
            {' · '}{String(row.period_start)} – {String(row.period_end)}
          </MenuItem>)}
        </TextField>
        <Alert severity="info">{t('statementCsvFormat')}</Alert>
        <Button component="label" variant="outlined" disabled={!selectedId || importCsv.isPending} sx={{ alignSelf: 'flex-start' }}>
          {importCsv.isPending ? <CircularProgress size={20} /> : t('importCsv')}
          <input hidden type="file" accept=".csv,text/csv" onChange={chooseFile} />
        </Button>
        {selectedId && <Box component="form" onSubmit={submitLine}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.3} alignItems={{ md: 'flex-start' }}>
            <TextField required type="date" size="small" label={t('date')} value={lineDate} onChange={(event) => setLineDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField required size="small" label={t('description')} value={lineDescription} onChange={(event) => setLineDescription(event.target.value)} />
            <TextField required type="number" size="small" label={t('signedAmount')} value={lineAmount} onChange={(event) => setLineAmount(event.target.value)} slotProps={{ htmlInput: { step: '0.01' } }} />
            <TextField size="small" label={t('reference')} value={lineReference} onChange={(event) => setLineReference(event.target.value)} />
            <Button type="submit" variant="outlined" disabled={addManualLine.isPending}>{t('addStatementLine')}</Button>
          </Stack>
        </Box>}
        {lineQuery.error && <Alert severity="error">{lineQuery.error.message}</Alert>}
        {lineQuery.isLoading && <CircularProgress size={22} />}
        {statementLines.length > 0 && <TableContainer sx={{ overflowX: 'auto' }}><Table size="small">
          <TableHead><TableRow>
            <TableCell>{t('date')}</TableCell><TableCell>{t('description')}</TableCell>
            <TableCell>{t('signedAmount')}</TableCell><TableCell>{t('reference')}</TableCell>
            <TableCell>{t('matchTransaction')}</TableCell><TableCell>{t('status')}</TableCell><TableCell>{t('actions')}</TableCell>
          </TableRow></TableHead>
          <TableBody>{statementLines.map((line) => {
            const reconciliation = activeReconciliations.find((row) => row.id === selectedId);
            const candidates = transactions.filter((transaction) => {
              const amount = transaction.entry_type === 'deposit' ? Number(transaction.amount) : -Number(transaction.amount);
              return transaction.bank_account_id === reconciliation?.bank_account_id
                && transaction.transaction_date === line.transaction_date
                && amount === Number(line.amount)
                && !(lineQuery.data ?? []).some((other) => other.matched_transaction_id === transaction.id);
            });
            return <TableRow key={String(line.id)}>
              <TableCell>{String(line.transaction_date)}</TableCell>
              <TableCell>{String(line.description)}</TableCell>
              <TableCell>{Number(line.amount).toLocaleString()}</TableCell>
              <TableCell>{String(line.reference ?? '—')}</TableCell>
              <TableCell sx={{ minWidth: 240 }}>
                {line.matched_transaction_id
                  ? String(transactions.find((transaction) => transaction.id === line.matched_transaction_id)?.description ?? t('matched'))
                  : <Stack direction="row" spacing={1}>
                    <TextField select size="small" label={t('transaction')} value={selectedMatch[String(line.id)] ?? ''}
                      onChange={(event) => setSelectedMatch({ ...selectedMatch, [String(line.id)]: event.target.value })}>
                      {candidates.map((transaction) => <MenuItem key={String(transaction.id)} value={String(transaction.id)}>
                        {String(transaction.transaction_date)} · {String(transaction.description)} · {Number(transaction.amount).toLocaleString()}
                      </MenuItem>)}
                    </TextField>
                    <Button size="small" disabled={!selectedMatch[String(line.id)] || matchLine.isPending}
                      onClick={() => matchLine.mutate({ lineId: String(line.id), transactionId: selectedMatch[String(line.id)] })}>
                      {t('match')}
                    </Button>
                  </Stack>}
              </TableCell>
              <TableCell>{line.matched_transaction_id ? t('matched') : t('unmatched')}</TableCell>
              <TableCell>{!line.matched_transaction_id && <IconButton size="small" color="error" aria-label={t('delete')}
                disabled={removeLine.isPending} onClick={() => removeLine.mutate(String(line.id))}>
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table></TableContainer>}
        {selectedId && <Button variant="contained" color="secondary" disabled={!statementLines.length || complete.isPending || statementLines.some((line) => !line.matched_transaction_id)}
          onClick={() => complete.mutate()} sx={{ alignSelf: 'flex-start' }}>
          {complete.isPending ? <CircularProgress size={20} color="inherit" /> : t('completeReconciliation')}
        </Button>}
      </Stack>
    </CardContent></Card>
    {reconciliationQuery.data?.some((row) => row.status === 'completed') && <Card><CardContent>
      <Typography variant="h6" fontWeight={750} mb={1}>{t('completedReconciliations')}</Typography>
      {reconciliationQuery.data.filter((row) => row.status === 'completed').map((row) => <Typography key={String(row.id)} variant="body2" color="text.secondary">
        {String(childAccounts.find((account) => account.id === row.bank_account_id)?.account_name ?? row.bank_account_id)}
        {' · '}{String(row.period_start)} – {String(row.period_end)} · {t('completed')}
      </Typography>)}
    </CardContent></Card>}
  </Stack>;
}
