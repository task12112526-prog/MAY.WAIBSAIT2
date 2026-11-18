import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AddRounded, ApartmentRounded, DeleteOutlineRounded, EditOutlined, Groups2Rounded } from '@mui/icons-material';
import {
  Alert, Avatar, Box, Button, Card, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, Snackbar, Stack, TextField, Typography,
} from '@mui/material';
import { DataPanel, ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeading } from '../../components/common';
import { displayError } from '../../lib/format';
import { attendanceRepository, departmentRepository } from '../../services/repositories';
import { useAuth } from '../auth/AuthProvider';
import type { Department } from '../../types';

const schema = z.object({
  Dept_Name: z.string().trim().min(2, 'Use at least 2 characters.').max(100),
  Budget: z.string().refine((value) => value === '' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))), 'Enter a whole-number budget.'),
  Location: z.string().trim().max(200),
});
type Input = z.infer<typeof schema>;
type Notice = { message: string; severity: 'success' | 'error' } | null;

export default function DepartmentsPage() {
  const cache = useQueryClient();
  const { role } = useAuth();
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentRepository.list });
  const employeeCounts = useQuery({
    queryKey: ['dashboard-summary', 'department-counts'],
    queryFn: () => attendanceRepository.getDashboardSummary(),
    enabled: departments.isSuccess,
  });
  const [editing, setEditing] = useState<Department | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { Dept_Name: '', Budget: '0', Location: '' } });
  const save = useMutation({
    mutationFn: (values: Input) => departmentRepository.save(editing?.Dept_ID ?? null, { Dept_Name: values.Dept_Name.trim(), Budget: values.Budget ? Number(values.Budget) : 0, Location: values.Location.trim() }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['departments'] }),
        cache.invalidateQueries({ queryKey: ['dashboard'] }),
        cache.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        cache.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setOpen(false);
      setNotice({ message: 'Department saved.', severity: 'success' });
    },
    onError: (error: unknown) => setNotice({ message: displayError(error), severity: 'error' }),
  });
  const remove = useMutation({
    mutationFn: departmentRepository.remove,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['departments'] }),
        cache.invalidateQueries({ queryKey: ['employees'] }),
        cache.invalidateQueries({ queryKey: ['dashboard'] }),
        cache.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setDeleting(null);
      setNotice({ message: 'Department removed. Assigned employees remain in the directory.', severity: 'success' });
    },
    onError: (error: unknown) => setNotice({ message: displayError(error), severity: 'error' }),
  });

  function startCreate() {
    setEditing(null);
    form.reset({ Dept_Name: '', Budget: '0', Location: '' });
    setOpen(true);
  }
  function startEdit(department: Department) {
    setEditing(department);
    form.reset({ Dept_Name: department.Dept_Name, Budget: String(department.Budget), Location: department.Location });
    setOpen(true);
  }

  return <Box className="page-enter">
    <PageHeading eyebrow="HOW WE WORK" title="Good teams, better together." description="Departments exactly as they appear in your Supabase workspace." action={<Button variant="contained" startIcon={<AddRounded />} onClick={startCreate}>Add department</Button>} />
    {departments.isPending ? <LoadingState /> : departments.error ? <ErrorState message={displayError(departments.error)} onRetry={() => void departments.refetch()} /> : !departments.data.length ? <DataPanel><EmptyState title="Start with the way you work." description="Create a department and invite your team to join it." action={<Button variant="contained" onClick={startCreate}>Create department</Button>} /></DataPanel> :
      <Grid container spacing={2.2}>{departments.data.map((department, index) => {
        const people = employeeCounts.data?.departmentCounts[department.Dept_ID];
        return <Grid key={department.Dept_ID} size={{ xs: 12, sm: 6, xl: 4 }}><Card sx={{ height: '100%' }}><Stack spacing={2} p={{ xs: 2.25, sm: 2.75 }}>
          <Stack direction="row" justifyContent="space-between"><Avatar variant="rounded" sx={{ bgcolor: ['#eeeaff', '#e6f7f0', '#fff3e1', '#fff0ef'][index % 4], color: 'primary.dark' }}><ApartmentRounded /></Avatar>{role !== 'employee' && <Stack direction="row"><IconButton aria-label={`Edit ${department.Dept_Name}`} size="small" onClick={() => startEdit(department)}><EditOutlined fontSize="small" /></IconButton>{role === 'admin' && <IconButton aria-label={`Delete ${department.Dept_Name}`} size="small" color="error" onClick={() => setDeleting(department)}><DeleteOutlineRounded fontSize="small" /></IconButton>}</Stack>}</Stack>
          <Box><Typography variant="h6">{department.Dept_Name}</Typography><Typography variant="body2" color="text.secondary" mt={0.6}>{department.Location || 'Location not specified'}</Typography><Typography variant="caption" color="text.secondary">{department.Dept_ID}</Typography></Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" pt={1.5} borderTop="1px solid" borderColor="divider"><Stack direction="row" gap={0.8} alignItems="center"><Groups2Rounded fontSize="small" color="action" /><Typography variant="body2">{people ?? '—'} {people === undefined ? 'people' : people === 1 ? 'person' : 'people'}</Typography></Stack><Typography variant="caption" color="text.secondary">Budget {new Intl.NumberFormat('en-US', { style: 'currency', currency: import.meta.env.VITE_CURRENCY || 'USD', maximumFractionDigits: 0 }).format(department.Budget)}</Typography></Stack>
        </Stack></Card></Grid>;
      })}</Grid>}
    {employeeCounts.error && <Alert severity="error" sx={{ mt: 2 }}>Could not load department membership: {displayError(employeeCounts.error)}</Alert>}
    {employeeCounts.data?.migrationWarning && <Alert severity="info" sx={{ mt: 2 }}>Run the latest Supabase migration to enable department employee totals.</Alert>}
    <Dialog open={open} onClose={() => !save.isPending && setOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? 'Shape this department.' : 'Make room for a new team.'}</DialogTitle>
      <DialogContent dividers><Stack component="form" id="department-form" spacing={2} pt={1} onSubmit={form.handleSubmit((values) => save.mutate(values))}>
        <TextField label="Department name" fullWidth {...form.register('Dept_Name')} error={Boolean(form.formState.errors.Dept_Name)} helperText={form.formState.errors.Dept_Name?.message} />
        <TextField label="Budget (whole number)" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: 1 } }} {...form.register('Budget')} error={Boolean(form.formState.errors.Budget)} helperText={form.formState.errors.Budget?.message} />
        <TextField label="Location" fullWidth {...form.register('Location')} />
      </Stack></DialogContent>
      <DialogActions sx={{ p: 2 }}><Button onClick={() => setOpen(false)} color="inherit">Cancel</Button><Button variant="contained" type="submit" form="department-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save department'}</Button></DialogActions>
    </Dialog>
    <ConfirmDialog open={Boolean(deleting)} title="Remove this department?" description={`Remove ${deleting?.Dept_Name ?? 'this department'}? Employee records are kept and their department assignment is cleared.`} busy={remove.isPending} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) remove.mutate(deleting.Dept_ID); }} />
    <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={notice?.severity} onClose={() => setNotice(null)}>{notice?.message}</Alert></Snackbar>
  </Box>;
}
