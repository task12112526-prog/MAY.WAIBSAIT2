import { useMemo, useState, type FormEvent } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Grid, MenuItem, Snackbar, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useMosqueScope } from '../mosques/MosqueScope';
import PageHeading from '../../components/PageHeading';
import { useI18n } from '../../i18n';
import { requireSupabaseConfig, supabase } from '../../lib/supabase';
import { isLocalDemoEnabled, localDemoList, localDemoSave } from '../../services/localDemo';
import type { DbRow } from '../../types';

type Staff = DbRow & { id: string; full_name: string; job_title: string; mosque_id: string };
type StaffInterview = DbRow & {
  id: string; staff_id: string; mosque_id: string; interview_date: string; panel_members: string[];
  answers: Record<string, string>; assessment: string; score: number | null;
  outcome: 'recommended' | 'conditional' | 'not_recommended';
};

const questionIds = ['experience', 'integrity', 'role', 'reliability', 'mosque_commitment', 'follow_through'] as const;
type QuestionId = typeof questionIds[number];
const emptyAnswers = (): Record<QuestionId, string> => ({
  experience: '', integrity: '', role: '', reliability: '', mosque_commitment: '', follow_through: '',
});
const today = () => new Date().toISOString().slice(0, 10);
const parsePanel = (raw: string) => [...new Set(raw.split(/[,\n;]/).map((name) => name.trim()).filter(Boolean))];

function extractErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const msg = String((reason as { message: unknown }).message);
    const details = 'details' in reason && (reason as { details?: unknown }).details
      ? ` (${String((reason as { details: unknown }).details)})`
      : '';
    return `${msg}${details}`;
  }
  return fallback;
}

export default function StaffInterviewsPage() {
  const { role } = useAuth();
  const { t } = useI18n();
  const { mosqueId, isLoading: mosquesLoading } = useMosqueScope();
  const cache = useQueryClient();
  const demo = isLocalDemoEnabled();
  const [staffId, setStaffId] = useState('');
  const [interviewDate, setInterviewDate] = useState(today());
  const [panelText, setPanelText] = useState('');
  const [answers, setAnswers] = useState<Record<QuestionId, string>>(emptyAnswers);
  const [assessment, setAssessment] = useState('');
  const [score, setScore] = useState('');
  const [outcome, setOutcome] = useState<StaffInterview['outcome']>('recommended');
  const [errorText, setErrorText] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const isManager = role === 'admin' || role === 'mosque_manager';

  const staffQuery = useQuery<Staff[]>({
    queryKey: ['staff-interview-staff', mosqueId, demo],
    enabled: Boolean(mosqueId),
    queryFn: async () => {
      if (demo) {
        return localDemoList('staff_members', {
          page: 0, pageSize: 1000, search: '', sortBy: 'full_name', sortDirection: 'asc',
          searchFields: [], mosqueId,
        }).rows as Staff[];
      }
      requireSupabaseConfig();
      const { data, error } = await supabase.from('staff_members')
        .select('id,full_name,job_title,mosque_id').eq('mosque_id', mosqueId)
        .order('full_name').returns<Staff[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  const interviewQuery = useQuery<StaffInterview[]>({
    queryKey: ['staff-interviews', mosqueId, demo],
    enabled: Boolean(mosqueId),
    queryFn: async () => {
      if (demo) {
        return localDemoList('staff_interviews', {
          page: 0, pageSize: 1000, search: '', sortBy: 'interview_date', sortDirection: 'desc',
          searchFields: [], mosqueId,
        }).rows as StaffInterview[];
      }
      requireSupabaseConfig();
      const { data, error } = await supabase.from('staff_interviews').select('*')
        .eq('mosque_id', mosqueId).order('interview_date', { ascending: false }).returns<StaffInterview[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  const staffById = useMemo(() => new Map((staffQuery.data ?? []).map((member) => [member.id, member])), [staffQuery.data]);
  const save = useMutation({
    mutationFn: async () => {
      const panelMembers = parsePanel(panelText);
      if (!mosqueId || !staffId || !interviewDate || panelMembers.length < 2 || panelMembers.length > 8
        || questionIds.some((question) => !answers[question].trim()) || !assessment.trim()
        || (score !== '' && (!Number.isInteger(Number(score)) || Number(score) < 0 || Number(score) > 100))) {
        throw new Error('staffInterviewRequired');
      }
      const payload = {
        mosque_id: mosqueId,
        staff_id: staffId,
        interview_date: interviewDate,
        panel_members: panelMembers,
        answers,
        assessment: assessment.trim(),
        score: score === '' ? null : Number(score),
        outcome,
      };
      if (demo) {
        localDemoSave('staff_interviews', 'id', null, payload);
        return;
      }
      requireSupabaseConfig();
      const { error } = await supabase.from('staff_interviews').insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      setStaffId('');
      setPanelText('');
      setAnswers(emptyAnswers());
      setAssessment('');
      setScore('');
      setOutcome('recommended');
      setErrorText('');
      setSuccessOpen(true);
      await cache.invalidateQueries({ queryKey: ['staff-interviews', mosqueId] });
    },
    onError: (reason: unknown) => setErrorText(extractErrorMessage(reason, t('unexpectedError'))),
  });

  if (!isManager) return <Alert severity="info">{t('noPermission')}</Alert>;
  if (mosquesLoading) return <Typography>{t('loading')}</Typography>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Stack spacing={2.5} className="page-enter">
      <PageHeading title={t('staffInterviews')} description={t('staffInterviewsDescription')} />
      {staffQuery.error && <Alert severity="error">{extractErrorMessage(staffQuery.error, t('unexpectedError'))}</Alert>}
      {interviewQuery.error && <Alert severity="error">{extractErrorMessage(interviewQuery.error, t('unexpectedError'))}</Alert>}
      {errorText && (
        <Alert severity="error" onClose={() => setErrorText('')}>
          {errorText === 'staffInterviewRequired' ? t(errorText) : errorText}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Box component="form" onSubmit={submit}>
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={750}>{t('recordInterview')}</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 5 }}>
                  <TextField select fullWidth required label={t('staff')} value={staffId} onChange={(event) => setStaffId(event.target.value)}>
                    {(staffQuery.data ?? []).map((staff) => (
                      <MenuItem key={staff.id} value={staff.id}>{staff.full_name} · {staff.job_title}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField fullWidth required type="date" label={t('staffInterviewDate')} value={interviewDate} onChange={(event) => setInterviewDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField fullWidth type="number" label={t('staffInterviewScore')} value={score} onChange={(event) => setScore(event.target.value)} slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }} />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField fullWidth required multiline minRows={2} label={t('staffInterviewPanel')} value={panelText} onChange={(event) => setPanelText(event.target.value)} helperText={t('interviewPanelMembersHint')} />
                </Grid>
              </Grid>

              <Typography fontWeight={700}>{t('expectedInterviewQuestions')}</Typography>
              {questionIds.map((question) => (
                <TextField
                  key={question}
                  fullWidth
                  required
                  multiline
                  minRows={2}
                  label={t(`staffInterviewQuestion_${question}`)}
                  value={answers[question]}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question]: event.target.value }))}
                />
              ))}

              <TextField fullWidth required multiline minRows={3} label={t('staffInterviewAssessment')} value={assessment} onChange={(event) => setAssessment(event.target.value)} />

              <TextField select fullWidth required label={t('staffInterviewOutcome')} value={outcome} onChange={(event) => setOutcome(event.target.value as StaffInterview['outcome'])}>
                <MenuItem value="recommended">{t('outcome_recommended')}</MenuItem>
                <MenuItem value="conditional">{t('outcome_conditional')}</MenuItem>
                <MenuItem value="not_recommended">{t('outcome_not_recommended')}</MenuItem>
              </TextField>

              <Button type="submit" variant="contained" size="large" disabled={save.isPending}>
                {save.isPending ? t('loading') : t('saveInterview')}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('staff')}</TableCell>
                  <TableCell>{t('staffInterviewDate')}</TableCell>
                  <TableCell>{t('staffInterviewScore')}</TableCell>
                  <TableCell>{t('staffInterviewOutcome')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(interviewQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">{t('noInterviewsRecorded')}</TableCell>
                  </TableRow>
                ) : (
                  (interviewQuery.data ?? []).map((item) => {
                    const member = staffById.get(item.staff_id);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{member ? `${member.full_name} (${member.job_title})` : item.staff_id}</TableCell>
                        <TableCell>{item.interview_date}</TableCell>
                        <TableCell>{item.score ?? '-'}</TableCell>
                        <TableCell>{t(`outcome_${item.outcome}`)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Snackbar
        open={successOpen}
        autoHideDuration={4000}
        onClose={() => setSuccessOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessOpen(false)} severity="success" variant="filled" sx={{ width: '100%', fontWeight: 700 }}>
          ریکارڈ کامیابی سے محفوظ ہو گیا ہے!
        </Alert>
      </Snackbar>
    </Stack>
  );
}
