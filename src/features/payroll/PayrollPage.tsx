import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AddRounded, PaymentsRounded, PrintRounded } from '@mui/icons-material';
import {
  Alert, Autocomplete, Avatar, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TablePagination,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { DataPanel, EmployeeAvatar, EmptyState, ErrorState, LoadingState, PageHeading } from '../../components/common';
import { displayError, formatCurrency } from '../../lib/format';
import { compensationRepository, employeeRepository } from '../../services/repositories';
import { useAuth } from '../auth/AuthProvider';
import type { Compensation, Employee } from '../../types';

const schema = z.object({
  Employee_ID: z.string().min(1, 'Choose an employee.'),
  Base_Salary: z.string().refine((value) => value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0, 'Enter the base salary as a whole number.'),
  Bonus_Percentage: z.string().refine((value) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0, 'Enter a non-negative percentage.'),
  Medical_Allowance: z.string().refine((value) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0, 'Enter a non-negative allowance.'),
  Tax_Deduction: z.string().refine((value) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0, 'Enter a non-negative deduction.'),
});
type Input = z.infer<typeof schema>;
type Notice = { message: string; severity: 'success' | 'error' } | null;

function printStatement(employee: Employee | undefined, record: Compensation) {
  const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  const name = employee ? `${employee.First_Name} ${employee.Last_Name}` : record.Employee_ID;
  const currency = import.meta.env.VITE_CURRENCY || 'USD';
  const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Compensation statement ${esc(record.Record_ID)}</title><style>body{font:15px system-ui,sans-serif;max-width:720px;margin:60px auto;padding:0 32px;color:#25243a}h1{font-size:28px}.brand{color:#6658e8;font-weight:750}table{width:100%;border-collapse:collapse;margin:32px 0}td{padding:14px 0;border-bottom:1px solid #eee}td:last-child{text-align:right}tfoot td{font-weight:700;border-bottom:0;font-size:18px}</style></head><body><p class="brand">peopleOS</p><h1>Compensation statement</h1><p>Record: <strong>${esc(record.Record_ID)}</strong></p><p>Employee: <strong>${esc(name)}</strong> · ${esc(record.Employee_ID)}</p><table><tbody><tr><td>Base salary</td><td>${esc(money(record.Base_Salary))}</td></tr><tr><td>Bonus (${record.Bonus_Percentage}%)</td><td>${esc(money(record.Base_Salary * record.Bonus_Percentage / 100))}</td></tr><tr><td>Medical allowance</td><td>${esc(money(record.Medical_Allowance))}</td></tr><tr><td>Tax deduction</td><td>−${esc(money(record.Tax_Deduction))}</td></tr></tbody><tfoot><tr><td>Net salary</td><td>${esc(money(record.Net_Salary))}</td></tr></tfoot></table><small>This schema stores no pay period. This statement identifies the compensation record only; it does not establish when it was paid.</small><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function PayrollPage() {
  const cache = useQueryClient();
  const { role, user } = useAuth();
  const isManager = role === 'admin' || role === 'hr_manager';
  const [open, setOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const sortDirection = 'desc' as const;
  const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { Employee_ID: '', Base_Salary: '', Bonus_Percentage: '0', Medical_Allowance: '0', Tax_Deduction: '0' } });
  const selectedEmployeeId = form.watch('Employee_ID');
  useEffect(() => {
    const timer = window.setTimeout(() => setEmployeeSearchTerm(employeeSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [employeeSearch]);
  const employeeList = useQuery({
    queryKey: ['employee-picker', employeeSearchTerm, selectedEmployeeId],
    queryFn: () => employeeRepository.searchForSelection(employeeSearchTerm, selectedEmployeeId || null),
    enabled: isManager && open && (employeeSearchTerm.length === 0 || employeeSearchTerm.length >= 3),
  });
  const ownProfile = useQuery({ queryKey: ['employee-profile', user?.email], queryFn: () => employeeRepository.getForUser(user!.email!), enabled: !isManager && Boolean(user?.email) });
  const records = useQuery({
    queryKey: ['compensation', isManager ? 'all' : ownProfile.data?.Employee_ID, page, pageSize, sortDirection],
    queryFn: () => compensationRepository.listPage({
      page, pageSize, sortDirection, employeeId: isManager ? undefined : ownProfile.data?.Employee_ID,
    }),
    enabled: isManager || ownProfile.isFetched,
  });
  const [notice, setNotice] = useState<Notice>(null);
  const selectedEmployee = employeeList.data?.find((person) => person.Employee_ID === selectedEmployeeId);
  const create = useMutation({
    mutationFn: (values: Input) => compensationRepository.save({
      Employee_ID: values.Employee_ID, Base_Salary: Number(values.Base_Salary),
      Bonus_Percentage: Number(values.Bonus_Percentage), Medical_Allowance: Number(values.Medical_Allowance),
      Tax_Deduction: Number(values.Tax_Deduction),
    }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['compensation'] }),
        cache.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setOpen(false);
      setNotice({ message: 'Compensation record created. Net salary is calculated by PostgreSQL.', severity: 'success' });
    },
    onError: (error: unknown) => setNotice({ message: displayError(error), severity: 'error' }),
  });
  const rows = records.data?.rows ?? [];
  const pageEmployeeIds = [...new Set(rows.map((record) => record.Employee_ID))];
  const pageEmployees = useQuery({
    queryKey: ['employees-by-ids', pageEmployeeIds],
    queryFn: () => employeeRepository.byIds(pageEmployeeIds),
    enabled: isManager && pageEmployeeIds.length > 0,
  });
  const employeesById = useMemo(() => new Map((pageEmployees.data ?? []).map((employee) => [employee.Employee_ID, employee])), [pageEmployees.data]);
  const totalRecords = records.data?.total ?? 0;
  const total = rows.reduce((sum, record) => sum + Number(record.Net_Salary), 0);

  return <Box className="page-enter">
    <PageHeading eyebrow="YOUR WORK, RECOGNIZED" title={isManager ? 'People first. Pay, clearly recorded.' : 'A clear view of your compensation.'} description="Your database tracks salary components and calculated net pay; it does not store pay dates or payment status." action={isManager ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => { form.reset({ Employee_ID: '', Base_Salary: '', Bonus_Percentage: '0', Medical_Allowance: '0', Tax_Deduction: '0' }); setEmployeeSearch(''); setOpen(true); }}>Add compensation</Button> : undefined} />
    <Grid container spacing={2} mb={2.5}>
      <Grid size={{ xs: 12, sm: 6 }}><Card><Box p={2.25} display="flex" alignItems="center" gap={1.5}><Avatar variant="rounded" sx={{ bgcolor: '#eeeaff', color: 'primary.main' }}><PaymentsRounded /></Avatar><Box><Typography variant="caption" color="text.secondary">NET SALARY ON CURRENT PAGE</Typography><Typography variant="h5">{formatCurrency(total)}</Typography></Box></Box></Card></Grid>
      <Grid size={{ xs: 12, sm: 6 }}><Card><Box p={2.25} display="flex" alignItems="center" gap={1.5}><Avatar variant="rounded" sx={{ bgcolor: '#e6f7f0', color: 'success.main' }}><PaymentsRounded /></Avatar><Box><Typography variant="caption" color="text.secondary">COMPENSATION RECORDS</Typography><Typography variant="h5">{totalRecords}</Typography></Box></Box></Card></Grid>
    </Grid>
    <DataPanel title={isManager ? 'Compensation records.' : 'Your compensation records.'} subtitle="These records have no stored salary date, pay period, or payment-status field.">
      {records.isPending || (!isManager && ownProfile.isPending) ? <LoadingState /> : records.error ? <ErrorState message={displayError(records.error)} onRetry={() => void records.refetch()} /> : !totalRecords ? <EmptyState title={isManager ? 'A clear start for your compensation records.' : 'Your compensation details will appear here.'} description={isManager ? 'Add a salary record to see base pay, bonuses, allowances, deductions, and database-calculated net salary.' : 'Your private salary records will appear here once HR has added them.'} action={isManager && <Button variant="contained" onClick={() => setOpen(true)}>Add compensation</Button>} /> :
        <TableContainer sx={{ overflowX: 'auto' }}><Table size="small" aria-label="Compensation records"><TableHead><TableRow>{[...(isManager ? ['EMPLOYEE'] : []), 'RECORD ID', 'BASE SALARY', 'BONUS %', 'MEDICAL ALLOWANCE', 'TAX DEDUCTION', 'NET SALARY', ''].map((heading) => <TableCell key={heading} sx={{ bgcolor: '#fbfbfd', color: 'text.secondary', fontSize: 10, fontWeight: 750, whiteSpace: 'nowrap' }}>{heading}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((record) => {
          const employee = employeesById.get(record.Employee_ID) ?? (!isManager ? ownProfile.data ?? undefined : undefined);
          return <TableRow hover key={record.Record_ID}>{isManager && <TableCell><Stack direction="row" alignItems="center" spacing={1}><EmployeeAvatar employee={{ First_Name: employee?.First_Name ?? '?', Last_Name: employee?.Last_Name ?? '' }} /><Box><Typography variant="body2">{employee ? `${employee.First_Name} ${employee.Last_Name}` : record.Employee_ID}</Typography><Typography variant="caption">{record.Employee_ID}</Typography></Box></Stack></TableCell>}<TableCell>{record.Record_ID}</TableCell><TableCell>{formatCurrency(record.Base_Salary)}</TableCell><TableCell>{record.Bonus_Percentage}%</TableCell><TableCell>{formatCurrency(record.Medical_Allowance)}</TableCell><TableCell>{formatCurrency(record.Tax_Deduction)}</TableCell><TableCell><Typography fontWeight={750}>{formatCurrency(record.Net_Salary)}</Typography></TableCell><TableCell><Button size="small" startIcon={<PrintRounded />} onClick={() => printStatement(employee, record)}>Statement</Button></TableCell></TableRow>;
        })}</TableBody></Table></TableContainer>}
      {totalRecords > 0 && <TablePagination component="div" count={totalRecords} page={page} onPageChange={(_event, nextPage) => setPage(nextPage)} rowsPerPage={pageSize} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Rows:" />}
    </DataPanel>
    <Dialog open={open} onClose={() => !create.isPending && setOpen(false)} maxWidth="sm" fullWidth><DialogTitle>Record compensation.</DialogTitle><DialogContent dividers><Stack component="form" id="compensation-form" spacing={2} pt={1} onSubmit={form.handleSubmit((values) => create.mutate(values))}>
      <Controller control={form.control} name="Employee_ID" render={({ field }) => {
        const options = (employeeList.data ?? []).filter((employee) => employee.Employment_Status !== 'Terminated');
        return <Autocomplete
          options={options}
          value={options.find((employee) => employee.Employee_ID === field.value) ?? null}
          inputValue={employeeSearch}
          getOptionLabel={(employee) => `${employee.First_Name} ${employee.Last_Name} · ${employee.Employee_ID}`}
          isOptionEqualToValue={(option, value) => option.Employee_ID === value.Employee_ID}
          onInputChange={(_event, value, reason) => { if (reason === 'input' || reason === 'clear') setEmployeeSearch(value); }}
          onChange={(_event, employee) => field.onChange(employee?.Employee_ID ?? '')}
          loading={employeeList.isPending}
          noOptionsText={employeeList.error ? 'Could not load employees' : 'No matching employees'}
          renderInput={(params) => <TextField {...params} label="Employee" error={Boolean(form.formState.errors.Employee_ID)} helperText={form.formState.errors.Employee_ID?.message ?? (employeeSearch.trim().length > 0 && employeeSearch.trim().length < 3 ? 'Enter at least 3 characters to search.' : undefined)} />}
        />;
      }} />
      <TextField label="Base salary (whole number)" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: 1 } }} {...form.register('Base_Salary')} error={Boolean(form.formState.errors.Base_Salary)} helperText={form.formState.errors.Base_Salary?.message} />
      <Grid container spacing={1.5}><Grid size={4}><TextField label="Bonus %" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: '0.01' } }} {...form.register('Bonus_Percentage')} /></Grid><Grid size={4}><TextField label="Medical allowance" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: '0.01' } }} {...form.register('Medical_Allowance')} /></Grid><Grid size={4}><TextField label="Tax deduction" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: '0.01' } }} {...form.register('Tax_Deduction')} /></Grid></Grid>
      <Alert severity="info">{selectedEmployee ? `The new record is for ${selectedEmployee.First_Name} ${selectedEmployee.Last_Name}. ` : ''}PostgreSQL calculates net salary = base salary + base salary × bonus % + medical allowance − tax.</Alert>
    </Stack></DialogContent><DialogActions sx={{ p: 2 }}><Button color="inherit" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="compensation-form" variant="contained" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save compensation'}</Button></DialogActions></Dialog>
    <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={notice?.severity} onClose={() => setNotice(null)}>{notice?.message}</Alert></Snackbar>
  </Box>;
}
