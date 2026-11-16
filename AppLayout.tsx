import { useState, type ReactNode } from 'react';
import {
  AccountBalanceRounded, AccountBalanceWalletRounded, ArticleRounded, AssignmentRounded, BadgeRounded,
  AccountTreeRounded, CalendarMonthRounded, CampaignRounded, DashboardRounded, GroupsRounded,
  GavelRounded, HomeWorkRounded, LogoutRounded, MenuRounded, MosqueRounded, PeopleAltRounded,
  PaymentsRounded, PersonAddAltRounded, PlaceRounded, ReceiptLongRounded, RequestQuoteRounded, ScheduleRounded,
  VolunteerActivismRounded, WaterDropRounded, WorkHistoryRounded,
} from '@mui/icons-material';
import {
  Alert, AppBar, Avatar, Box, Button, Divider, Drawer, FormControl, IconButton, List,
  ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography,
  Select, useMediaQuery, useTheme,
} from '@mui/material';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth } from '../features/auth/AuthProvider';
import { disableLocalDemo, enableLocalDemo, isLocalDemoEnabled } from '../services/localDemo';
import type { AppRole } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import { useMosqueScope } from '../features/mosques/MosqueScope';

type NavItem = { path: string; label: string; icon: ReactNode; roles: AppRole[] };
type NavGroup = { title: string; items: NavItem[] };
const allStaff: AppRole[] = ['admin', 'mosque_manager'];
const finance: AppRole[] = ['admin', 'mosque_manager', 'accountant'];
const property: AppRole[] = ['admin', 'mosque_manager', 'property_manager'];
const community: AppRole[] = ['admin', 'mosque_manager', 'imam', 'committee'];
const allRoles: AppRole[] = ['admin', 'mosque_manager', 'accountant', 'property_manager', 'imam', 'committee', 'tenant', 'worshipper'];

const navGroups: NavGroup[] = [
  { title: 'operations', items: [
    { path: '/', label: 'dashboard', icon: <DashboardRounded />, roles: allRoles },
    { path: '/staff', label: 'staff', icon: <BadgeRounded />, roles: allStaff },
    { path: '/staff-interviews', label: 'staffInterviews', icon: <WorkHistoryRounded />, roles: allStaff },
    { path: '/mosques', label: 'mosqueRegistry', icon: <AccountTreeRounded />, roles: allStaff },
    { path: '/committees', label: 'mosqueCommittees', icon: <GroupsRounded />, roles: allStaff },
    { path: '/properties', label: 'properties', icon: <HomeWorkRounded />, roles: property },
    { path: '/tenants', label: 'tenants', icon: <PeopleAltRounded />, roles: property },
    { path: '/leases', label: 'leases', icon: <RequestQuoteRounded />, roles: [...property, 'tenant'] },
    { path: '/rent-dues', label: 'rentDues', icon: <PaymentsRounded />, roles: [...property, 'tenant'] },
    { path: '/rent-payments', label: 'rentPaid', icon: <ReceiptLongRounded />, roles: [...property, 'tenant', 'accountant'] },
    { path: '/staff-benefits', label: 'staffBenefits', icon: <BadgeRounded />, roles: allStaff },
    { path: '/utilities', label: 'utilities', icon: <WaterDropRounded />, roles: [...property, 'tenant'] },
    { path: '/maintenance', label: 'maintenance', icon: <WorkHistoryRounded />, roles: [...property, 'tenant'] },
  ] },
  { title: 'finance', items: [
    { path: '/banking', label: 'banking', icon: <AccountBalanceRounded />, roles: finance },
    { path: '/transactions', label: 'transactions', icon: <AccountBalanceWalletRounded />, roles: finance },
    { path: '/donations', label: 'donations', icon: <VolunteerActivismRounded />, roles: finance },
    { path: '/staff-payments', label: 'staffPayments', icon: <PaymentsRounded />, roles: finance },
  ] },
  { title: 'community', items: [
    { path: '/prayer-times', label: 'prayer-times', icon: <ScheduleRounded />, roles: allRoles },
    { path: '/attendance', label: 'attendance', icon: <GroupsRounded />, roles: community },
    { path: '/worshippers', label: 'worshippers', icon: <PeopleAltRounded />, roles: community },
    { path: '/programs', label: 'programs', icon: <CalendarMonthRounded />, roles: community },
    { path: '/registrations', label: 'registrations', icon: <AssignmentRounded />, roles: [...community, 'worshipper'] },
    { path: '/bookings', label: 'bookings', icon: <PlaceRounded />, roles: allRoles.filter((role) => role !== 'committee') },
    { path: '/announcements', label: 'announcements', icon: <CampaignRounded />, roles: [...allStaff, 'imam', 'committee'] },
    { path: '/tenant-notices', label: 'tenantNotices', icon: <ArticleRounded />, roles: [...property, 'tenant'] },
    { path: '/legal-matters', label: 'legalMatters', icon: <GavelRounded />, roles: ['admin', 'mosque_manager'] },
  ] },
  { title: 'administration', items: [
    { path: '/members', label: 'memberAccounts', icon: <PersonAddAltRounded />, roles: ['admin'] },
  ] },
];

function WorkspaceSidebar({ onNavigate }: { onNavigate: () => void }) {
  const { role } = useAuth();
  const { t } = useI18n();
  const visibleGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => role && item.roles.includes(role)) })).filter((group) => group.items.length);
  return <Box sx={{ width: 276, height: '100%', display: 'flex', flexDirection: 'column', color: '#edf6f1', background: 'linear-gradient(165deg, #123f33 0%, #0e3028 58%, #102b25 100%)' }}>
    <Box px={2.5} py={2.5}>
      <Box display="flex" alignItems="center" gap={1.35}>
        <Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 2.5, color: '#f5d992', bgcolor: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.14)' }}><MosqueRounded /></Box>
        <Box><Typography fontWeight={800} lineHeight={1.2}>{t('brand')}</Typography><Typography variant="caption" sx={{ color: 'rgba(237,246,241,.64)' }}>{t('tagline')}</Typography></Box>
      </Box>
    </Box>
    <Divider sx={{ borderColor: 'rgba(237,246,241,.12)' }} />
    <Box flex={1} overflow="auto" py={1.3}>{visibleGroups.map((group) => <Box key={group.title} mb={1.6}>
      <Typography variant="overline" sx={{ color: 'rgba(237,246,241,.52)' }} px={2.7} fontWeight={750}>{t(group.title)}</Typography>
      <List disablePadding sx={{ px: 1.1, mt: 0.35 }}>{group.items.map((item) => <ListItemButton key={item.path} component={NavLink} to={item.path} onClick={onNavigate} end={item.path === '/'} sx={{ borderRadius: 2.5, my: 0.3, minHeight: 44, color: 'rgba(237,246,241,.78)', transition: 'background-color .16s ease, color .16s ease, transform .16s ease', '&:hover': { bgcolor: 'rgba(255,255,255,.08)', color: '#fff', transform: 'translateX(-2px)' }, '&.active': { bgcolor: 'rgba(245,217,146,.16)', color: '#ffe5a7', boxShadow: 'inset -3px 0 #e3bd68', '& .MuiListItemIcon-root': { color: '#f5d992' } } }}>
        <ListItemIcon sx={{ minWidth: 38, color: 'rgba(237,246,241,.62)' }}>{item.icon}</ListItemIcon><ListItemText primary={t(item.label)} primaryTypographyProps={{ fontSize: 13.5, fontWeight: 620 }} />
      </ListItemButton>)}</List>
    </Box>)}</Box>
    <Divider sx={{ borderColor: 'rgba(237,246,241,.12)' }} />
    <Typography variant="caption" sx={{ color: 'rgba(237,246,241,.62)' }} p={2}>{t(role ?? 'worshipper')}</Typography>
  </Box>;
}

export default function AppLayout({ children }: { children?: ReactNode }) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [signOutError, setSignOutError] = useState('');
  const [localDemo, setLocalDemo] = useState(isLocalDemoEnabled);
  const queryClient = useQueryClient();
  const { user, role, signOut } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { mosqueId, mosques, isLoading: mosquesLoading, error: mosquesError, setMosqueId } = useMosqueScope();
  const location = useLocation();
  const activeItem = navGroups.flatMap((group) => group.items).find((item) => item.path === location.pathname);

  async function handleSignOut() {
    setSignOutError('');
    try { await signOut(); }
    catch { setSignOutError(t('signOutFailed')); }
    setMenuAnchor(null);
  }

  function toggleLocalDemo() {
    if (localDemo) disableLocalDemo();
    else enableLocalDemo();
    setLocalDemo(!localDemo);
    window.dispatchEvent(new Event('masjid-demo-mode-changed'));
    void queryClient.invalidateQueries();
  }

  return <Box minHeight="100vh" display="flex">
    {mobile ? <Drawer variant="temporary" open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { border: 0 } }}><WorkspaceSidebar onNavigate={() => setDrawerOpen(false)} /></Drawer>
      : <Box component="aside" sx={{ width: 276, flexShrink: 0, boxShadow: '8px 0 30px rgba(13, 43, 34, .08)', zIndex: 2 }}><WorkspaceSidebar onNavigate={() => undefined} /></Box>}
    <Box flex={1} minWidth={0}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(255,255,255,.88)', backdropFilter: 'blur(18px)', boxShadow: '0 4px 24px rgba(20, 52, 39, .035)' }}>
        <Toolbar sx={{ minHeight: '68px !important', px: { xs: 1.5, md: 3 } }}>
          {mobile && <IconButton aria-label="Open navigation" onClick={() => setDrawerOpen(true)}><MenuRounded /></IconButton>}
          <Box flex={1}><Typography variant="caption" color="text.secondary">{t('brand')}</Typography><Typography variant="subtitle1" fontWeight={700}>{t(activeItem?.label ?? 'dashboard')}</Typography></Box>
          {mosques.length > 0 && <FormControl size="small" sx={{ minWidth: { xs: 120, sm: 210 }, maxWidth: { xs: 150, sm: 280 }, mr: 1 }}>
            <Select value={mosqueId} onChange={(event) => {
              setMosqueId(event.target.value);
              void queryClient.invalidateQueries();
            }} aria-label={t('selectMosque')}>
              {mosques.map((mosque) => <MenuItem key={mosque.id} value={mosque.id}>{mosque.name}</MenuItem>)}
            </Select>
          </FormControl>}
          <Button size="small" color="inherit" onClick={() => setLocale(locale === 'ur' ? 'en' : 'ur')}>{locale === 'ur' ? 'English' : 'اردو'}</Button>
          <Button size="small" variant={localDemo ? 'contained' : 'outlined'} onClick={toggleLocalDemo} sx={{ whiteSpace: 'nowrap' }}>
            {localDemo ? t('exitLocalDemo') : t('loadLocalDemo')}
          </Button>
          <Button
            size="small"
            color="inherit"
            aria-label={t('signOut')}
            startIcon={<LogoutRounded />}
            onClick={() => void handleSignOut()}
            sx={{ minWidth: 0, px: { xs: 0.75, sm: 1.25 }, whiteSpace: 'nowrap' }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('signOut')}</Box>
          </Button>
          <Tooltip title={user?.email ?? ''}><IconButton sx={{ ml: 0.5 }} onClick={(event) => setMenuAnchor(event.currentTarget)}><Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 14 }}>{(user?.email?.[0] ?? 'م').toUpperCase()}</Avatar></IconButton></Tooltip>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}><MenuItem disabled>{role && t(role)}</MenuItem><MenuItem onClick={() => void handleSignOut()}>{t('signOut')}</MenuItem></Menu>
        </Toolbar>
      </AppBar>
      <Box component="main" className="page-enter" sx={{ p: { xs: 2, sm: 2.5, xl: 3.5 }, maxWidth: 1660, mx: 'auto', minHeight: 'calc(100vh - 68px)' }}>
        {localDemo && <Alert severity="info" sx={{ mb: 2 }}>{t('localDemoNotice')}</Alert>}
        {mosquesError && <Alert severity="error" sx={{ mb: 2 }}>{mosquesError.message}</Alert>}
        {!mosquesLoading && !mosquesError && mosques.length === 0 && <Alert severity="warning" sx={{ mb: 2 }}>{t('registerMosqueFirst')}</Alert>}
        {signOutError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSignOutError('')}>{signOutError}</Alert>}
        {children ?? <Outlet />}
      </Box>
    </Box>
  </Box>;
}
