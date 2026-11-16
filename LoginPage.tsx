import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { MosqueRounded } from '@mui/icons-material';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../i18n';

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) setError(signInError.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('unexpectedError'));
    } finally {
      setBusy(false);
    }
  }

  return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center', px: 2, py: 4 }}>
    <Card sx={{ width: '100%', maxWidth: 430, borderRadius: 5 }}>
      <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
        <Stack spacing={3}>
          <Box display="flex" justifyContent="flex-end"><Button size="small" color="inherit" onClick={() => setLocale(locale === 'ur' ? 'en' : 'ur')}>{locale === 'ur' ? 'English' : 'اردو'}</Button></Box>
          <Stack alignItems="center" spacing={1.2}>
            <Box sx={{ width: 58, height: 58, display: 'grid', placeItems: 'center', bgcolor: 'primary.light', color: 'primary.main', borderRadius: 3 }}><MosqueRounded fontSize="large" /></Box>
            <Typography variant="h5">{t('brand')}</Typography>
            <Typography color="text.secondary">{t('tagline')}</Typography>
          </Stack>
          <Box component="form" onSubmit={submit}>
            <Stack spacing={2.2}>
              <Typography variant="h6" textAlign="center">{t('signIn')}</Typography>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label={t('email')} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <TextField label={t('password')} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? t('loading') : t('signIn')}</Button>
            </Stack>
          </Box>
          <Typography variant="caption" textAlign="center" color="text.secondary">{t('loginHelp')}</Typography>
        </Stack>
      </CardContent>
    </Card>
  </Box>;
}
