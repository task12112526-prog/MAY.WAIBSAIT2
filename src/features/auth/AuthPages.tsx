import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert, Box, Button, Container, IconButton, InputAdornment, Link as MuiLink,
  Paper, Stack, TextField, Typography,
} from '@mui/material';
import { Visibility, VisibilityOff, ArrowBackRounded } from '@mui/icons-material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase, requireSupabaseConfig, isSupabaseConfigured } from '../../lib/supabase';
import { displayError } from '../../lib/format';
import { useAuth } from './AuthProvider';

const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
const emailSchema = z.object({ email: z.email('Enter a valid email address.') });
const passwordSchema = z.object({
  password: z.string().min(12, 'Use at least 12 characters.'),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

type LoginInput = z.infer<typeof loginSchema>;
type EmailInput = z.infer<typeof emailSchema>;
type PasswordInput = z.infer<typeof passwordSchema>;

function AuthCard({ children, heading, subheading }: { children: React.ReactNode; heading: string; subheading: string }) {
  return (
    <Box className="auth-page">
      <Container maxWidth="xs">
        <Stack spacing={3}>
          <Link to="/" className="auth-brand"><span className="brand-symbol">p</span><span>people<span className="brand-accent">OS</span></span></Link>
          <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 4, p: { xs: 3, sm: 4 } }}>
            <Stack spacing={3}>
              <Box><Typography variant="h4" mb={0.75}>{heading}</Typography><Typography color="text.secondary">{subheading}</Typography></Box>
              {children}
            </Stack>
          </Paper>
          <Typography variant="caption" color="text.secondary" textAlign="center">A more thoughtful way to manage your people.</Typography>
        </Stack>
      </Container>
    </Box>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshRole } = useAuth();
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setError('');
    try {
      requireSupabaseConfig();
      const { error: signInError } = await supabase.auth.signInWithPassword(values);
      if (signInError) throw signInError;
      await refreshRole();
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';
      navigate(destination, { replace: true });
    } catch (submitError: unknown) {
      setError(displayError(submitError));
    }
  }

  return (
    <AuthCard heading="Welcome back." subheading="Sign in to your workspace.">
      {!isSupabaseConfigured && <Alert severity="warning">Add your Supabase URL and publishable key to <code>.env.local</code> to connect your workspace.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack component="form" spacing={2.25} onSubmit={form.handleSubmit(onSubmit)}>
        <TextField label="Work email" autoComplete="email" fullWidth {...form.register('email')} error={Boolean(form.formState.errors.email)} helperText={form.formState.errors.email?.message} />
        <TextField label="Password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" fullWidth {...form.register('password')} error={Boolean(form.formState.errors.password)} helperText={form.formState.errors.password?.message} slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)} edge="end">{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> } }} />
        <Box textAlign="right" mt={-1}><MuiLink component={Link} to="/forgot-password" underline="hover" variant="body2">Forgot password?</MuiLink></Box>
        <Button type="submit" variant="contained" size="large" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
        <Button component={Link} to="/update-password" color="inherit" size="small">Change your password</Button>
      </Stack>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const form = useForm<EmailInput>({ resolver: zodResolver(emailSchema) });

  async function onSubmit(values: EmailInput) {
    setError('');
    try {
      requireSupabaseConfig();
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(values.email, { redirectTo: `${window.location.origin}/update-password` });
      if (requestError) throw requestError;
      setSent(true);
    } catch (submitError: unknown) { setError(displayError(submitError)); }
  }

  return (
    <AuthCard heading={sent ? 'Check your inbox.' : 'Forgot your password?'} subheading={sent ? 'If that email has an account, a reset link is on its way.' : 'We’ll email you a secure link to reset your password.'}>
      {error && <Alert severity="error">{error}</Alert>}
      {!sent && <Stack component="form" spacing={2.5} onSubmit={form.handleSubmit(onSubmit)}><TextField label="Work email" autoComplete="email" fullWidth {...form.register('email')} error={Boolean(form.formState.errors.email)} helperText={form.formState.errors.email?.message} /><Button variant="contained" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}</Button></Stack>}
      <Button component={Link} to="/login" startIcon={<ArrowBackRounded />} color="inherit">Back to sign in</Button>
    </AuthCard>
  );
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const form = useForm<PasswordInput>({ resolver: zodResolver(passwordSchema) });

  async function onSubmit(values: PasswordInput) {
    setError('');
    setSuccess('');
    try {
      requireSupabaseConfig();
      const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
      if (updateError) throw updateError;
      setSuccess('Your password has been updated.');
      if (!session) window.setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (submitError: unknown) { setError(displayError(submitError)); }
  }

  return (
    <AuthCard heading="Choose a new password." subheading="Use at least 12 characters to keep your account secure.">
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      {!session && !window.location.hash.includes('access_token') && <Alert severity="info">Open the password-reset link from your email first.</Alert>}
      <Stack component="form" spacing={2} onSubmit={form.handleSubmit(onSubmit)}>
        <TextField label="New password" type="password" autoComplete="new-password" {...form.register('password')} error={Boolean(form.formState.errors.password)} helperText={form.formState.errors.password?.message} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" {...form.register('confirmPassword')} error={Boolean(form.formState.errors.confirmPassword)} helperText={form.formState.errors.confirmPassword?.message} />
        <Button type="submit" variant="contained" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Saving…' : 'Update password'}</Button>
      </Stack>
    </AuthCard>
  );
}
