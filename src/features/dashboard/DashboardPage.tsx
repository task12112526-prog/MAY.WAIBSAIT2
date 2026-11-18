import { useQuery } from '@tanstack/react-query';
import { AccessTimeRounded, ApartmentRounded, ArrowForwardRounded, BadgeRounded, Groups2Rounded, PeopleAltRounded } from '@mui/icons-material';
import { Alert, Avatar, Box, Button, Card, CardContent, Grid, LinearProgress, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { DataPanel, EmployeeAvatar, ErrorState, LoadingState, PageHeading, StatusPill } from '../../components/common';
import { displayError } from '../../lib/format';
import { attendanceRepository, departmentRepository, employeeRepository, jobTitleRepository } from '../../services/repositories';
import { useAuth } from '../auth/AuthProvider';
import type { AppRole, AttendanceSummary, Department, Employee, JobTitle } from '../../types';

type DashboardData = {
  employees: Employee[];
  employeeCount: number;
  activeCount: number;
  attendanceRecordCount: number;
  attendanceWorkingDays: number;
  attendancePresentDays: number;
  attendancePaidLeaves: number;
  migrationWarning: boolean;
  attendanceSummaryPartial: boolean;
  departmentCounts: Record<string, number>;
  departments: Department[];
  titles: JobTitle[];
  attendance: AttendanceSummary[];
};

async function loadDashboard(role: AppRole, email: string | undefined): Promise<DashboardData> {
  if (role === 'employee') {
    const employee = email ? await employeeRepository.getForUser(email) : null;
    const [departments, titles] = await Promise.all([departmentRepository.list(), jobTitleRepository.list()]);
    const attendance = employee ? await attendanceRepository.forEmployee(employee.Employee_ID) : [];
    return {
      employees: employee ? [employee] : [],
      employeeCount: employee ? 1 : 0,
      activeCount: employee?.Employment_Status === 'Active' ? 1 : 0,
      attendanceRecordCount: attendance.length,
      attendanceWorkingDays: attendance.reduce((sum, item) => sum + item.Total_Working_Days, 0),
      attendancePresentDays: attendance.reduce((sum, item) => sum + item.Days_Present, 0),
      attendancePaidLeaves: attendance.reduce((sum, item) => sum + item.Paid_Leaves, 0),
      migrationWarning: false,
      attendanceSummaryPartial: false,
      departmentCounts: {},
      departments,
      titles,
      attendance,
    };
  }
  const [summary, departments, titles] = await Promise.all([
    attendanceRepository.getDashboardSummary(), departmentRepository.list(), jobTitleRepository.list(),
  ]);
  return {
    employees: [],
    employeeCount: summary.employeeCount,
    activeCount: summary.activeCount,
    attendanceRecordCount: summary.attendanceRecordCount,
    attendanceWorkingDays: summary.attendanceWorkingDays,
    attendancePresentDays: summary.attendancePresentDays,
    attendancePaidLeaves: summary.attendancePaidLeaves,
    migrationWarning: summary.migrationWarning,
    attendanceSummaryPartial: summary.attendanceSummaryPartial,
    departmentCounts: summary.departmentCounts,
    departments,
    titles,
    attendance: [],
  };
}

function Metric({ label, value, caption, icon, tint }: { label: string; value: string | number; caption: string; icon: React.ReactNode; tint: string }) {
  return <Card sx={{ height: '100%' }}><CardContent sx={{ p: '19px !important' }}><Avatar variant="rounded" sx={{ bgcolor: tint, color: 'primary.dark', width: 42, height: 42 }}>{icon}</Avatar><Typography variant="body2" color="text.secondary" mt={2}>{label}</Typography><Typography variant="h4" mt={0.3}>{value}</Typography><Typography variant="caption" color="text.secondary">{caption}</Typography></CardContent></Card>;
}

export default function DashboardPage() {
  const { role, user } = useAuth();
  const { data, error, isPending, refetch } = useQuery({ queryKey: ['dashboard', role, user?.email], queryFn: () => loadDashboard(role!, user?.email), enabled: Boolean(role) });
  if (isPending) return <><PageHeading title="Your people, at a glance." description="Bringing your workspace together." /><LoadingState /></>;
  if (error || !data) return <><PageHeading title="Your people, at a glance." /><ErrorState message={displayError(error)} onRetry={() => void refetch()} /></>;

  const manager = role !== 'employee';
  const present = data.attendancePresentDays;
  const working = data.attendanceWorkingDays;
  const paidLeaves = data.attendancePaidLeaves;
  const departmentId = data.employees[0]?.Dept_ID;
  const titleId = data.employees[0]?.Title_ID;
  const myDepartment = data.departments.find((item) => item.Dept_ID === departmentId);
  const myTitle = data.titles.find((item) => item.Title_ID === titleId);
  const names = user?.user_metadata?.first_name ? `${user.user_metadata.first_name}` : null;
  const greeting = `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}${names ? `, ${names}` : ''}.`;

  return <Box className="page-enter">
    {data.migrationWarning && <Alert severity="warning" sx={{ mb: 2 }}>Performance improvements are available: run the latest Supabase SQL migration. Attendance totals shown below currently summarize only the latest 25 records.</Alert>}
    <PageHeading eyebrow={new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} title={greeting} description={manager ? 'A thoughtful overview, connected to your five-table Supabase schema.' : 'Your work and your team, all in one place.'} action={manager ? <Button component={Link} to="/employees" startIcon={<PeopleAltRounded />} variant="contained">Meet your team</Button> : undefined} />
    <Grid container spacing={2} mb={2.5}>
      <Grid size={{ xs: 6, md: 3 }}><Metric label={manager ? 'Total employees' : 'Your profile'} value={manager ? data.employeeCount : data.employees[0]?.Employee_ID ?? 'Not linked'} caption={manager ? 'People in your workspace' : 'Linked by your Supabase account email'} icon={<Groups2Rounded />} tint="#eeeaff" /></Grid>
      <Grid size={{ xs: 6, md: 3 }}><Metric label={manager ? 'Active employees' : 'Your status'} value={manager ? data.activeCount : data.employees[0]?.Employment_Status ?? 'Not linked'} caption={manager ? 'Ready for what’s next' : 'Employment status'} icon={<PeopleAltRounded />} tint="#e6f7f0" /></Grid>
      <Grid size={{ xs: 6, md: 3 }}><Metric label={manager ? 'Departments' : 'Your department'} value={manager ? data.departments.length : myDepartment?.Dept_Name ?? 'Unassigned'} caption={manager ? 'Teams doing thoughtful work' : myTitle?.Job_Title ?? 'Job title not assigned'} icon={<ApartmentRounded />} tint="#fff3e1" /></Grid>
      <Grid size={{ xs: 6, md: 3 }}><Metric label={manager ? 'Attendance records' : 'Paid leaves'} value={manager ? data.attendanceRecordCount : paidLeaves} caption={manager ? 'Attendance summary rows' : 'Recorded in your attendance summary'} icon={<AccessTimeRounded />} tint="#fff0ef" /></Grid>
    </Grid>
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, lg: 7 }}><DataPanel title={manager ? 'A quick picture of your people.' : 'Your attendance summary.'} subtitle="Attendance figures come directly from Attendance_And_Leave.">
        <Stack spacing={2.2} p={{ xs: 2, sm: 2.5 }}>
          <Stack direction="row" gap={1.5} alignItems="center"><Avatar variant="rounded" sx={{ bgcolor: '#eeeaff', color: 'primary.main' }}><AccessTimeRounded /></Avatar><Box flex={1}><Typography variant="body2" fontWeight={700}>{present} days present</Typography><Typography variant="caption" color="text.secondary">{data.attendanceSummaryPartial ? 'Across the latest 25 attendance records' : `Across ${working} recorded working days`}</Typography></Box><Typography fontWeight={750}>{working ? `${Math.round(present / working * 100)}%` : '—'}</Typography></Stack>
          <LinearProgress variant="determinate" value={working ? Math.min(present / working * 100, 100) : 0} sx={{ height: 7, borderRadius: 10, bgcolor: '#f0eff9', '& .MuiLinearProgress-bar': { borderRadius: 10, bgcolor: '#15a987' } }} />
          <Stack direction="row" gap={1.5} alignItems="center"><Avatar variant="rounded" sx={{ bgcolor: '#fff3e1', color: 'warning.main' }}><BadgeRounded /></Avatar><Box flex={1}><Typography variant="body2" fontWeight={700}>{paidLeaves} paid leaves recorded</Typography><Typography variant="caption" color="text.secondary">Summary figures only; there are no leave applications in this schema.</Typography></Box><Button component={Link} to="/attendance" size="small" endIcon={<ArrowForwardRounded />}>Details</Button></Stack>
        </Stack>
      </DataPanel></Grid>
      <Grid size={{ xs: 12, lg: 5 }}><DataPanel title={manager ? 'Your departments.' : 'Your teammates.'} subtitle={manager ? 'Department budgets and team sizes.' : 'Your details, exactly as HR recorded them.'}>
        {manager ? <Stack divider={<Box borderTop="1px solid" borderColor="divider" />} px={2.5}>{data.departments.slice(0, 6).map((department) => {
          const count = data.departmentCounts[department.Dept_ID] ?? 0;
          return <Stack key={department.Dept_ID} direction="row" alignItems="center" gap={1.2} py={1.3}><Avatar sx={{ width: 34, height: 34, fontSize: 11, bgcolor: '#eeeaff', color: 'primary.dark', fontWeight: 700 }}>{department.Dept_Name.slice(0, 2).toUpperCase()}</Avatar><Box flex={1}><Typography variant="body2" fontWeight={650}>{department.Dept_Name}</Typography><Typography variant="caption" color="text.secondary">{department.Location || 'No location assigned'}</Typography></Box><StatusPill label={`${count} ${count === 1 ? 'person' : 'people'}`} tone="primary" /></Stack>;
        })}{data.departments.length === 0 && <Typography variant="body2" color="text.secondary" py={2}>Create a department to get started.</Typography>}</Stack> : data.employees.map((person) => <Stack key={person.Employee_ID} direction="row" alignItems="center" gap={1.5} p={2.5}><EmployeeAvatar employee={person} size={44} /><Box><Typography fontWeight={700}>{person.First_Name} {person.Last_Name}</Typography><Typography variant="body2" color="text.secondary">{myTitle?.Job_Title ?? 'Job title not assigned'}</Typography><Typography variant="caption" color="text.secondary">{myDepartment?.Dept_Name ?? 'Department not assigned'}</Typography></Box></Stack>)}
      </DataPanel></Grid>
    </Grid>
  </Box>;
}
