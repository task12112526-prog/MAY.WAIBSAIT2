import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AddRounded, DownloadRounded } from '@mui/icons-material';
import {
  Alert, Autocomplete, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, Snackbar, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import { DataPanel, EmployeeAvatar, EmptyState, ErrorState, LoadingState, PageHeading } from '../../components/common';
import { displayError } from '../../lib/format';
import { attendanceRepository, employeeRepository } from '../../services/repositories';
import { useAuth } from '../auth/AuthProvider';
import type { Employee } from '../../types';

const schema = z.object({
  Employee_ID: z.string().min(1, 'Choose an employee.'),
  Total_Working_Days: z.string().refine((value) => /^\d+$/.test(value) && Number(value) <= 366, 'Enter a whole number from 0 to 366.'),
  Days_Present: z.string().refine((value) => /^\d+$/.test(value), 'Enter a whole number.'),
  Days_Absent: z.string().refine((value) => /^\d+$/.test(value), 'Enter a whole number.'),
  Paid_Leaves: z.string().refine((value) => /^\d+$/.test(value), 'Enter a whole number.'),
});
type Input = z.infer<typeof schema>;
type Notice = { message: string; severity: 'success' | 'error' } | null;

function escapeCsv(value: string): string {
  const safe = /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function AttendancePage() {
  const cache = useQueryClient();
  const { role, user } = useAuth();
  const isManager = role === 'admin' || role === 'hr_manager';
  const [open, setOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const sortDirection = 'desc' as const;
  const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { Employee_ID: '', Total_Working_Days: '', Days_Present: '', Days_Absent: '', Paid_Leaves: '0' } });
  const selectedEmployeeId = form.watch('Employee_ID');
  useEffect(() => {
    const timer = window.setTimeout(() => setEmployeeSearchTerm(employeeSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [employeeSearch]);
  const people = useQuery({
    queryKey: ['employee-picker', employeeSearchTerm, selectedEmployeeId],
    queryFn: () => employeeRepository.searchForSelection(employeeSearchTerm, selectedEmployeeId || null),
    enabled: isManager && open && (employeeSearchTerm.length === 0 || employeeSearchTerm.length >= 3),
  });
  const ownEmployee = useQuery({ queryKey: ['employee-profile', user?.email], queryFn: () => employeeRepository.getForUser(user!.email!), enabled: !isManager && Boolean(user?.email) });
  const reports = useQuery({
    queryKey: ['attendance-summaries', isManager ? 'all' : ownEmployee.data?.Employee_ID, page, pageSize, sortDirection],
    queryFn: () => attendanceRepository.listPage({
      page, pageSize, sortDirection, employeeId: isManager ? undefined : ownEmployee.data?.Employee_ID,
    }),
    enabled: isManager || ownEmployee.isFetched,
  });
  const [notice, setNotice] = useState<Notice>(null);
  const total = form.watch('Total_Working_Days');
  const present = form.watch('Days_Present');
  const absent = form.watch('Days_Absent');
  const computedTotal = Number(present || 0) + Number(absent || 0);
  const computedDaysValid = (!total || computedTotal <= Number(total))
    && (!total || Number(form.watch('Paid_Leaves') || 0) <= Number(total));
  const selected = people.data?.find((employee) => employee.Employee_ID === selectedEmployeeId);
  const create = useMutation({
    mutationFn: (values: Input) => attendanceRepository.save({
      Employee_ID: values.Employee_ID, Total_Working_Days: Number(values.Total_Working_Days),
      Days_Present: Number(values.Days_Present), Days_Absent: Number(values.Days_Absent), Paid_Leaves: Number(values.Paid_Leaves),
    }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['attendance-summaries'] }),
        cache.invalidateQueries({ queryKey: ['dashboard'] }),
        cache.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        cache.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setOpen(false);
      setNotice({ message: 'Attendance summary saved. The attendance percentage is calculated by PostgreSQL.', severity: 'success' });
    },
    onError: (error: unknown) => setNotice({ message: displayError(error), severity: 'error' }),
  });
  const rows = reports.data?.rows ?? [];
  const employeeIds = [...new Set(rows.map((row) => row.Employee_ID))];
  const pageEmployees = useQuery({
    queryKey: ['employees-by-ids', employeeIds],
    queryFn: () => employeeRepository.byIds(employeeIds),
    enabled: isManager && employeeIds.length > 0,
  });
  const employeeById = useMemo(() => new Map((pageEmployees.data ?? []).map((employee) => [employee.Employee_ID, employee])), [pageEmployees.data]);
  const summary = rows.reduce((acc, row) => ({
    working: acc.working + row.Total_Working_Days,
    present: acc.present + row.Days_Present,
    absent: acc.absent + row.Days_Absent,
    paid: acc.paid + row.Paid_Leaves,
  }), { working: 0, present: 0, absent: 0, paid: 0 });
  const pagedTotal = reports.data?.total ?? 0;

  async function exportReport() {
    const allRows = isManager
      ? await attendanceRepository.list()
      : ownEmployee.data ? await attendanceRepository.forEmployee(ownEmployee.data.Employee_ID) : [];
    const headers = ['Employee ID', 'Employee', 'Record ID', 'Total Working Days', 'Days Present', 'Days Absent', 'Paid Leaves', 'Attendance Percentage'];
    const allEmployees = isManager ? await employeeRepository.list() : [];
    const allEmployeeById = new Map(allEmployees.map((employee) => [employee.Employee_ID, employee]));
    const csv = [headers, ...allRows.map((row) => {
      const person = allEmployeeById.get(row.Employee_ID) ?? (!isManager ? ownEmployee.data ?? undefined : undefined);
      return [row.Employee_ID, person ? `${person.First_Name} ${person.Last_Name}` : '', row.Record_ID, String(row.Total_Working_Days), String(row.Days_Present), String(row.Days_Absent), String(row.Paid_Leaves), `${row.Attendance_Percentage}%`];
    })].map((record) => record.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <Box className="page-enter">
    <PageHeading eyebrow="A LITTLE MORE BALANCE" title={isManager ? 'A clearer view of attendance.' : 'Your time, thoughtfully accounted for.'} description="The supplied schema stores attendance summaries, not daily clock-in/out events or reporting dates." action={<Stack direction="row" gap={1}>{pagedTotal > 0 && <Button startIcon={<DownloadRounded />} variant="outlined" onClick={() => void exportReport()}>Export CSV</Button>}{isManager && <Button startIcon={<AddRounded />} variant="contained" onClick={() => { form.reset({ Employee_ID: '', Total_Working_Days: '', Days_Present: '', Days_Absent: '', Paid_Leaves: '0' }); setEmployeeSearch(''); setOpen(true); }}>Add summary</Button>}</Stack>} />
    <Grid container spacing={2} mb={2.5}>
      <Grid size={{ xs: 6, md: 3 }}><Card><Box p={2}><Typography variant="caption" color="text.secondary">SUMMARY RECORDS</Typography><Typography variant="h5">{pagedTotal}</Typography></Box></Card></Grid>
      <Grid size={{ xs: 6, md: 3 }}><Card><Box p={2}><Typography variant="caption" color="text.secondary">WORKING DAYS · CURRENT PAGE</Typography><Typography variant="h5">{summary.working}</Typography></Box></Card></Grid>
      <Grid size={{ xs: 6, md: 3 }}><Card><Box p={2}><Typography variant="caption" color="text.secondary">PRESENT · CURRENT PAGE</Typography><Typography variant="h5">{summary.present}</Typography></Box></Card></Grid>
      <Grid size={{ xs: 6, md: 3 }}><Card><Box p={2}><Typography variant="caption" color="text.secondary">PAID LEAVES · CURRENT PAGE</Typography><Typography variant="h5">{summary.paid}</Typography></Box></Card></Grid>
    </Grid>
    <Alert severity="info" sx={{ mb: 2.5 }}>Your schema has no dates, leave-request status, or clock-in/out columns. This page reports only the supplied aggregate tracking fields.</Alert>
    <DataPanel title={isManager ? 'Attendance and leave summaries.' : 'Your attendance summary.'} subtitle="Attendance percentage is calculated from days present ÷ total working days.">
      {reports.isPending || (!isManager && ownEmployee.isPending) ? <LoadingState /> : reports.error ? <ErrorState message={displayError(reports.error)} onRetry={() => void reports.refetch()} /> : !pagedTotal ? <EmptyState title="Nothing to summarize just yet." description={isManager ? 'Add a summary for a teammate to get started.' : 'Your summary will show here once HR adds an attendance record.'} action={isManager && <Button variant="contained" onClick={() => setOpen(true)}>Add attendance summary</Button>} /> :
        <TableContainer sx={{ overflowX: 'auto' }}><Table size="small" aria-label="Attendance and leave summaries"><TableHead><TableRow>{[...(isManager ? ['EMPLOYEE'] : []), 'RECORD ID', 'WORKING DAYS', 'PRESENT', 'ABSENT', 'PAID LEAVES', 'ATTENDANCE'].map((heading) => <TableCell key={heading} sx={{ bgcolor: '#fbfbfd', fontSize: 10, fontWeight: 750, whiteSpace: 'nowrap' }}>{heading}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((row) => {
          const person: Employee | undefined = employeeById.get(row.Employee_ID) ?? (!isManager ? ownEmployee.data ?? undefined : undefined);
          return <TableRow hover key={row.Record_ID}>{isManager && <TableCell><Stack direction="row" alignItems="center" gap={1}><EmployeeAvatar employee={{ First_Name: person?.First_Name ?? '?', Last_Name: person?.Last_Name ?? '' }} size={32} /><Box><Typography variant="body2">{person ? `${person.First_Name} ${person.Last_Name}` : row.Employee_ID}</Typography><Typography variant="caption" color="text.secondary">{row.Employee_ID}</Typography></Box></Stack></TableCell>}<TableCell>{row.Record_ID}</TableCell><TableCell>{row.Total_Working_Days}</TableCell><TableCell>{row.Days_Present}</TableCell><TableCell>{row.Days_Absent}</TableCell><TableCell>{row.Paid_Leaves}</TableCell><TableCell><Typography fontWeight={700}>{Number(row.Attendance_Percentage).toFixed(2)}%</Typography></TableCell></TableRow>;
        })}</TableBody></Table></TableContainer>}
      {pagedTotal > 0 && <TablePagination component="div" count={pagedTotal} page={page} onPageChange={(_event, nextPage) => setPage(nextPage)} rowsPerPage={pageSize} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Rows:" />}
    </DataPanel>
    <Dialog open={open} onClose={() => !create.isPending && setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Record an attendance summary.</DialogTitle><DialogContent dividers><Stack component="form" id="attendance-form" spacing={2} pt={1} onSubmit={form.handleSubmit((values) => create.mutate(values))}>
      <Controller control={form.control} name="Employee_ID" render={({ field }) => {
        const options = (people.data ?? []).filter((person) => person.Employment_Status !== 'Terminated');
        return <Autocomplete
          options={options}
          value={options.find((person) => person.Employee_ID === field.value) ?? null}
          inputValue={employeeSearch}
          getOptionLabel={(person) => `${person.First_Name} ${person.Last_Name} · ${person.Employee_ID}`}
          isOptionEqualToValue={(option, value) => option.Employee_ID === value.Employee_ID}
          onInputChange={(_event, value, reason) => { if (reason === 'input' || reason === 'clear') setEmployeeSearch(value); }}
          onChange={(_event, person) => field.onChange(person?.Employee_ID ?? '')}
          loading={people.isPending}
          noOptionsText={people.error ? 'Could not load employees' : 'No matching employees'}
          renderInput={(params) => <TextField {...params} label="Employee" error={Boolean(form.formState.errors.Employee_ID)} helperText={form.formState.errors.Employee_ID?.message ?? (employeeSearch.trim().length > 0 && employeeSearch.trim().length < 3 ? 'Enter at least 3 characters to search.' : undefined)} />}
        />;
      }} />
      <Grid container spacing={1.5}><Grid size={6}><TextField label="Total working days" type="number" fullWidth slotProps={{ htmlInput: { min: 0, max: 366, step: 1 } }} {...form.register('Total_Working_Days')} /></Grid><Grid size={6}><TextField label="Days present" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: 1 } }} {...form.register('Days_Present')} /></Grid><Grid size={6}><TextField label="Days absent" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: 1 } }} {...form.register('Days_Absent')} /></Grid><Grid size={6}><TextField label="Paid leaves" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: 1 } }} {...form.register('Paid_Leaves')} /></Grid></Grid>
      {!computedDaysValid && <Alert severity="error">Days present plus days absent cannot exceed total working days.</Alert>}
      <Alert severity="info">{selected ? `For ${selected.First_Name} ${selected.Last_Name}. ` : ''}Attendance percentage is generated in the database. No reporting period can be recorded with the supplied columns.</Alert>
    </Stack></DialogContent><DialogActions sx={{ p: 2 }}><Button color="inherit" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="attendance-form" variant="contained" disabled={create.isPending || !computedDaysValid}>{create.isPending ? 'Saving…' : 'Save attendance summary'}</Button></DialogActions></Dialog>
    <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={notice?.severity} onClose={() => setNotice(null)}>{notice?.message}</Alert></Snackbar>
  </Box>;
}
