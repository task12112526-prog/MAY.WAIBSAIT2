import { useQuery } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import {
  FavoriteRounded, GroupsRounded, HomeWorkRounded,
  MosqueRounded, PaymentsRounded, TrendingDownRounded, TrendingUpRounded,
} from '@mui/icons-material';
import {
  Alert, Box, Grid, Paper, Skeleton, Stack, Typography,
} from '@mui/material';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { resourceRepository } from '../../services/repository';
import type { MosqueSummary } from '../../types';
import PageHeading, { SummaryCard } from '../../components/PageHeading';
import { useMosqueScope } from '../mosques/MosqueScope';

const currency = import.meta.env.VITE_CURRENCY || 'PKR';

function money(value: number, locale: 'ur' | 'en') {
  return new Intl.NumberFormat(locale === 'ur' ? 'ur-PK' : 'en-PK', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(value);
}

function DashboardSkeleton() {
  return <Grid container spacing={2}><Grid size={{ xs: 12 }}><Skeleton height={100} /></Grid>{Array.from({ length: 4 }, (_, index) => <Grid key={index} size={{ xs: 12, sm: 6, xl: 3 }}><Skeleton variant="rounded" height={154} /></Grid>)}</Grid>;
}

function SummaryContent({ summary }: { summary: MosqueSummary }) {
  const { t, locale } = useI18n();
  const { role } = useAuth();
  const canFinance = role && ['admin', 'mosque_manager', 'accountant'].includes(role);
  const canProperty = role && ['admin', 'mosque_manager', 'property_manager'].includes(role);
  const canCommunity = role && ['admin', 'mosque_manager', 'imam', 'committee'].includes(role);
  const cards = [
    ...(canFinance ? [
      { label: t('incomeThisMonth'), value: money(summary.incomeThisMonth, locale), icon: <TrendingUpRounded />, tint: '#e7f4ec' },
      { label: t('expensesThisMonth'), value: money(summary.expensesThisMonth, locale), icon: <TrendingDownRounded />, tint: '#fff0e9' },
      { label: t('donationsThisMonth'), value: money(summary.donationsThisMonth, locale), icon: <FavoriteRounded />, tint: '#f9eaf0' },
    ] : []),
    ...(canProperty ? [
      { label: t('outstandingRent'), value: money(summary.outstandingRent, locale), icon: <PaymentsRounded />, tint: '#fff4df' },
      { label: t('occupancy'), value: `${summary.occupiedProperties} / ${summary.totalProperties}`, icon: <HomeWorkRounded />, tint: '#e9effa' },
    ] : []),
    ...(canCommunity ? [
      { label: t('worshipperCount'), value: summary.worshipperCount.toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-US'), icon: <GroupsRounded />, tint: '#e9f3f3' },
      { label: t('prayerAttendanceToday'), value: summary.prayerAttendanceToday.toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-US'), icon: <MosqueRounded />, tint: '#eeeafa' },
    ] : []),
  ];

  return <Grid container spacing={2}>
    {cards.map((card) => <Grid key={card.label} size={{ xs: 12, sm: 6, xl: 3 }}><SummaryCard {...card} /></Grid>)}
    {canFinance && <Grid size={{ xs: 12, xl: 8 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.7 }, borderRadius: 4, boxShadow: '0 10px 30px rgba(22,58,43,.045)' }}>
        <Typography variant="h6">{t('currentBalance')}</Typography>
        <Box height={290} mt={2}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={summary.monthlyTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#176b55" stopOpacity={0.24} /><stop offset="95%" stopColor="#176b55" stopOpacity={0} /></linearGradient>
                <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b89147" stopOpacity={0.2} /><stop offset="95%" stopColor="#b89147" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="#e8ebe6" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(value: number) => new Intl.NumberFormat(locale === 'ur' ? 'ur-PK' : 'en-PK', { notation: 'compact' }).format(value)} />
              <Tooltip formatter={(value) => money(Number(value), locale)} />
              <Area type="monotone" dataKey="income" name={t('income')} stroke="#176b55" fill="url(#incomeFill)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="expenses" name={t('expense')} stroke="#b89147" fill="url(#expenseFill)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Grid>}
    <Grid size={{ xs: 12, xl: canFinance ? 4 : 12 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.7 }, borderRadius: 4, height: '100%', boxShadow: '0 10px 30px rgba(22,58,43,.045)' }}>
        <Typography variant="h6">{t('prayerTimesToday')}</Typography>
        {summary.todayPrayerTimes.length === 0 ? <Typography color="text.secondary" mt={2}>{t('prayerTimesNote')}</Typography>
          : <Stack spacing={1.1} mt={2}>{summary.todayPrayerTimes.map((item) => <Stack key={item.prayer_name} direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.3, borderRadius: 2.5, bgcolor: 'background.default' }}>
            <Typography fontWeight={650}>{t(item.prayer_name)}</Typography><Typography dir="ltr" fontWeight={700}>{item.jamaat_time.slice(0, 5)}</Typography>
          </Stack>)}</Stack>}
      </Paper>
    </Grid>
    {canFinance && <Grid size={{ xs: 12, xl: 6 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.7 }, borderRadius: 4, height: '100%', boxShadow: '0 10px 30px rgba(22,58,43,.045)' }}>
        <Typography variant="h6">{t('recentTransactions')}</Typography>
        {summary.recentTransactions.length === 0 ? <Typography color="text.secondary" mt={2}>{t('noTransactions')}</Typography>
          : <Stack spacing={1} mt={1.8}>{summary.recentTransactions.map((transaction) => <Stack key={transaction.id} direction="row" justifyContent="space-between" gap={2} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box minWidth={0}><Typography fontWeight={650} noWrap>{transaction.description ?? t(transaction.category)}</Typography><Typography variant="caption" color="text.secondary">{transaction.entry_date} · {t(transaction.category)}</Typography></Box>
            <Typography fontWeight={700} color={transaction.entry_type === 'income' ? 'success.main' : 'error.main'} whiteSpace="nowrap">{transaction.entry_type === 'expense' ? '−' : '+'}{money(transaction.amount, locale)}</Typography>
          </Stack>)}</Stack>}
      </Paper>
    </Grid>}
    <Grid size={{ xs: 12, xl: canFinance ? 6 : 12 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.7 }, borderRadius: 4, height: '100%', boxShadow: '0 10px 30px rgba(22,58,43,.045)' }}>
        <Typography variant="h6">{t('upcomingPrograms')}</Typography>
        {summary.upcomingPrograms.length === 0 ? <Typography color="text.secondary" mt={2}>{t('noUpcomingPrograms')}</Typography>
          : <Stack spacing={1} mt={1.8}>{summary.upcomingPrograms.map((program) => <Stack key={program.id} direction="row" justifyContent="space-between" gap={2} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box minWidth={0}><Typography fontWeight={650} noWrap>{program.name}</Typography><Typography variant="caption" color="text.secondary">{t(program.program_type)}</Typography></Box>
            <Typography variant="body2" dir="ltr" color="text.secondary">{new Date(program.starts_at).toLocaleDateString(locale === 'ur' ? 'ur-PK' : 'en-PK')}</Typography>
          </Stack>)}</Stack>}
      </Paper>
    </Grid>
  </Grid>;
}

export default function DashboardPage() {
  const { t } = useI18n();
  const { mosqueId } = useMosqueScope();
  const summary = useQuery({
    queryKey: ['mosque-dashboard', mosqueId],
    queryFn: () => resourceRepository.dashboard(),
    placeholderData: keepPreviousData,
    enabled: Boolean(mosqueId),
  });

  return <Box className="page-enter">
    <PageHeading title={t('welcome')} description={t('dashboardSubtitle')} />
    {summary.isPending ? <DashboardSkeleton />
      : summary.error ? <Alert severity="error">{summary.error.message}</Alert>
        : <SummaryContent summary={summary.data} />}
  </Box>;
}
