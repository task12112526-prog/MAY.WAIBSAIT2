import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AddRounded, DeleteOutlineRounded, EditOutlined, SearchRounded } from '@mui/icons-material';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  IconButton, MenuItem, Select, Snackbar, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, TextField, Typography,
} from '@mui/material';
import { DataPanel, ConfirmDialog, EmployeeAvatar, EmptyState, ErrorState, LoadingState, PageHeading, StatusPill } from '../../components/common';
import { displayError, formatDate } from '../../lib/format';
import { departmentRepository, employeeRepository, jobTitleRepository, type EmployeeSortField } from '../../services/repositories';
import { useAuth } from '../auth/AuthProvider';
import type { Employee } from '../../types';

const schema = z.object({
  First_Name: z.string().trim().min(1, 'First name is required.').max(100),
  Last_Name: z.string().trim().min(1, 'Last name is required.').max(100),
  Email: z.email('Enter a valid email address.'),
  Phone_Number: z.string().trim().max(40),
  Gender: z.string().max(60),
  Date_of_Birth: z.union([z.literal(''), z.iso.date()]),
  Date_of_Joining: z.iso.date('Choose a valid start date.'),
  Dept_ID: z.string(),
  Title_ID: z.string(),
  Manager_ID: z.string(),
  Employment_Status: z.enum(['Active', 'Terminated', 'On Leave']),
  Work_Location: z.enum(['Office', 'Remote', 'Hybrid']),
});
type EmployeeInput = z.infer<typeof schema>;
type Notice = { message: string; severity: 'success' | 'error' } | null;

const blankEmployee: EmployeeInput = {
  First_Name: '', Last_Name: '', Email: '', Phone_Number: '', Gender: '', Date_of_Birth: '',
  Date_of_Joining: new Date().toISOString().slice(0, 10), Dept_ID: '', Title_ID: '',
  Manager_ID: '', Employment_Status: 'Active', Work_Location: 'Office',
};

function EmployeeForm({ employee, open, busy, onClose, onSave }: {
  employee: Employee | null; open: boolean; busy: boolean;
  onClose: () => void; onSave: (input: EmployeeInput) => void;
}) {
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentRepository.list });
  const titles = useQuery({ queryKey: ['job-titles'], queryFn: jobTitleRepository.list });
  const [managerSearch, setManagerSearch] = useState('');
  const [managerSearchTerm, setManagerSearchTerm] = useState('');
  const form = useForm<EmployeeInput>({ resolver: zodResolver(schema), defaultValues: blankEmployee });
  useEffect(() => {
    const timer = window.setTimeout(() => setManagerSearchTerm(managerSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [managerSearch]);
  const managers = useQuery({
    queryKey: ['employee-manager-options', managerSearchTerm, employee?.Employee_ID, employee?.Manager_ID],
    queryFn: () => employeeRepository.listManagers(managerSearchTerm, employee?.Employee_ID ?? null, employee?.Manager_ID ?? null),
    enabled: open && (managerSearchTerm.length === 0 || managerSearchTerm.length >= 3),
  });

  useEffect(() => {
    setManagerSearch('');
    form.reset(employee ? {
      First_Name: employee.First_Name, Last_Name: employee.Last_Name, Email: employee.Email,
      Phone_Number: employee.Phone_Number, Gender: employee.Gender,
      Date_of_Birth: employee.Date_of_Birth ?? '', Date_of_Joining: employee.Date_of_Joining,
      Dept_ID: employee.Dept_ID ?? '', Title_ID: employee.Title_ID ?? '',
      Manager_ID: employee.Manager_ID ?? '', Employment_Status: employee.Employment_Status,
      Work_Location: employee.Work_Location,
    } : blankEmployee);
  }, [employee, open]);

  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
    <DialogTitle>{employee ? 'Update your teammate.' : 'Make room for someone new.'}</DialogTitle>
    <DialogContent dividers>
      <Stack component="form" id="employee-form" spacing={2} pt={1} onSubmit={form.handleSubmit(onSave)}>
        <Typography variant="overline" color="primary.main" fontWeight={700}>The person</Typography>
        <Grid container spacing={1.7}>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="First name" fullWidth {...form.register('First_Name')} error={Boolean(form.formState.errors.First_Name)} helperText={form.formState.errors.First_Name?.message} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Last name" fullWidth {...form.register('Last_Name')} error={Boolean(form.formState.errors.Last_Name)} helperText={form.formState.errors.Last_Name?.message} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Work email" type="email" fullWidth {...form.register('Email')} error={Boolean(form.formState.errors.Email)} helperText={form.formState.errors.Email?.message} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Phone number" fullWidth {...form.register('Phone_Number')} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Gender" select fullWidth {...form.register('Gender')}><MenuItem value="">Prefer not to say</MenuItem>{['Female', 'Male', 'Non-binary', 'Other'].map((gender) => <MenuItem key={gender} value={gender}>{gender}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Date of birth" type="date" fullWidth slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: new Date().toISOString().slice(0, 10) } }} {...form.register('Date_of_Birth')} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Date of joining" type="date" fullWidth slotProps={{ inputLabel: { shrink: true } }} {...form.register('Date_of_Joining')} error={Boolean(form.formState.errors.Date_of_Joining)} helperText={form.formState.errors.Date_of_Joining?.message} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Department" select fullWidth {...form.register('Dept_ID')}><MenuItem value="">Not assigned</MenuItem>{departments.data?.map((dept) => <MenuItem value={dept.Dept_ID} key={dept.Dept_ID}>{dept.Dept_Name}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Job title" select fullWidth {...form.register('Title_ID')}><MenuItem value="">Not assigned</MenuItem>{titles.data?.map((title) => <MenuItem value={title.Title_ID} key={title.Title_ID}>{title.Job_Title}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Controller control={form.control} name="Manager_ID" render={({ field }) => {
            const options = managers.data ?? [];
            return <Autocomplete
              options={options}
              value={options.find((option) => option.Employee_ID === field.value) ?? null}
              inputValue={managerSearch}
              getOptionLabel={(option) => `${option.First_Name} ${option.Last_Name} · ${option.Employee_ID}`}
              isOptionEqualToValue={(option, value) => option.Employee_ID === value.Employee_ID}
              onInputChange={(_event, value, reason) => { if (reason === 'input' || reason === 'clear') setManagerSearch(value); }}
              onChange={(_event, option) => field.onChange(option?.Employee_ID ?? '')}
              loading={managers.isPending}
              noOptionsText={managers.error ? 'Could not load managers' : 'No matching employees'}
              renderInput={(params) => <TextField {...params} label="Manager" placeholder="Search employees…" helperText={managerSearch.trim().length > 0 && managerSearch.trim().length < 3 ? 'Enter at least 3 characters to search.' : undefined} />}
            />;
          }} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Employment status" select fullWidth {...form.register('Employment_Status')}><MenuItem value="Active">Active</MenuItem><MenuItem value="On Leave">On Leave</MenuItem><MenuItem value="Terminated">Terminated</MenuItem></TextField></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField label="Work location" select fullWidth {...form.register('Work_Location')}><MenuItem value="Office">Office</MenuItem><MenuItem value="Remote">Remote</MenuItem><MenuItem value="Hybrid">Hybrid</MenuItem></TextField></Grid>
        </Grid>
        {departments.error && <Alert severity="error">{displayError(departments.error)}</Alert>}
        {titles.error && <Alert severity="error">{displayError(titles.error)}</Alert>}
        {managers.error && <Alert severity="error">{displayError(managers.error)}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ p: 2.25 }}><Button onClick={onClose} color="inherit" disabled={busy}>Cancel</Button><Button type="submit" form="employee-form" variant="contained" disabled={busy || departments.isPending || titles.isPending}>{busy ? 'Saving…' : employee ? 'Save changes' : 'Add teammate'}</Button></DialogActions>
  </Dialog>;
}

export default function EmployeesPage() {
  const cache = useQueryClient();
  const { role } = useAuth();
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentRepository.list });
  const titles = useQuery({ queryKey: ['job-titles'], queryFn: jobTitleRepository.list });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<EmployeeSortField>('First_Name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const isAdmin = role === 'admin';
  const employees = useQuery({
    queryKey: ['employees', 'directory', page, pageSize, searchTerm, filter, statusFilter, sortBy, sortDirection],
    queryFn: () => employeeRepository.listPage({
      page, pageSize, search: searchTerm, departmentId: filter, status: statusFilter, sortBy, sortDirection,
    }),
    placeholderData: keepPreviousData,
    enabled: searchTerm.length === 0 || searchTerm.length >= 3,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!employees.data) return;
    const lastPage = Math.max(0, Math.ceil(employees.data.total / pageSize) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [employees.data?.total, page, pageSize]);

  const save = useMutation({
    mutationFn: (input: EmployeeInput) => employeeRepository.save(editing?.Employee_ID ?? null, {
      First_Name: input.First_Name.trim(), Last_Name: input.Last_Name.trim(),
      Email: input.Email.trim().toLowerCase(), Phone_Number: input.Phone_Number.trim(),
      Gender: input.Gender, Date_of_Birth: input.Date_of_Birth || null,
      Date_of_Joining: input.Date_of_Joining, Dept_ID: input.Dept_ID || null,
      Title_ID: input.Title_ID || null, Manager_ID: input.Manager_ID || null,
      Employment_Status: input.Employment_Status,
      Work_Location: input.Work_Location,
    }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['employees'] }),
        cache.invalidateQueries({ queryKey: ['employee-picker'] }),
        cache.invalidateQueries({ queryKey: ['employees-by-ids'] }),
        cache.invalidateQueries({ queryKey: ['dashboard'] }),
        cache.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        cache.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setEditorOpen(false);
      setEditing(null);
      setNotice({ message: editing ? 'Employee profile updated.' : 'Employee added. Their ID was generated automatically.', severity: 'success' });
    },
    onError: (error: unknown) => setNotice({ message: displayError(error), severity: 'error' }),
  });
  const remove = useMutation({
    mutationFn: employeeRepository.remove,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['employees'] }),
        cache.invalidateQueries({ queryKey: ['employee-picker'] }),
        cache.invalidateQueries({ queryKey: ['employees-by-ids'] }),
        cache.invalidateQueries({ queryKey: ['dashboard'] }),
        cache.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        cache.invalidateQueries({ queryKey: ['attendance-summaries'] }),
        cache.invalidateQueries({ queryKey: ['compensation'] }),
        cache.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setDeleting(null);
      setNotice({ message: 'Employee and their linked salary and attendance records were removed.', severity: 'success' });
    },
    onError: (error: unknown) => setNotice({ message: displayError(error), severity: 'error' }),
  });

  const people = employees.data?.rows ?? [];

  function changeSort(field: EmployeeSortField) {
    setPage(0);
    if (sortBy === field) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(field);
      setSortDirection('asc');
    }
  }

  return <Box className="page-enter">
    <PageHeading eyebrow="YOUR PEOPLE" title="Meet your team." description="Each profile uses the employee and lookup IDs in your Supabase schema." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => { setEditing(null); setEditorOpen(true); }}>Add a teammate</Button>} />
    {employees.isPending ? <LoadingState /> : employees.error ? <ErrorState message={displayError(employees.error)} onRetry={() => void employees.refetch()} /> :
      <DataPanel title={`${employees.data?.total ?? 0} ${employees.data?.total === 1 ? 'teammate' : 'teammates'}`} subtitle="Search, filter, and sort on the server. Only the current page of employee records is loaded." action={<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField size="small" placeholder="Find someone…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} helperText={search.trim().length > 0 && search.trim().length < 3 ? 'Enter at least 3 characters to search.' : undefined} slotProps={{ input: { startAdornment: <SearchRounded fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }} sx={{ width: { xs: '100%', sm: 220 } }} /><Select size="small" value={filter} onChange={(event) => { setFilter(String(event.target.value)); setPage(0); }} aria-label="Department filter" sx={{ minWidth: 130 }}><MenuItem value="all">Every team</MenuItem>{departments.data?.map((dept) => <MenuItem key={dept.Dept_ID} value={dept.Dept_ID}>{dept.Dept_Name}</MenuItem>)}</Select><Select size="small" value={statusFilter} onChange={(event) => { setStatusFilter(String(event.target.value)); setPage(0); }} aria-label="Status filter" sx={{ minWidth: 125 }}><MenuItem value="all">All statuses</MenuItem><MenuItem value="Active">Active</MenuItem><MenuItem value="On Leave">On Leave</MenuItem><MenuItem value="Terminated">Terminated</MenuItem></Select></Stack>}>
        {searchTerm.length > 0 && searchTerm.length < 3 ? <Alert severity="info">Enter at least 3 characters to run a directory search.</Alert> : !employees.data?.total ? <EmptyState title="Your people story starts here." description="Add your first teammate or adjust your search." action={<Button variant="outlined" onClick={() => { setEditing(null); setEditorOpen(true); }}>Add a teammate</Button>} /> :
          <TableContainer sx={{ overflowX: 'auto' }}><Table size="small" aria-label="Employee directory"><TableHead><TableRow>{[
            ['TEAMMATE', 'First_Name'], ['DEPARTMENT', null], ['JOB TITLE', null], ['JOINED', 'Date_of_Joining'], ['STATUS', 'Employment_Status'], ['LOCATION', 'Work_Location'], ['', null],
          ].map(([heading, field]) => <TableCell key={heading} sx={{ bgcolor: '#fbfbfd', fontSize: 10.5, fontWeight: 750, whiteSpace: 'nowrap' }}>{field ? <TableSortLabel active={sortBy === field} direction={sortBy === field ? sortDirection : 'asc'} onClick={() => changeSort(field as EmployeeSortField)}>{heading}</TableSortLabel> : heading}</TableCell>)}</TableRow></TableHead><TableBody>{people.map((person) => {
            const dept = departments.data?.find((item) => item.Dept_ID === person.Dept_ID);
            const title = titles.data?.find((item) => item.Title_ID === person.Title_ID);
            const tone = person.Employment_Status === 'Active' ? 'success' : person.Employment_Status === 'On Leave' ? 'warning' : 'default';
            return <TableRow key={person.Employee_ID} hover onClick={() => setProfile(person)} sx={{ cursor: 'pointer' }}>
              <TableCell><Stack direction="row" spacing={1.2} alignItems="center"><EmployeeAvatar employee={person} /><Box><Typography variant="body2" fontWeight={650}>{person.First_Name} {person.Last_Name}</Typography><Typography variant="caption" color="text.secondary">{person.Employee_ID} · {person.Email}</Typography></Box></Stack></TableCell>
              <TableCell>{dept?.Dept_Name ?? '—'}</TableCell><TableCell>{title?.Job_Title ?? '—'}</TableCell>
              <TableCell>{formatDate(person.Date_of_Joining)}</TableCell><TableCell><StatusPill label={person.Employment_Status} tone={tone} /></TableCell><TableCell>{person.Work_Location}</TableCell>
              <TableCell onClick={(event) => event.stopPropagation()}><Stack direction="row">{<IconButton size="small" aria-label={`Edit ${person.First_Name}`} onClick={() => { setEditing(person); setEditorOpen(true); }}><EditOutlined fontSize="small" /></IconButton>}{isAdmin && <IconButton size="small" color="error" aria-label={`Delete ${person.First_Name}`} onClick={() => setDeleting(person)}><DeleteOutlineRounded fontSize="small" /></IconButton>}</Stack></TableCell>
            </TableRow>;
          })}</TableBody></Table></TableContainer>}
        {employees.data?.total ? <TablePagination component="div" count={employees.data.total} page={page} onPageChange={(_event, nextPage) => setPage(nextPage)} rowsPerPage={pageSize} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Rows:" sx={{ position: 'relative', zIndex: 1, bgcolor: 'background.paper' }} /> : null}
        {employees.isFetching && !employees.isPending && <Typography variant="caption" color="text.secondary" px={2}>Updating results…</Typography>}
      </DataPanel>}
    <EmployeeForm employee={editing} open={editorOpen} busy={save.isPending} onClose={() => { setEditorOpen(false); setEditing(null); }} onSave={(input) => save.mutate(input)} />
    <Dialog open={Boolean(profile)} onClose={() => setProfile(null)} maxWidth="xs" fullWidth><DialogTitle>One of the people who make it happen.</DialogTitle><DialogContent>{profile && <Stack alignItems="center" textAlign="center" spacing={1.5} py={2}><EmployeeAvatar employee={profile} size={72} /><Typography variant="h6">{profile.First_Name} {profile.Last_Name}</Typography><Typography color="text.secondary">{titles.data?.find((item) => item.Title_ID === profile.Title_ID)?.Job_Title ?? 'Teammate'}</Typography><Typography variant="body2">{profile.Email}</Typography><Typography variant="body2">{profile.Phone_Number || 'Phone not provided'}</Typography><Typography variant="body2">{departments.data?.find((item) => item.Dept_ID === profile.Dept_ID)?.Dept_Name ?? 'No department'} · {profile.Work_Location}</Typography><Typography variant="caption" color="text.secondary">{profile.Employee_ID} · Joined {formatDate(profile.Date_of_Joining)}</Typography></Stack>}</DialogContent></Dialog>
    <ConfirmDialog open={Boolean(deleting)} title="Remove this teammate?" description={`Remove ${deleting?.First_Name ?? ''} ${deleting?.Last_Name ?? ''}? Their linked compensation and attendance records will also be deleted.`} busy={remove.isPending} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) remove.mutate(deleting.Employee_ID); }} />
    <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={notice?.severity} onClose={() => setNotice(null)}>{notice?.message}</Alert></Snackbar>
  </Box>;
}
