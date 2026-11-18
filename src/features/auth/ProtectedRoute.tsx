import { CircularProgress, Stack, Typography } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { AppRole } from '../../types';
import { useAuth } from './AuthProvider';

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: AppRole[] }) {
  const { session, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Stack minHeight="100vh" alignItems="center" justifyContent="center" spacing={2}>
        <CircularProgress size={30} />
        <Typography variant="body2" color="text.secondary">Getting your workspace ready…</Typography>
      </Stack>
    );
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!role) {
    return (
      <Stack minHeight="100vh" alignItems="center" justifyContent="center" spacing={1} px={3} textAlign="center">
        <Typography variant="h5">Your account isn’t set up yet.</Typography>
        <Typography color="text.secondary">Ask an administrator to assign your PeopleOS role.</Typography>
      </Stack>
    );
  }
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
