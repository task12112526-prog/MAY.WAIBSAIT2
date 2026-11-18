import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AddRounded, BadgeRounded, DeleteOutlineRounded, EditOutlined } from '@mui/icons-material';
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Snackbar, Stack, TextField, Typography,
} from '@mui/material';
import { DataPanel, ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeading } from '../../components/common';
import { displayError, formatCurrency } from '../../lib/format';
import { attendanceRepository, jobTitleRepository } from '../../services/repositories';
import { useAuth } from '../auth/AuthProvider';
import type { JobTitle } from '../../types';

const schema = z.object({
  Job_Title: z.string().trim().min(2, 'Enter a job title.').max(120),
  Base_Salary_Min: z.string().refine((value) => value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0, 'Enter a whole-number minimum.'),
  Base_Salary_Max: z.string().refine((value) => value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0, 'Enter a whole-number maximum.'),
}).refine((value) => Number(value.Base_Salary_Max) >= Number(value.Base_Salary_Min), { path: ['Base_Salary_Max'], message: 'The maximum must be at least the minimum.' });
type Input = z.infer<typeof schema>;
type Notice = { message: string; severity: 'success' | 'error' } | null;

export default function JobTitlesPage() {
  const cache = useQueryClient();
  const { role } = useAuth();
  const titles = useQuery({ queryKey: ['job-titles'], queryFn: jobTitleRepository.list });
  const employeeCounts = useQuery({
    queryKey: ['dashboard-summary', 'job-title-counts'],
    queryFn: () => attendanceRepository.getDashboardSummary(),
    enabled: titles.isSuccess,
  });
  const [editing, setEditing] = useState<JobTitle | null>(null);
  const [deleting, setDeleting] = useState<JobTitle | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { Job_Title: '', Base_Salary_Min: '0', Base_Salary_Max: '0' } });
  const save = useMutation({
    mutationFn: (values: Input) => jobTitleRepository.save(editing?.Title_ID ?? null, { Job_Title: values.Job_Title.trim(), Base_Salary_Min: Number(values.Base_Salary_Min), Base_Salary_Max: Number(values.Base_Salary_Max) }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['job-titles'] }),
        cache.invalidateQueries({ queryKey: ['dashboard'] }),
        cache.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        cache.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setOpen(false);
      setNotice({ message: 'Job title saved.', severity: 'success' });
    },
    onError: (error: unknown) => setNotice({ message: displayError(error), severity: 'error' }),
  });
  const remove = useMutation({
    mutationFn: jobTitleRepository.remove,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['job-titles'] }),
        cache.invalidateQueries({ queryKey: ['employees'] }),
        cache.invalidateQueries({ queryKey: ['dashboard'] }),
        cache.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setDeleting(null);
      setNotice({ message: 'Job title removed. Assigned employees remain in your directory.', severity: 'success' });
    },
    onError: (error: unknown) => setNotice({ message: displayError(error), severity: 'error' }),
  });
  function startCreate() {
    setEditing(null);
    form.reset({ Job_Title: '', Base_Salary_Min: '0', Base_Salary_Max: '0' });
    setOpen(true);
  }
  function startEdit(item: JobTitle) {
    setEditing(item);
    form.reset({ Job_Title: item.Job_Title, Base_Salary_Min: String(item.Base_Salary_Min), Base_Salary_Max: String(item.Base_Salary_Max) });
    setOpen(true);
  }

  return <Box className="page-enter">
    <PageHeading eyebrow="CAREERS AND CRAFT" title="Every kind of good work." description="Job titles and salary ranges power your employee profiles." action={<Button variant="contained" startIcon={<AddRounded />} onClick={startCreate}>Add job title</Button>} />
    {titles.isPending ? <LoadingState /> : titles.error ? <ErrorState message={displayError(titles.error)} onRetry={() => void titles.refetch()} /> : !titles.data.length ? <DataPanel><EmptyState title="Define the work you do." description="Add job titles to use them in your employee directory." action={<Button variant="contained" onClick={startCreate}>Add a job title</Button>} /></DataPanel> : <Grid container spacing={2}>{titles.data.map((item) => { const people = employeeCounts.data?.titleCounts[item.Title_ID]; return <Grid key={item.Title_ID} size={{ xs: 12, sm: 6, xl: 4 }}><Card><Stack spacing={1.7} p={2.5}><Stack direction="row" justifyContent="space-between"><BadgeRounded color="primary" /><Stack direction="row"><IconButton size="small" aria-label={`Edit ${item.Job_Title}`} onClick={() => startEdit(item)}><EditOutlined fontSize="small" /></IconButton>{role === 'admin' && <IconButton size="small" color="error" aria-label={`Delete ${item.Job_Title}`} onClick={() => setDeleting(item)}><DeleteOutlineRounded fontSize="small" /></IconButton>}</Stack></Stack><Box><Typography variant="h6">{item.Job_Title}</Typography><Typography variant="caption" color="text.secondary">{item.Title_ID} · {people ?? '—'} {people === undefined ? 'people' : people === 1 ? 'person' : 'people'}</Typography></Box><Box pt={1.5} borderTop="1px solid" borderColor="divider"><Typography variant="caption" color="text.secondary">BASE SALARY GUIDELINE</Typography><Typography fontWeight={700}>{formatCurrency(item.Base_Salary_Min)} — {formatCurrency(item.Base_Salary_Max)}</Typography></Box></Stack></Card></Grid>; })}</Grid>}
    {employeeCounts.error && <Alert severity="error" sx={{ mt: 2 }}>Could not load job-title assignments: {displayError(employeeCounts.error)}</Alert>}
    {employeeCounts.data?.migrationWarning && <Alert severity="info" sx={{ mt: 2 }}>Run the latest Supabase migration to enable job-title employee totals.</Alert>}
    <Dialog open={open} onClose={() => !save.isPending && setOpen(false)} maxWidth="xs" fullWidth><DialogTitle>{editing ? 'Update this role.' : 'Describe a role.'}</DialogTitle><DialogContent dividers><Stack component="form" id="job-title-form" spacing={2} pt={1} onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <TextField label="Job title" fullWidth {...form.register('Job_Title')} error={Boolean(form.formState.errors.Job_Title)} helperText={form.formState.errors.Job_Title?.message} />
      <TextField label="Base salary minimum (whole number)" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: 1 } }} {...form.register('Base_Salary_Min')} error={Boolean(form.formState.errors.Base_Salary_Min)} helperText={form.formState.errors.Base_Salary_Min?.message} />
      <TextField label="Base salary maximum (whole number)" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: 1 } }} {...form.register('Base_Salary_Max')} error={Boolean(form.formState.errors.Base_Salary_Max)} helperText={form.formState.errors.Base_Salary_Max?.message} />
    </Stack></DialogContent><DialogActions sx={{ p: 2 }}><Button color="inherit" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="job-title-form" variant="contained" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save job title'}</Button></DialogActions></Dialog>
    <ConfirmDialog open={Boolean(deleting)} title="Remove this job title?" description={`Remove ${deleting?.Job_Title ?? 'this title'}? Assigned employees stay in the system; their title assignment is cleared.`} busy={remove.isPending} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) remove.mutate(deleting.Title_ID); }} />
    <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={notice?.severity} onClose={() => setNotice(null)}>{notice?.message}</Alert></Snackbar>
  </Box>;
}
