export type AppRole = 'admin' | 'hr_manager' | 'employee';
export type EmploymentStatus = 'Active' | 'Terminated' | 'On Leave';
export type WorkLocation = 'Office' | 'Remote' | 'Hybrid';

export type Department = {
  Dept_ID: string;
  Dept_Name: string;
  Budget: number;
  Location: string;
};

export type JobTitle = {
  Title_ID: string;
  Job_Title: string;
  Base_Salary_Min: number;
  Base_Salary_Max: number;
};

export type Employee = {
  Employee_ID: string;
  First_Name: string;
  Last_Name: string;
  Email: string;
  Phone_Number: string;
  Gender: string;
  Date_of_Birth: string | null;
  Date_of_Joining: string;
  Dept_ID: string | null;
  Title_ID: string | null;
  Manager_ID: string | null;
  Employment_Status: EmploymentStatus;
  Work_Location: WorkLocation;
};

export type Compensation = {
  Record_ID: string;
  Employee_ID: string;
  Base_Salary: number;
  Bonus_Percentage: number;
  Medical_Allowance: number;
  Tax_Deduction: number;
  Net_Salary: number;
};

export type AttendanceSummary = {
  Record_ID: string;
  Employee_ID: string;
  Total_Working_Days: number;
  Days_Present: number;
  Days_Absent: number;
  Paid_Leaves: number;
  Attendance_Percentage: number;
};
