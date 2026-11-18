import type { ReactNode } from 'react';
import {
  Alert, Avatar, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, Stack, Typography,
} from '@mui/material';
import { CloseRounded } from '@mui/icons-material';
import type { Employee } from '../types';
import { initials } from '../lib/format';

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={2} mb={3.5}>
      <Box>
        {eyebrow && <Typography variant="overline" color="primary.main" fontWeight={700} letterSpacing="0.11em">{eyebrow}</Typography>}
        <Typography variant="h4">{title}</Typography>
        {description && <Typography color="text.secondary" mt={0.75}>{description}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

export function StatusPill({ label, tone }: { label: string; tone?: 'success' | 'warning' | 'error' | 'primary' | 'default' }) {
  const colors = {
    success: { bg: '#e9f8f3', fg: '#14836c' },
    warning: { bg: '#fff5e5', fg: '#a66a16' },
    error: { bg: '#fff0ef', fg: '#c95353' },
    primary: { bg: '#f0eeff', fg: '#6254d8' },
    default: { bg: '#f1f1f6', fg: '#72738a' },
  };
  const color = colors[tone ?? 'default'];
  return <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', px: 1.15, py: 0.45, borderRadius: 99, bgcolor: color.bg, color: color.fg, fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap' }}>{label}</Box>;
}

export function EmployeeAvatar({ employee, size = 38 }: { employee: Pick<Employee, 'First_Name' | 'Last_Name'>; size?: number }) {
  return <Avatar sx={{ width: size, height: size, bgcolor: '#eceaff', color: 'primary.dark', fontSize: size * 0.34, fontWeight: 700, flexShrink: 0 }}>{initials(employee.First_Name, employee.Last_Name)}</Avatar>;
}

export function LoadingState({ label = 'Loading your data…' }: { label?: string }) {
  return <Stack alignItems="center" justifyContent="center" spacing={1.5} py={8}><CircularProgress size={28} /><Typography variant="body2" color="text.secondary">{label}</Typography></Stack>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Alert severity="error" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Try again</Button> : undefined}>{message}</Alert>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Stack alignItems="center" textAlign="center" spacing={1} py={6} px={2}><Box sx={{ width: 48, height: 48, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: '#f1efff', color: 'primary.main' }}><CloseRounded /></Box><Typography fontWeight={700}>{title}</Typography><Typography variant="body2" color="text.secondary" maxWidth={360}>{description}</Typography>{action && <Box pt={1}>{action}</Box>}</Stack>;
}

export function ConfirmDialog({ open, title, description, busy, onClose, onConfirm }: {
  open: boolean; title: string; description: string; busy?: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><DialogContentText>{description}</DialogContentText></DialogContent>
      <DialogActions sx={{ p: 2.5, pt: 1 }}><Button color="inherit" onClick={onClose} disabled={busy}>Cancel</Button><Button color="error" variant="contained" onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : 'Delete'}</Button></DialogActions>
    </Dialog>
  );
}

export function DataPanel({ children, title, subtitle, action }: { children: ReactNode; title?: string; subtitle?: string; action?: ReactNode }) {
  return (
    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
      {(title || action) && <Stack direction="row" justifyContent="space-between" alignItems="center" px={{ xs: 2, sm: 2.5 }} pt={2.25} pb={subtitle ? 0.5 : 1.5} gap={2}><Box>{title && <Typography fontWeight={700}>{title}</Typography>}{subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}</Box>{action}</Stack>}
      {children}
    </Box>
  );
}
