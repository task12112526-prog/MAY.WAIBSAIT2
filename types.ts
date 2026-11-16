export type AppRole =
  | 'admin'
  | 'mosque_manager'
  | 'accountant'
  | 'property_manager'
  | 'imam'
  | 'committee'
  | 'tenant'
  | 'worshipper';

export type Locale = 'ur' | 'en';

export type ResourceKey =
  | 'staff'
  | 'properties'
  | 'tenants'
  | 'leases'
  | 'rent-dues'
  | 'rent-payments'
  | 'staff-payments'
  | 'staff-benefits'
  | 'utilities'
  | 'maintenance'
  | 'transactions'
  | 'donations'
  | 'prayer-times'
  | 'attendance'
  | 'worshippers'
  | 'programs'
  | 'registrations'
  | 'bookings'
  | 'announcements'
  | 'legal-matters'
  | 'bank-accounts'
  | 'bank-transactions'
  | 'bank-cheques';

export type FieldDefinition = {
  key: string;
  labelKey: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'date' | 'time' | 'datetime-local' | 'select' | 'textarea';
  required?: boolean;
  options?: { value: string; labelKey: string }[];
  relation?: { table: string; idField: string; labelField: string };
  min?: number;
  max?: number;
  managerOnly?: boolean;
  requiredWhen?: { field: string; value: string };
  readOnly?: boolean;
  helperTextKey?: string;
};

export type ResourceDefinition = {
  key: ResourceKey;
  table: string;
  idField: string;
  titleKey: string;
  descriptionKey: string;
  columns: { key: string; labelKey: string; relation?: { table: string; idField: string; labelField: string } }[];
  fields: FieldDefinition[];
  searchFields: string[];
  orderField: string;
  roles: AppRole[];
  readRoles?: AppRole[];
  createRoles?: AppRole[];
  fixedFilters?: { field: string; value: string }[];
};

export type DbRow = Record<string, unknown>;

export type PageResult<T> = {
  rows: T[];
  total: number;
};

export type MosqueSummary = {
  incomeThisMonth: number;
  expensesThisMonth: number;
  outstandingRent: number;
  occupiedProperties: number;
  totalProperties: number;
  worshipperCount: number;
  donationsThisMonth: number;
  prayerAttendanceToday: number;
  todayPrayerTimes: { prayer_name: string; jamaat_time: string }[];
  monthlyTrend: { month: string; income: number; expenses: number }[];
  recentTransactions: {
    id: string;
    entry_type: 'income' | 'expense';
    category: string;
    amount: number;
    entry_date: string;
    description: string | null;
  }[];
  upcomingPrograms: {
    id: string;
    name: string;
    starts_at: string;
    program_type: string;
  }[];
};
