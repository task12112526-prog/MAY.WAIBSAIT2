import { Suspense, useState } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom';
import {
  AccessTimeRounded, ApartmentRounded, BarChartRounded, BadgeRounded,
  ChevronRightRounded, DashboardRounded, ExpandMoreRounded, Groups2Rounded,
  LogoutRounded, MenuRounded, PersonOutlineRounded, PaidRounded,
} from '@mui/icons-material';
import {
  AppBar, Avatar, Box, Button, Chip, Divider, Drawer, IconButton, List,
  ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Toolbar,
  Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../features/auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { LoadingState } from '../components/common';

const sidebarWidth = 258;
const navigation = [
  { label: 'Overview', path: '/', icon: <DashboardRounded />, roles: ['admin', 'hr_manager', 'employee'] },
  { label: 'My profile', path: '/profile', icon: <PersonOutlineRounded />, roles: ['admin', 'hr_manager', 'employee'] },
  { label: 'Attendance summary', path: '/attendance', icon: <AccessTimeRounded />, roles: ['admin', 'hr_manager', 'employee'] },
  { label: 'Compensation', path: '/payroll', icon: <PaidRounded />, roles: ['admin', 'hr_manager', 'employee'] },
  { label: 'People', path: '/employees', icon: <Groups2Rounded />, roles: ['admin', 'hr_manager'] },
  { label: 'Departments', path: '/departments', icon: <ApartmentRounded />, roles: ['admin', 'hr_manager'] },
  { label: 'Job titles', path: '/job-titles', icon: <BadgeRounded />, roles: ['admin', 'hr_manager'] },
  { label: 'Reports', path: '/reports', icon: <BarChartRounded />, roles: ['admin', 'hr_manager'] },
] as const;

function roleLabel(role: string) {
  if (role === 'admin') return 'Administrator';
  if (role === 'hr_manager') return 'People team';
  return 'Teammate';
}

function SidebarContents({ onNavigate }: { onNavigate: () => void }) {
  const { role, user } = useAuth();
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const firstName = user?.user_metadata?.first_name as string | undefined;
  const lastName = user?.user_metadata?.last_name as string | undefined;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || user?.email?.split('@')[0] || 'Your account';

  async function logout() {
    const { error } = await supabase.auth.signOut();
    setAccountAnchor(null);
    if (error) console.error('Could not sign out.', error);
    else navigate('/login', { replace: true });
  }

  return <Stack height="100%" px={2} py={2.5}>
    <Stack direction="row" alignItems="center" gap={1.15} px={1.15} mb={4.3}>
      <Box className="brand-symbol">p</Box>
      <Typography sx={{ fontFamily: '"Manrope",sans-serif', fontWeight: 800, letterSpacing: '-0.06em', fontSize: 21 }}>people<span className="brand-accent">OS</span></Typography>
      <Chip label="HR" size="small" sx={{ height: 21, ml: 0.4, bgcolor: '#f1efff', color: 'primary.main', fontWeight: 750, fontSize: 10 }} />
    </Stack>
    <Typography variant="overline" color="text.secondary" px={1.25} mb={0.85} fontSize={10.5} letterSpacing="0.1em" fontWeight={700}>YOUR WORKSPACE</Typography>
    <List disablePadding sx={{ display: 'grid', gap: 0.55 }}>
      {navigation.filter((item) => role && (item.roles as readonly string[]).includes(role)).map((item) =>
        <ListItemButton key={item.path} component={NavLink} to={item.path} end={item.path === '/'} onClick={onNavigate} sx={{
          minHeight: 46, px: 1.35, borderRadius: 2.5, color: '#7d7d93',
          '& .MuiListItemIcon-root': { color: 'inherit', minWidth: 39 },
          '&.active': { bgcolor: '#f0eeff', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' }, '& .MuiTypography-root': { fontWeight: 700 } },
          '&:hover': { bgcolor: '#f7f6ff' },
        }}><ListItemIcon>{item.icon}</ListItemIcon><ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13.7, fontWeight: 550 }} /></ListItemButton>)}
    </List>
    <Box mt="auto">
      <Box sx={{ borderRadius: 3, p: 1.5, bgcolor: '#f8f7fd', mb: 1.3 }}><Typography variant="caption" color="text.secondary" display="block" mb={0.9}>NEED A HAND?</Typography><Typography variant="body2" fontWeight={650} mb={1}>We’re happy to help.</Typography><Typography variant="caption" color="text.secondary">Ask your People team if you need anything.</Typography></Box>
      <Divider sx={{ mb: 1.4 }} />
      <Button fullWidth onClick={(event) => setAccountAnchor(event.currentTarget)} sx={{ justifyContent: 'flex-start', px: 1, color: 'text.primary' }} endIcon={<ExpandMoreRounded />}>
        <Avatar sx={{ width: 37, height: 37, mr: 1.2, bgcolor: '#eceaff', color: 'primary.dark', fontSize: 13, fontWeight: 750 }}>{`${firstName?.[0] ?? user?.email?.[0] ?? 'Y'}${lastName?.[0] ?? ''}`.toUpperCase()}</Avatar>
        <Box textAlign="left" overflow="hidden" flex={1}><Typography variant="body2" fontWeight={700} noWrap>{fullName}</Typography><Typography variant="caption" color="text.secondary">{role ? roleLabel(role) : ''}</Typography></Box>
      </Button>
      <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)}><MenuItem onClick={() => void logout()}><LogoutRounded fontSize="small" sx={{ mr: 1.3 }} />Sign out</MenuItem></Menu>
    </Box>
  </Stack>;
}

function HeaderActions() {
  const { user } = useAuth();
  const firstName = user?.user_metadata?.first_name as string | undefined;
  return <Avatar sx={{ width: 33, height: 33, bgcolor: '#eceaff', color: 'primary.dark', fontSize: 12, fontWeight: 750 }}>{firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'Y'}</Avatar>;
}

const pageNames: Record<string, string> = { '/': 'Overview', '/profile': 'My profile', '/employees': 'People', '/departments': 'Departments', '/job-titles': 'Job titles', '/attendance': 'Attendance summary', '/payroll': 'Compensation', '/reports': 'Reports' };

export default function AppLayout() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const title = pageNames[location.pathname] ?? 'PeopleOS';
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    {mobile ? <Drawer variant="temporary" open={drawerOpen} onClose={() => setDrawerOpen(false)} ModalProps={{ keepMounted: true }} PaperProps={{ sx: { width: sidebarWidth, border: 0 } }}><SidebarContents onNavigate={() => setDrawerOpen(false)} /></Drawer>
      : <Box component="aside" sx={{ position: 'fixed', inset: '0 auto 0 0', width: sidebarWidth, bgcolor: 'white', borderRight: '1px solid', borderColor: 'divider', zIndex: theme.zIndex.drawer }}><SidebarContents onNavigate={() => {}} /></Box>}
    <Box sx={{ ml: { xs: 0, md: `${sidebarWidth}px` }, minHeight: '100vh' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(255,255,255,.9)', backdropFilter: 'blur(16px)' }}><Toolbar sx={{ minHeight: '65px !important', px: { xs: 2, sm: 3, lg: 4 } }}>
        {mobile && <IconButton edge="start" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" sx={{ mr: 1 }}><MenuRounded /></IconButton>}
        <Stack direction="row" alignItems="center" gap={0.9}><Typography variant="body2" color="text.secondary" display={{ xs: 'none', sm: 'block' }}>Your workspace</Typography><ChevronRightRounded fontSize="small" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }} /><Typography variant="body2" fontWeight={700}>{title}</Typography></Stack>
        <Box flex={1} /><HeaderActions />
      </Toolbar></AppBar>
      <Box component="main" sx={{ p: { xs: 2, sm: 3, lg: 4 }, maxWidth: 1510, mx: 'auto' }}><Suspense fallback={<LoadingState />}><Outlet /></Suspense></Box>
    </Box>
  </Box>;
}
