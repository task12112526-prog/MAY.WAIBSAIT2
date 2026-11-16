import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './app/AppLayout';
import SetupRequired from './components/SetupRequired';
import { useI18n } from './i18n';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import { MosqueScopeProvider } from './features/mosques/MosqueScope';
import { resources } from './features/resources/definitions';
import { isSupabaseConfigured } from './lib/supabase';

const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const ResourcePage = lazy(() => import('./features/resources/ResourcePage'));
const MemberAccountsPage = lazy(() => import('./features/members/MemberAccountsPage'));
const LegalPage = lazy(() => import('./features/legal/LegalPage'));
const BankingPage = lazy(() => import('./features/banking/BankingPage'));
const MosqueRegistryPage = lazy(() => import('./features/mosques/MosqueRegistryPage'));
const MosqueCommitteesPage = lazy(() => import('./features/committees/MosqueCommitteesPage'));
const StaffInterviewsPage = lazy(() => import('./features/staff/StaffInterviewsPage'));

function LoadingScreen() {
  return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center' }}><CircularProgress /></Box>;
}

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { locale } = useI18n();
  const { session, loading } = useAuth();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ur' ? 'rtl' : 'ltr';
  }, [locale]);

  if (!isSupabaseConfigured) return <SetupRequired />;
  if (loading) return <LoadingScreen />;
  return <Suspense fallback={<LoadingScreen />}><Routes>
    <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
    <Route element={<Protected><AppLayout /></Protected>}>
      <Route index element={<DashboardPage />} />
      <Route path="staff" element={<ResourcePage definition={resources.staff} />} />
      <Route path="staff-interviews" element={<StaffInterviewsPage />} />
      <Route path="properties" element={<ResourcePage definition={resources.properties} />} />
      <Route path="tenants" element={<ResourcePage definition={resources.tenants} />} />
      <Route path="leases" element={<ResourcePage definition={resources.leases} />} />
      <Route path="rent-dues" element={<ResourcePage definition={resources['rent-dues']} />} />
      <Route path="rent-payments" element={<ResourcePage definition={resources['rent-payments']} />} />
      <Route path="staff-payments" element={<ResourcePage definition={resources['staff-payments']} />} />
      <Route path="staff-benefits" element={<ResourcePage definition={resources['staff-benefits']} />} />
      <Route path="utilities" element={<ResourcePage definition={resources.utilities} />} />
      <Route path="maintenance" element={<ResourcePage definition={resources.maintenance} />} />
      <Route path="transactions" element={<ResourcePage definition={resources.transactions} />} />
      <Route path="donations" element={<ResourcePage definition={resources.donations} />} />
      <Route path="prayer-times" element={<ResourcePage definition={resources['prayer-times']} />} />
      <Route path="attendance" element={<ResourcePage definition={resources.attendance} />} />
      <Route path="worshippers" element={<ResourcePage definition={resources.worshippers} />} />
      <Route path="programs" element={<ResourcePage definition={resources.programs} />} />
      <Route path="registrations" element={<ResourcePage definition={resources.registrations} />} />
      <Route path="bookings" element={<ResourcePage definition={resources.bookings} />} />
      <Route path="announcements" element={<ResourcePage definition={resources.announcements} />} />
      <Route path="tenant-notices" element={<ResourcePage definition={resources.tenantNotices} />} />
      <Route path="members" element={<MemberAccountsPage />} />
      <Route path="legal-matters" element={<LegalPage />} />
      <Route path="banking" element={<BankingPage />} />
      <Route path="mosques" element={<MosqueRegistryPage />} />
      <Route path="committees" element={<MosqueCommitteesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
    <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
  </Routes></Suspense>;
}

export default function App() {
  return <AuthProvider><MosqueScopeProvider><AppRoutes /></MosqueScopeProvider></AuthProvider>;
}
