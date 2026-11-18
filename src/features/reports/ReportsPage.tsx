import { useMemo, useState } from 'react';
import { DownloadRounded, PrintRounded, QueryStatsRounded } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataPanel, EmptyState, ErrorState, LoadingState, PageHeading } from '../../components/common';
import { displayError, formatCurrency } from '../../lib/format';
import { attendanceRepository, compensationRepository, departmentRepository, employeeRepository, jobTitleRepository } from '../../services/repositories';
import type { AttendanceSummary, Compensation, Department, Employee, JobTitle } from '../../types';

type ReportType = 'employees' | 'departments' | 'job-titles' | 'compensation' | 'attendance';
type ReportData = {
  employees: Employee[];
  departments: Department[];
  titles: JobTitle[];
  compensation: Compensation[];
  attendance: AttendanceSummary[];
  total: number;
  departmentCounts: Record<string, number>;
  titleCounts: Record<string, number>;
  migrationWarning: boolean;
};
type ReportRow = Record<string, string>;

async function loadReportData(type: ReportType, page: number, pageSize: number, complete = false): Promise<ReportData> {
  const empty = { employees: [], departments: [], titles: [], compensation: [], attendance: [], total: 0, departmentCounts: {}, titleCounts: {}, migrationWarning: false };
  if (type === 'employees') {
    const [employeeResult, departments, titles] = await Promise.all([
      complete ? employeeRepository.list().then((rows) => ({ rows, total: rows.length })) : employeeRepository.listPage({
        page, pageSize, search: '', departmentId: 'all', status: 'all', sortBy: 'First_Name', sortDirection: 'asc',
      }),
      departmentRepository.list(), jobTitleRepository.list(),
    ]);
    return { ...empty, employees: employeeResult.rows, total: employeeResult.total, departments, titles };
  }
  if (type === 'departments') {
    const [departments, summary] = await Promise.all([departmentRepository.list(), attendanceRepository.getDashboardSummary()]);
    const departmentCounts = summary.departmentCounts;
    return { ...empty, departments, total: departments.length, departmentCounts, migrationWarning: summary.migrationWarning };
  }
  if (type === 'job-titles') {
    const [titles, summary] = await Promise.all([jobTitleRepository.list(), attendanceRepository.getDashboardSummary()]);
    const titleCounts = summary.titleCounts;
    return { ...empty, titles, total: titles.length, titleCounts, migrationWarning: summary.migrationWarning };
  }
  if (type === 'compensation') {
    const result = complete
      ? await compensationRepository.list().then((rows) => ({ rows, total: rows.length }))
      : await compensationRepository.listPage({ page, pageSize, sortDirection: 'desc' });
    const employees = complete
      ? await employeeRepository.list()
      : await employeeRepository.byIds([...new Set(result.rows.map((row) => row.Employee_ID))]);
    return { ...empty, compensation: result.rows, employees, total: result.total };
  }
  const result = complete
    ? await attendanceRepository.list().then((rows) => ({ rows, total: rows.length }))
    : await attendanceRepository.listPage({ page, pageSize, sortDirection: 'desc' });
  const employees = complete
    ? await employeeRepository.list()
    : await employeeRepository.byIds([...new Set(result.rows.map((row) => row.Employee_ID))]);
  return { ...empty, attendance: result.rows, employees, total: result.total };
}

function cell(value: string) {
  const safe = /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
function downloadCsv(name: string, headers: string[], rows: ReportRow[]) {
  const contents = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))].map((row) => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${contents}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
function printReport(title: string, headers: string[], rows: ReportRow[]) {
  const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:13px system-ui,sans-serif;margin:36px;color:#24243a}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:10px;border-bottom:1px solid #eee}th{background:#f7f7fb}</style></head><body><h1>${esc(title)}</h1><p>${rows.length} records · prepared ${new Date().toLocaleDateString()}</p><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${esc(row[header] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200));</script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function buildReport(data: ReportData, type: ReportType): { title: string; headers: string[]; rows: ReportRow[] } {
  const dept = (id: string | null) => data.departments.find((value) => value.Dept_ID === id)?.Dept_Name ?? '';
  const job = (id: string | null) => data.titles.find((value) => value.Title_ID === id)?.Job_Title ?? '';
  const person = (id: string) => {
    const found = data.employees.find((value) => value.Employee_ID === id);
    return found ? `${found.First_Name} ${found.Last_Name}` : id;
  };
  if (type === 'employees') {
    const headers = ['Employee ID', 'First name', 'Last name', 'Email', 'Phone', 'Gender', 'Birth date', 'Joining date', 'Department', 'Job title', 'Manager ID', 'Employment status', 'Work location'];
    return { title: 'Employee report', headers, rows: data.employees.map((e) => ({ 'Employee ID': e.Employee_ID, 'First name': e.First_Name, 'Last name': e.Last_Name, Email: e.Email, Phone: e.Phone_Number, Gender: e.Gender, 'Birth date': e.Date_of_Birth ?? '', 'Joining date': e.Date_of_Joining, Department: dept(e.Dept_ID), 'Job title': job(e.Title_ID), 'Manager ID': e.Manager_ID ?? '', 'Employment status': e.Employment_Status, 'Work location': e.Work_Location })) };
  }
  if (type === 'departments') {
    const headers = ['Department ID', 'Department name', 'Budget', 'Location', 'Employee count'];
    return { title: 'Department report', headers, rows: data.departments.map((d) => ({ 'Department ID': d.Dept_ID, 'Department name': d.Dept_Name, Budget: String(d.Budget), Location: d.Location, 'Employee count': data.departmentCounts[d.Dept_ID] === undefined ? 'Unavailable until the latest Supabase migration is applied' : String(data.departmentCounts[d.Dept_ID]) })) };
  }
  if (type === 'job-titles') {
    const headers = ['Title ID', 'Job title', 'Minimum base salary', 'Maximum base salary', 'Employee count'];
    return { title: 'Job title report', headers, rows: data.titles.map((j) => ({ 'Title ID': j.Title_ID, 'Job title': j.Job_Title, 'Minimum base salary': String(j.Base_Salary_Min), 'Maximum base salary': String(j.Base_Salary_Max), 'Employee count': data.titleCounts[j.Title_ID] === undefined ? 'Unavailable until the latest Supabase migration is applied' : String(data.titleCounts[j.Title_ID]) })) };
  }
  if (type === 'compensation') {
    const headers = ['Employee ID', 'Employee', 'Record ID', 'Base salary', 'Bonus percentage', 'Medical allowance', 'Tax deduction', 'Net salary'];
    return { title: 'Compensation report', headers, rows: data.compensation.map((s) => ({ 'Employee ID': s.Employee_ID, Employee: person(s.Employee_ID), 'Record ID': s.Record_ID, 'Base salary': formatCurrency(s.Base_Salary), 'Bonus percentage': `${s.Bonus_Percentage}%`, 'Medical allowance': formatCurrency(s.Medical_Allowance), 'Tax deduction': formatCurrency(s.Tax_Deduction), 'Net salary': formatCurrency(s.Net_Salary) })) };
  }
  const headers = ['Employee ID', 'Employee', 'Record ID', 'Total working days', 'Days present', 'Days absent', 'Paid leaves', 'Attendance percentage'];
  return { title: 'Attendance and leave summary report', headers, rows: data.attendance.map((a) => ({ 'Employee ID': a.Employee_ID, Employee: person(a.Employee_ID), 'Record ID': a.Record_ID, 'Total working days': String(a.Total_Working_Days), 'Days present': String(a.Days_Present), 'Days absent': String(a.Days_Absent), 'Paid leaves': String(a.Paid_Leaves), 'Attendance percentage': `${a.Attendance_Percentage}%` })) };
}

export default function ReportsPage() {
  const cache = useQueryClient();
  const [type, setType] = useState<ReportType>('employees');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const query = useQuery({
    queryKey: ['reports', type, page, pageSize],
    queryFn: () => loadReportData(type, page, pageSize),
  });

  const report = useMemo(() => query.data ? buildReport(query.data, type) : { title: 'HRMS report', headers: [], rows: [] }, [query.data, type]);

  const cards = [
    ['SELECTED REPORT RECORDS', query.data?.total ?? 0],
    ['ROWS ON THIS PAGE', report.rows.length],
    ['DEPARTMENTS LOADED', query.data?.departments.length ?? 0],
    ['JOB TITLES LOADED', query.data?.titles.length ?? 0],
  ] as const;

  async function exportCompleteReport(format: 'csv' | 'pdf') {
    setExporting(true);
    setExportError('');
    try {
      const allData = await cache.fetchQuery({
        queryKey: ['reports', type, 'complete'],
        queryFn: () => loadReportData(type, 0, 0, true),
        staleTime: 60_000,
      });
      const completeReport = buildReport(allData, type);
      if (format === 'csv') downloadCsv(completeReport.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), completeReport.headers, completeReport.rows);
      else printReport(completeReport.title, completeReport.headers, completeReport.rows);
    } catch (error: unknown) {
      setExportError(displayError(error));
    } finally {
      setExporting(false);
    }
  }

  return <Box className="page-enter">
    <PageHeading eyebrow="A CLEARER PICTURE" title="Good data tells a story." description="Useful reports mapped directly to your five HRMS tables." />
    <Grid container spacing={2} mb={3}>{cards.map(([label, value]) => <Grid size={{ xs: 6, lg: 3 }} key={label}><Card><CardContent><Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography><Typography variant="h4" mt={0.6}>{value}</Typography></CardContent></Card></Grid>)}</Grid>
    <DataPanel title="Reports that respect your time." subtitle="Tables load one page at a time. Full reports are fetched only when you explicitly export or print." action={<Stack direction="row" gap={1}><Button size="small" variant="outlined" startIcon={<DownloadRounded />} disabled={query.isPending || exporting || report.rows.length === 0} onClick={() => void exportCompleteReport('csv')}>{exporting ? 'Preparing…' : 'Full CSV'}</Button><Button size="small" variant="contained" startIcon={<PrintRounded />} disabled={query.isPending || exporting || report.rows.length === 0} onClick={() => void exportCompleteReport('pdf')}>{exporting ? 'Preparing…' : 'Full PDF'}</Button></Stack>}>
      {query.data?.migrationWarning && <Box px={2.5} pt={2}><Alert severity="info">Run the latest Supabase migration to enable indexed search and exact employee counts.</Alert></Box>}
      <Stack p={2.5} pt={1.5}><TextField label="Report" select value={type} onChange={(event) => { setType(event.target.value as ReportType); setPage(0); setExportError(''); }} sx={{ width: { xs: '100%', sm: 260 } }}>{[['employees', 'Employees'], ['departments', 'Departments'], ['job-titles', 'Job titles'], ['compensation', 'Compensation'], ['attendance', 'Attendance and leave summaries']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField></Stack>
      {exportError && <Box px={2.5} pb={2}><ErrorState message={exportError} onRetry={() => void exportCompleteReport('csv')} /></Box>}
      {query.isPending ? <LoadingState /> : query.error ? <Box px={2.5} pb={2}><ErrorState message={displayError(query.error)} onRetry={() => void query.refetch()} /></Box> : report.rows.length ? <><Stack direction="row" gap={1} alignItems="center" px={2.5} pb={1.5}><QueryStatsRounded fontSize="small" color="action" /><Typography variant="body2" color="text.secondary">{query.data?.total ?? report.rows.length} records · page {page + 1}. No dates or leave-approval history exist in the supplied database schema.</Typography></Stack><TableContainer sx={{ maxHeight: 470, overflowX: 'auto' }}><Table stickyHeader size="small" aria-label={report.title}><TableHead><TableRow>{report.headers.map((heading) => <TableCell key={heading} sx={{ bgcolor: '#fbfbfd', fontWeight: 700, whiteSpace: 'nowrap' }}>{heading}</TableCell>)}</TableRow></TableHead><TableBody>{report.rows.map((row, index) => <TableRow key={index} hover>{report.headers.map((heading) => <TableCell key={heading} sx={{ whiteSpace: 'nowrap' }}>{row[heading] || '—'}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>{(type === 'employees' || type === 'compensation' || type === 'attendance') && <TablePagination component="div" count={query.data?.total ?? 0} page={page} onPageChange={(_event, nextPage) => setPage(nextPage)} rowsPerPage={pageSize} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Rows:" />}</> : <EmptyState title="A blank canvas, ready for insight." description="There aren’t any records for this report yet." />}
    </DataPanel>
  </Box>;
}
