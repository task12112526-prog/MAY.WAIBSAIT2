import { useState, type FormEvent } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, MenuItem, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { isLocalDemoEnabled } from '../../services/localDemo';
import { supabase } from '../../lib/supabase';
import { useMosqueScope } from '../mosques/MosqueScope';

type MemberAccount = {
  member_number: string;
  full_name: string;
  email: string;
  role: 'imam' | 'committee' | 'worshipper';
  status: 'pending' | 'invited' | 'active' | 'error';
};

type MemberResponse = { members: MemberAccount[] };
type InviteInput = { full_name: string; email: string; role: MemberAccount['role']; mosque_id: string };
const allowedRoles: MemberAccount['role'][] = ['imam', 'committee', 'worshipper'];

async function callMemberFunction<T>(body: ({ action: 'list'; mosque_id: string }) | ({ action: 'invite' } & InviteInput)): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('manage-masjid-members', { body });
  if (error) {
    if ('context' in error && error.context instanceof Response) {
      const payload: unknown = await error.context.clone().json().catch(() => null);
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        throw new Error(payload.error);
      }
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error('The account service returned an empty response.');
  return data;
}

export default function MemberAccountsPage() {
  const { role } = useAuth();
  const { t } = useI18n();
  const { mosqueId } = useMosqueScope();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [memberRole, setMemberRole] = useState<MemberAccount['role']>('worshipper');
  const localDemo = isLocalDemoEnabled();
  const accounts = useQuery({
    queryKey: ['member-accounts', mosqueId],
    queryFn: () => callMemberFunction<MemberResponse>({ action: 'list', mosque_id: mosqueId }),
    enabled: role === 'admin' && !localDemo && Boolean(mosqueId),
  });
  const invite = useMutation({
    mutationFn: (input: InviteInput) => callMemberFunction<{ member: MemberAccount }>({ action: 'invite', ...input }),
    onSuccess: async () => {
      setFullName('');
      setEmail('');
      await queryClient.invalidateQueries({ queryKey: ['member-accounts', mosqueId] });
    },
  });

  if (role !== 'admin') {
    return <Alert severity="error">{t('noPermission')}</Alert>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invite.reset();
    const normalizedEmail = email.trim().toLowerCase();
    invite.mutate({ full_name: fullName.trim(), email: normalizedEmail, role: memberRole, mosque_id: mosqueId });
  }

  const members = accounts.data?.members ?? [];
  const full = members.length >= 9;
  return <Stack spacing={2.5}>
    <Box>
      <Typography variant="h4" fontWeight={800}>{t('memberAccounts')}</Typography>
      <Typography color="text.secondary" mt={0.5}>{t('memberAccountsDescription')}</Typography>
    </Box>
    {localDemo && <Alert severity="warning">{t('exitDemoBeforeInviting')}</Alert>}
    {accounts.error && <Alert severity="error">{accounts.error.message}</Alert>}
    {invite.error && <Alert severity="error">{invite.error.message}</Alert>}
    {invite.isSuccess && <Alert severity="success">{t('inviteSent')}</Alert>}

    <Card>
      <CardContent>
        <Typography variant="h6" fontWeight={750} mb={2}>{t('inviteMember')}</Typography>
        <Box component="form" onSubmit={submit}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'flex-start' }}>
            <TextField fullWidth required label={t('name')} value={fullName} onChange={(event) => setFullName(event.target.value)} inputProps={{ maxLength: 100 }} />
            <TextField fullWidth required type="email" label={t('emailAddress')} value={email} onChange={(event) => setEmail(event.target.value)} />
            <TextField select fullWidth label={t('role')} value={memberRole} onChange={(event) => setMemberRole(event.target.value as MemberAccount['role'])}>
              {allowedRoles.map((option) => <MenuItem key={option} value={option}>{t(option)}</MenuItem>)}
            </TextField>
            <Button type="submit" variant="contained" disabled={localDemo || full || invite.isPending} sx={{ minWidth: 140, minHeight: 56 }}>
              {invite.isPending ? <CircularProgress size={22} color="inherit" /> : t('sendInvite')}
            </Button>
          </Stack>
        </Box>
        <Typography variant="body2" color="text.secondary" mt={1.5}>{t('invitePasswordNote')}</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>{t('memberPermissionNote')}</Typography>
      </CardContent>
    </Card>

    {accounts.isLoading && <Box display="grid" sx={{ placeItems: 'center', py: 4 }}><CircularProgress /></Box>}
    {accounts.isSuccess && <Card>
      <CardContent>
        <Typography variant="h6" fontWeight={750} mb={1}>{t('memberNumberList')}</Typography>
        {full && <Alert severity="info" sx={{ mb: 2 }}>{t('allMemberNumbersUsed')}</Alert>}
        {!members.length ? <Typography color="text.secondary">{t('noMemberAccounts')}</Typography> :
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>{t('memberNumber')}</TableCell>
                <TableCell>{t('name')}</TableCell>
                <TableCell>{t('emailAddress')}</TableCell>
                <TableCell>{t('role')}</TableCell>
                <TableCell>{t('status')}</TableCell>
              </TableRow></TableHead>
              <TableBody>{members.map((member) => <TableRow key={member.member_number}>
                <TableCell>{member.member_number}</TableCell>
                <TableCell>{member.full_name}</TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>{t(member.role)}</TableCell>
                <TableCell>{t(`inviteStatus_${member.status}`)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>}
      </CardContent>
    </Card>}
  </Stack>;
}
