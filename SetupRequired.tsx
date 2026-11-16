import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { MosqueRounded, ShieldRounded } from '@mui/icons-material';
import { useI18n } from '../i18n';

export default function SetupRequired() {
  const { t, locale, setLocale } = useI18n();
  return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center', p: 2 }}>
    <Card sx={{ width: '100%', maxWidth: 720, borderRadius: 5 }}>
      <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ p: 1.2, borderRadius: 3, bgcolor: 'primary.light', color: 'primary.main' }}><MosqueRounded fontSize="large" /></Box>
            <Box flex={1}><Typography variant="h4">{t('setupTitle')}</Typography><Typography color="text.secondary">{t('brand')} · {t('tagline')}</Typography></Box>
            <Button size="small" color="inherit" onClick={() => setLocale(locale === 'ur' ? 'en' : 'ur')}>{locale === 'ur' ? 'English' : 'اردو'}</Button>
          </Stack>
          <Typography>{t('setupText')}</Typography>
          <Alert severity="info"><Typography fontWeight={700}>{t('connectionRequired')}</Typography>{t('supabaseSetup')}</Alert>
          <Stack spacing={1.5}>
            {[1, 2, 3, 4].map((number) => <Stack key={number} direction="row" gap={1.5} alignItems="flex-start"><Chip label={number} size="small" color="primary" /><Typography>{t(`setupStep${number}`)}</Typography></Stack>)}
          </Stack>
          <Alert severity="warning" icon={<ShieldRounded />}>{t('setupWarning')}</Alert>
        </Stack>
      </CardContent>
    </Card>
  </Box>;
}
