import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { WorkOutlineRounded } from '@mui/icons-material';
import { Alert, Avatar, Box, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect } from 'react';
import { DataPanel, EmployeeAvatar, ErrorState, LoadingState, PageHeading, StatusPill } from '../../components/common';
import { displayError, formatDate } from '../../lib/format';
import { departmentRepository, employeeRepository, jobTitleRepository } from '../../services/repositories';
import { useAuth } from '../auth/AuthProvider';

const schema = z.object({ Phone_Number: z.string().trim().max(40), Gender: z.string().max(60) });
type Input = z.infer<typeof schema>;

export default function ProfilePage() {
  const cache = useQueryClient();
  const { user } = useAuth();
  const profile = useQuery({ queryKey: ['employee-profile', user?.email], queryFn: () => employeeRepository.getForUser(user!.email!), enabled: Boolean(user?.email) });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentRepository.list });
  const titles = useQuery({ queryKey: ['job-titles'], queryFn: jobTitleRepository.list });
  const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { Phone_Number: '', Gender: '' } });
  useEffect(() => {
    form.reset({ Phone_Number: profile.data?.Phone_Number ?? '', Gender: profile.data?.Gender ?? '' });
  }, [profile.data, form.reset]);

  const save = useMutation({
    mutationFn: (values: Input) => {
      if (!profile.data) throw new Error('Your account is not linked to an employee record.');
      return employeeRepository.updateContact(profile.data.Employee_ID, values);
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['employee-profile', user?.email] });
      await cache.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const employee = profile.data;
  const department = departments.data?.find((item) => item.Dept_ID === employee?.Dept_ID);
  const jobTitle = titles.data?.find((item) => item.Title_ID === employee?.Title_ID);
  const tone = employee?.Employment_Status === 'Active' ? 'success' : employee?.Employment_Status === 'On Leave' ? 'warning' : 'default';

  return <Box className="page-enter">
    <PageHeading eyebrow="THE PERSON BEHIND THE WORK" title="Your story, all in one place." description="Your profile is securely matched to your signed-in Supabase email." />
    {profile.isPending ? <LoadingState /> : profile.error ? <ErrorState message={displayError(profile.error)} onRetry={() => void profile.refetch()} /> : !employee ? <Alert severity="info">No employee record matches your signed-in email. Ask HR to create your profile using <strong>{user?.email}</strong>.</Alert> : <Grid container spacing={2.5} alignItems="start">
      <Grid size={{ xs: 12, md: 4 }}><Card><CardContent><Stack alignItems="center" spacing={1.25} py={2}><EmployeeAvatar employee={employee} size={80} /><Typography variant="h6">{employee.First_Name} {employee.Last_Name}</Typography><Typography color="text.secondary">{jobTitle?.Job_Title ?? 'Teammate'}</Typography><StatusPill label={employee.Employment_Status} tone={tone} /><Typography variant="caption">{employee.Employee_ID} · {employee.Work_Location}</Typography></Stack></CardContent></Card></Grid>
      <Grid size={{ xs: 12, md: 8 }}><Stack spacing={2.5}>
        <DataPanel title="The details that keep your team connected." subtitle="Only you and your People team can see your private employee record."><Grid container spacing={2.2} p={{ xs: 2, sm: 2.5 }}>
          <Grid size={{ xs: 12, sm: 6 }}><Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: '#eeeaff', color: 'primary.main', mb: 1 }}><WorkOutlineRounded fontSize="small" /></Avatar><Typography variant="caption" color="text.secondary" display="block">DEPARTMENT</Typography><Typography>{department?.Dept_Name ?? 'Not assigned'}</Typography></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Typography variant="caption" color="text.secondary">WORK EMAIL</Typography><Typography>{employee.Email}</Typography></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Typography variant="caption" color="text.secondary">DATE OF BIRTH</Typography><Typography>{employee.Date_of_Birth ? formatDate(employee.Date_of_Birth) : 'Not provided'}</Typography></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><Typography variant="caption" color="text.secondary">DATE OF JOINING</Typography><Typography>{formatDate(employee.Date_of_Joining)}</Typography></Grid>
        </Grid></DataPanel>
        <DataPanel title="Your contact details." subtitle="Update your phone and gender. HR maintains the other employment information.">
          <Stack component="form" spacing={2} p={{ xs: 2, sm: 2.5 }} onSubmit={form.handleSubmit((values) => save.mutate(values))}>
            {save.error && <Alert severity="error">{displayError(save.error)}</Alert>}
            {save.isSuccess && <Alert severity="success">Your contact details are saved.</Alert>}
            <TextField label="Phone number" fullWidth {...form.register('Phone_Number')} error={Boolean(form.formState.errors.Phone_Number)} helperText={form.formState.errors.Phone_Number?.message} />
            <TextField label="Gender" select fullWidth {...form.register('Gender')}><MenuItem value="">Prefer not to say</MenuItem>{['Female', 'Male', 'Non-binary', 'Other'].map((gender) => <MenuItem key={gender} value={gender}>{gender}</MenuItem>)}</TextField>
            <Box><Button variant="contained" type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save contact details'}</Button></Box>
          </Stack>
        </DataPanel>
      </Stack></Grid>
    </Grid>}
  </Box>;
}
