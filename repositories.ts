import { requireSupabaseConfig, supabase } from '../lib/supabase';
import type { AttendanceSummary, Compensation, Department, Employee, JobTitle } from '../types';

export type EmployeeSortField = 'First_Name' | 'Last_Name' | 'Email' | 'Date_of_Joining' | 'Employment_Status' | 'Work_Location';
export type EmployeePageOptions = {
  page: number;
  pageSize: number;
  search: string;
  departmentId: string;
  status: string;
  sortBy: EmployeeSortField;
  sortDirection: 'asc' | 'desc';
};
export type PageResult<T> = { rows: T[]; total: number };
export type ManagerOption = Pick<Employee, 'Employee_ID' | 'First_Name' | 'Last_Name'>;
export type RecordPageOptions = { page: number; pageSize: number; sortDirection: 'asc' | 'desc'; employeeId?: string };
export type DashboardSummary = {
  employeeCount: number;
  activeCount: number;
  attendanceRecordCount: number;
  attendanceWorkingDays: number;
  attendancePresentDays: number;
  attendancePaidLeaves: number;
  departmentCounts: Record<string, number>;
  titleCounts: Record<string, number>;
  migrationWarning: boolean;
  attendanceSummaryPartial: boolean;
};

async function fetchAllPages<T>(loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function employeeSearchFilter(search: string, includeEmail: boolean): string | null {
  if (search.trim().length > 0 && search.trim().length < 3) return null;
  const values = search.trim().split(/\s+/).filter(Boolean);
  if (!values.length) return null;
  const escape = (value: string) => value.replace(/[\\%_"]/g, (character) => `\\${character}`);
  if (values.length > 1) {
    const firstName = `"%${escape(values[0])}%"`;
    const lastName = `"%${escape(values.slice(1).join(' '))}%"`;
    const fullText = `"%${escape(values.join(' '))}%"`;
    return [
      `and(First_Name.ilike.${firstName},Last_Name.ilike.${lastName})`,
      ...(includeEmail ? [`Email.ilike.${fullText}`] : []),
      `Employee_ID.ilike.${fullText}`,
    ].join(',');
  }
  const pattern = `"%${escape(values[0])}%"`;
  return [
    `First_Name.ilike.${pattern}`,
    `Last_Name.ilike.${pattern}`,
    ...(includeEmail ? [`Email.ilike.${pattern}`] : []),
    `Employee_ID.ilike.${pattern}`,
  ].join(',');
}

export const employeeRepository = {
  async listPage(options: EmployeePageOptions): Promise<PageResult<Employee>> {
    requireSupabaseConfig();
    const { page, pageSize, search, departmentId, status, sortBy, sortDirection } = options;
    let query = supabase.from('Employees').select('*', { count: 'exact' });
    if (departmentId !== 'all') query = query.eq('Dept_ID', departmentId);
    if (status !== 'all') query = query.eq('Employment_Status', status);
    const searchFilter = employeeSearchFilter(search, true);
    if (searchFilter) query = query.or(searchFilter);
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDirection === 'asc' })
      .order('Employee_ID', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .returns<Employee[]>();
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  },
  async countAll(): Promise<{ total: number; active: number }> {
    requireSupabaseConfig();
    const [totalResult, activeResult] = await Promise.all([
      supabase.from('Employees').select('Employee_ID', { count: 'exact', head: true }),
      supabase.from('Employees').select('Employee_ID', { count: 'exact', head: true }).eq('Employment_Status', 'Active'),
    ]);
    if (totalResult.error) throw totalResult.error;
    if (activeResult.error) throw activeResult.error;
    return { total: totalResult.count ?? 0, active: activeResult.count ?? 0 };
  },
  async byIds(ids: string[]): Promise<Employee[]> {
    requireSupabaseConfig();
    if (!ids.length) return [];
    const { data, error } = await supabase.from('Employees').select('*').in('Employee_ID', ids).returns<Employee[]>();
    if (error) throw error;
    return data ?? [];
  },
  async listManagers(search: string, excludedId: string | null, selectedId: string | null): Promise<ManagerOption[]> {
    requireSupabaseConfig();
    let matches = supabase.from('Employees').select('Employee_ID, First_Name, Last_Name');
    if (excludedId) matches = matches.neq('Employee_ID', excludedId);
    const searchFilter = employeeSearchFilter(search, false);
    if (searchFilter) matches = matches.or(searchFilter);
    const optionsQuery = matches.order('First_Name').limit(25).returns<ManagerOption[]>();
    const selectedQuery = selectedId
      ? supabase.from('Employees').select('Employee_ID, First_Name, Last_Name').eq('Employee_ID', selectedId).maybeSingle<ManagerOption>()
      : Promise.resolve({ data: null, error: null });
    const [{ data: options, error }, { data: selected, error: selectedError }] = await Promise.all([optionsQuery, selectedQuery]);
    if (error) throw error;
    if (selectedError) throw selectedError;
    return selected && !options?.some((option) => option.Employee_ID === selected.Employee_ID)
      ? [selected, ...(options ?? [])]
      : options ?? [];
  },
  async searchForSelection(search: string, selectedId: string | null): Promise<Employee[]> {
    requireSupabaseConfig();
    let matches = supabase.from('Employees').select('*');
    const searchFilter = employeeSearchFilter(search, true);
    if (searchFilter) matches = matches.or(searchFilter);
    const optionsQuery = matches.order('First_Name').limit(25).returns<Employee[]>();
    const selectedQuery = selectedId
      ? supabase.from('Employees').select('*').eq('Employee_ID', selectedId).maybeSingle<Employee>()
      : Promise.resolve({ data: null, error: null });
    const [{ data: options, error }, { data: selected, error: selectedError }] = await Promise.all([optionsQuery, selectedQuery]);
    if (error) throw error;
    if (selectedError) throw selectedError;
    return selected && !options?.some((option) => option.Employee_ID === selected.Employee_ID)
      ? [selected, ...(options ?? [])]
      : options ?? [];
  },
  async list(): Promise<Employee[]> {
    requireSupabaseConfig();
    return fetchAllPages((from, to) => supabase.from('Employees').select('*').order('Employee_ID').range(from, to).returns<Employee[]>());
  },
  async getForUser(email: string): Promise<Employee | null> {
    requireSupabaseConfig();
    const { data, error } = await supabase.from('Employees').select('*').eq('Email', email.trim().toLowerCase()).returns<Employee>().maybeSingle();
    if (error) throw error;
    return data;
  },
  async listDepartments(): Promise<Department[]> {
    requireSupabaseConfig();
    return fetchAllPages((from, to) => supabase.from('Departments').select('*').order('Dept_Name').range(from, to).returns<Department[]>());
  },
  async save(id: string | null, values: Partial<Employee>): Promise<void> {
    requireSupabaseConfig();
    const query = id
      ? supabase.from('Employees').update(values).eq('Employee_ID', id)
      : supabase.from('Employees').insert(values);
    const { error } = await query;
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    requireSupabaseConfig();
    const { error } = await supabase.from('Employees').delete().eq('Employee_ID', id);
    if (error) throw error;
  },
  async updateContact(id: string, values: Pick<Employee, 'Phone_Number' | 'Gender'>): Promise<void> {
    requireSupabaseConfig();
    const { data, error } = await supabase.from('Employees').update(values).eq('Employee_ID', id).select('Employee_ID').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This employee profile is unavailable. Ask your HR team to check your account email.');
  },
};

export const departmentRepository = {
  async list(): Promise<Department[]> {
    requireSupabaseConfig();
    return employeeRepository.listDepartments();
  },
  async save(id: string | null, values: Pick<Department, 'Dept_Name' | 'Budget' | 'Location'>): Promise<void> {
    requireSupabaseConfig();
    const query = id
      ? supabase.from('Departments').update(values).eq('Dept_ID', id)
      : supabase.from('Departments').insert(values);
    const { error } = await query;
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    requireSupabaseConfig();
    const { error } = await supabase.from('Departments').delete().eq('Dept_ID', id);
    if (error) throw error;
  },
};

export const jobTitleRepository = {
  async list(): Promise<JobTitle[]> {
    requireSupabaseConfig();
    return fetchAllPages((from, to) => supabase.from('Job_Titles').select('*').order('Job_Title').range(from, to).returns<JobTitle[]>());
  },
  async save(id: string | null, values: Pick<JobTitle, 'Job_Title' | 'Base_Salary_Min' | 'Base_Salary_Max'>): Promise<void> {
    requireSupabaseConfig();
    const query = id
      ? supabase.from('Job_Titles').update(values).eq('Title_ID', id)
      : supabase.from('Job_Titles').insert(values);
    const { error } = await query;
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    requireSupabaseConfig();
    const { error } = await supabase.from('Job_Titles').delete().eq('Title_ID', id);
    if (error) throw error;
  },
};

export const compensationRepository = {
  async listPage({ page, pageSize, sortDirection, employeeId }: RecordPageOptions): Promise<PageResult<Compensation>> {
    requireSupabaseConfig();
    let query = supabase
      .from('Salaries_And_Compensation')
      .select('*', { count: 'exact' });
    if (employeeId) query = query.eq('Employee_ID', employeeId);
    const { data, error, count } = await query
      .order('Record_ID', { ascending: sortDirection === 'asc' })
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .returns<Compensation[]>();
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  },
  async list(): Promise<Compensation[]> {
    requireSupabaseConfig();
    return fetchAllPages((from, to) => supabase.from('Salaries_And_Compensation').select('*').order('Record_ID').range(from, to).returns<Compensation[]>());
  },
  async forEmployee(employeeId: string): Promise<Compensation[]> {
    requireSupabaseConfig();
    return fetchAllPages((from, to) => supabase.from('Salaries_And_Compensation').select('*').eq('Employee_ID', employeeId).order('Record_ID').range(from, to).returns<Compensation[]>());
  },
  async save(values: Pick<Compensation, 'Employee_ID' | 'Base_Salary' | 'Bonus_Percentage' | 'Medical_Allowance' | 'Tax_Deduction'>): Promise<void> {
    requireSupabaseConfig();
    const { error } = await supabase.from('Salaries_And_Compensation').insert(values);
    if (error) throw error;
  },
};

export const attendanceRepository = {
  async listPage({ page, pageSize, sortDirection, employeeId }: RecordPageOptions): Promise<PageResult<AttendanceSummary>> {
    requireSupabaseConfig();
    let query = supabase
      .from('Attendance_And_Leave')
      .select('*', { count: 'exact' });
    if (employeeId) query = query.eq('Employee_ID', employeeId);
    const { data, error, count } = await query
      .order('Record_ID', { ascending: sortDirection === 'asc' })
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .returns<AttendanceSummary[]>();
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  },
  async getDashboardSummary(): Promise<DashboardSummary> {
    requireSupabaseConfig();
    const { data, error } = await supabase.rpc('hrms_dashboard_summary');
    if (error) {
      const missingFunction = typeof error === 'object'
        && error !== null
        && 'code' in error
        && 'message' in error
        && ['PGRST202', '42883'].includes(String(error.code))
        && String(error.message).includes('hrms_dashboard_summary');
      if (!missingFunction) throw error;

      const [employeeCounts, attendancePage] = await Promise.all([
        employeeRepository.countAll(),
        this.listPage({ page: 0, pageSize: 25, sortDirection: 'desc' }),
      ]);
      return {
        employeeCount: employeeCounts.total,
        activeCount: employeeCounts.active,
        attendanceRecordCount: attendancePage.total,
        attendanceWorkingDays: attendancePage.rows.reduce((sum, row) => sum + row.Total_Working_Days, 0),
        attendancePresentDays: attendancePage.rows.reduce((sum, row) => sum + row.Days_Present, 0),
        attendancePaidLeaves: attendancePage.rows.reduce((sum, row) => sum + row.Paid_Leaves, 0),
        departmentCounts: {},
        titleCounts: {},
        migrationWarning: true,
        attendanceSummaryPartial: true,
      };
    }
    if (typeof data !== 'object' || data === null) throw new Error('The dashboard summary response has an invalid shape. Apply the latest Supabase migration.');
    const response = data as Record<string, unknown>;
    const numberField = (key: string) => {
      const value = response[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`The dashboard summary field "${key}" is invalid. Apply the latest Supabase migration.`);
      }
      return value;
    };
    const countMap = (key: string) => {
      const value = response[key];
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`The dashboard summary field "${key}" is invalid. Apply the latest Supabase migration.`);
      }
      return Object.fromEntries(Object.entries(value).map(([id, count]) => {
        if (typeof count !== 'number' || !Number.isFinite(count)) {
          throw new Error(`The dashboard summary field "${key}" contains an invalid count. Apply the latest Supabase migration.`);
        }
        return [id, count];
      }));
    };
    return {
      employeeCount: numberField('employeeCount'),
      activeCount: numberField('activeCount'),
      attendanceRecordCount: numberField('attendanceRecordCount'),
      attendanceWorkingDays: numberField('attendanceWorkingDays'),
      attendancePresentDays: numberField('attendancePresentDays'),
      attendancePaidLeaves: numberField('attendancePaidLeaves'),
      departmentCounts: countMap('departmentCounts'),
      titleCounts: countMap('titleCounts'),
      migrationWarning: false,
      attendanceSummaryPartial: false,
    };
  },
  async list(): Promise<AttendanceSummary[]> {
    requireSupabaseConfig();
    return fetchAllPages((from, to) => supabase.from('Attendance_And_Leave').select('*').order('Record_ID').range(from, to).returns<AttendanceSummary[]>());
  },
  async forEmployee(employeeId: string): Promise<AttendanceSummary[]> {
    requireSupabaseConfig();
    return fetchAllPages((from, to) => supabase.from('Attendance_And_Leave').select('*').eq('Employee_ID', employeeId).order('Record_ID').range(from, to).returns<AttendanceSummary[]>());
  },
  async save(values: Omit<AttendanceSummary, 'Record_ID' | 'Attendance_Percentage'>): Promise<void> {
    requireSupabaseConfig();
    const { error } = await supabase.from('Attendance_And_Leave').insert(values);
    if (error) throw error;
  },
};

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
}
