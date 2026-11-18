import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { ChangePasswordPage, ForgotPasswordPage, LoginPage } from '../features/auth/AuthPages';
import { Suspense } from 'react';
import { LoadingState } from '../components/common';
import AppLayout from './AppLayout';
import type { AppRole } from '../types';

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const EmployeesPage = lazy(() => import('../features/employees/EmployeesPage'));
const DepartmentsPage = lazy(() => import('../features/departments/DepartmentsPage'));
const JobTitlesPage = lazy(() => import('../features/jobs/JobTitlesPage'));
const ProfilePage = lazy(() => import('../features/employees/ProfilePage'));
const AttendancePage = lazy(() => import('../features/attendance/AttendancePage'));
const PayrollPage = lazy(() => import('../features/payroll/PayrollPage'));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage'));

const managers: AppRole[] = ['admin', 'hr_manager'];
const allRoles: AppRole[] = ['admin', 'hr_manager', 'employee'];

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/update-password" element={<ChangePasswordPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<Suspense fallback={<LoadingState />}><AppLayout /></Suspense>}>
        <Route index element={<DashboardPage />} />
        <Route element={<ProtectedRoute allowedRoles={managers} />}>
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/job-titles" element={<JobTitlesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={allRoles} />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/leave" element={<Navigate to="/attendance" replace />} />
          <Route path="/notifications" element={<Navigate to="/" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Route>
  </Routes>;
}
