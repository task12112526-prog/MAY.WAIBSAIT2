import { useMemo, useState, type FormEvent } from 'react';
import {
  AddRounded, AutorenewRounded, CheckCircleOutlineRounded, EditOutlined, GroupsRounded,
  HowToRegRounded, PersonAddAltRounded, PrintRounded, VerifiedRounded,
} from '@mui/icons-material';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import PageHeading from '../../components/PageHeading';
import { useI18n } from '../../i18n';
import { isLocalDemoEnabled, localDemoList, localDemoSave } from '../../services/localDemo';
import { requireSupabaseConfig, supabase } from '../../lib/supabase';
import type { DbRow } from '../../types';

type CommitteeStatus = 'draft' | 'active' | 'expired' | 'dissolved';
type MemberStatus = 'candidate' | 'active' | 'removed';
type Recommendation = 'suitable' | 'conditional' | 'not_suitable';
type Department = 'finance' | 'maintenance' | 'events' | 'administration' | 'education' | 'welfare' | 'security' | 'facilities';
type Authority = 'view' | 'propose' | 'approve' | 'manage';
type Mosque = DbRow & { id: string; name: string; registration_number: string | null };
type Committee = DbRow & {
  id: string; mosque_id: string; previous_committee_id: string | null; title: string;
  term_starts_on: string; term_ends_on: string; status: CommitteeStatus;
};
type CommitteeMember = DbRow & {
  id: string; committee_id: string; full_name: string; phone: string; email: string | null;
  cnic_number: string | null; address: string; member_position: 'supervisor' | 'member'; department: Department;
  authority_level: Authority; status: MemberStatus;
};
type CommitteeHistoryRow = {
  id: string; member_id: string; committee_id: string; committee_title: string; mosque_id: string; mosque_name: string;
  term_starts_on: string; term_ends_on: string; committee_status: CommitteeStatus; full_name: string;
  phone: string; cnic_last_digit: string | null; member_position: CommitteeMember['member_position'];
  department: Department; member_status: MemberStatus;
};
type Interview = DbRow & {
  id: string; member_id: string; interview_date: string; interviewer_name: string;
  answers: Record<string, string>; assessment: string; recommendation: Recommendation;
};
type CommitteePledge = DbRow & {
  id: string; member_id: string; pledge_text: string; affirmed_on: string; witness_names: string[];
};
type PerformanceRating = 'excellent' | 'good' | 'needs_improvement' | 'unsatisfactory';
type PerformanceReview = DbRow & {
  id: string; member_id: string; period_starts_on: string; period_ends_on: string; rating: PerformanceRating;
  completed_tasks: string; pending_tasks: string | null; achievements: string | null;
  improvement_notes: string | null; reviewer_name: string; reviewed_on: string;
};

const departments: Department[] = ['finance', 'maintenance', 'events', 'administration', 'education', 'welfare', 'security', 'facilities'];
const authorities: Authority[] = ['view', 'propose', 'approve', 'manage'];
const questions = ['experience', 'integrity', 'community', 'conflict', 'availability', 'institutional_commitment', 'follow_through'] as const;
type Question = typeof questions[number];
const panelMembers = (value: string) => [...new Set(value.split(/[,\n;]/).map((name) => name.trim()).filter(Boolean))];
const normalizeDigits = (value: string) => value.replace(/\D/g, '');
const normalizeCnic = (value: string) => value.replace(/[\s-]/g, '');
const maskCnic = (value: string | null | undefined) => value ? `*****-*******-${value.slice(-1)}` : '—';
const emptyMember = () => ({
  full_name: '', phone: '', email: '', cnic_number: '', address: '', member_position: 'member' as 'supervisor' | 'member',
  department: 'administration' as Department, authority_level: 'propose' as Authority, status: 'candidate' as MemberStatus,
});
const today = () => new Date().toISOString().slice(0, 10);
const addYear = (date: string) => {
  const result = new Date(`${date}T12:00:00`);
  result.setFullYear(result.getFullYear() + 1);
  return result.toISOString().slice(0, 10);
};

function demoRows(table: string): DbRow[] {
  return localDemoList(table, {
    page: 0, pageSize: 10000, search: '', sortBy: 'created_at',
    sortDirection: 'desc', searchFields: [],
  }).rows;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export default function MosqueCommitteesPage() {
  const { t } = useI18n();
  const { role } = useAuth();
  const cache = useQueryClient();
  const demo = isLocalDemoEnabled();
  const canManage = role === 'admin' || role === 'mosque_manager';
  const [committeeDialog, setCommitteeDialog] = useState(false);
  const [memberDialog, setMemberDialog] = useState(false);
  const [interviewDialog, setInterviewDialog] = useState(false);
  const [renewDialog, setRenewDialog] = useState(false);
  const [pledgeDialog, setPledgeDialog] = useState(false);
  const [performanceDialog, setPerformanceDialog] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [performanceMember, setPerformanceMember] = useState<CommitteeHistoryRow | CommitteeMember | null>(null);
  const [performanceCommittee, setPerformanceCommittee] = useState<Committee | null>(null);
  const [performanceForm, setPerformanceForm] = useState({
    period_starts_on: '', period_ends_on: '', rating: 'good' as PerformanceRating,
    completed_tasks: '', pending_tasks: '', achievements: '', improvement_notes: '',
    reviewer_name: '', reviewed_on: today(),
  });
  const [editingMember, setEditingMember] = useState<CommitteeMember | null>(null);
  const [interviewMember, setInterviewMember] = useState<CommitteeMember | null>(null);
  const [pledgeMember, setPledgeMember] = useState<CommitteeMember | null>(null);
  const [pledgeDate, setPledgeDate] = useState(today());
  const [pledgeWitnesses, setPledgeWitnesses] = useState('');
  const [pledgeConfirmed, setPledgeConfirmed] = useState(false);
  const [mosqueId, setMosqueId] = useState('');
  const [title, setTitle] = useState(t('committeeDefaultTitle'));
  const [termStart, setTermStart] = useState(today());
  const [termEnd, setTermEnd] = useState(addYear(today()));
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [interviewDate, setInterviewDate] = useState(today());
  const [interviewerName, setInterviewerName] = useState('');
  const [answers, setAnswers] = useState<Record<Question, string>>({
    experience: '', integrity: '', community: '', conflict: '', availability: '',
    institutional_commitment: '', follow_through: '',
  });
  const [assessment, setAssessment] = useState('');
  const [recommendation, setRecommendation] = useState<Recommendation>('suitable');
  const [errorText, setErrorText] = useState('');

  const mosquesQuery = useQuery<Mosque[]>({
    queryKey: ['committee-mosques'],
    queryFn: async () => {
      if (demo) return demoRows('mosque_registrations') as Mosque[];
      requireSupabaseConfig();
      const { data, error } = await supabase.from('mosque_registrations').select('id,name,registration_number').order('name').returns<Mosque[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const committeesQuery = useQuery<Committee[]>({
    queryKey: ['mosque-committees'],
    queryFn: async () => {
      if (demo) return demoRows('mosque_committees') as Committee[];
      requireSupabaseConfig();
      const { data, error } = await supabase.from('mosque_committees').select('*')
        .order('term_starts_on', { ascending: false }).returns<Committee[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const committees = committeesQuery.data ?? [];
  const mosques = mosquesQuery.data ?? [];
  const historyQuery = useQuery<CommitteeHistoryRow[]>({
    queryKey: ['mosque-committee-history', historySearch],
    enabled: historySearch.length >= 3,
    queryFn: async () => {
      if (demo) {
        const searchText = historySearch.trim().toLocaleLowerCase();
        const digits = normalizeDigits(historySearch);
        const committeeById = new Map((demoRows('mosque_committees') as Committee[])
          .map((committee) => [committee.id, committee]));
        const mosqueById = new Map((mosquesQuery.data ?? []).map((mosque) => [mosque.id, mosque]));
        return (demoRows('mosque_committee_members') as CommitteeMember[])
          .filter((member) => {
            const cnic = member.cnic_number ? normalizeCnic(member.cnic_number) : '';
            const phone = normalizeDigits(member.phone);
            return (digits.length === 13 && cnic === digits)
              || (digits.length >= 7 && phone === digits)
              || member.full_name.toLocaleLowerCase().includes(searchText);
          })
          .flatMap((member) => {
            const committee = committeeById.get(member.committee_id);
            const mosque = committee ? mosqueById.get(committee.mosque_id) : undefined;
            if (!committee || !mosque) return [];
            return [{
              id: member.id, member_id: member.id, committee_id: committee.id, committee_title: committee.title,
              mosque_id: mosque.id, mosque_name: mosque.name, term_starts_on: committee.term_starts_on,
              term_ends_on: committee.term_ends_on, committee_status: committee.status,
              full_name: member.full_name, phone: member.phone,
              cnic_last_digit: member.cnic_number ? member.cnic_number.slice(-1) : null,
              member_position: member.member_position, department: member.department, member_status: member.status,
              address: member.address,
            }];
          }).slice(0, 100);
      }
      requireSupabaseConfig();
      const { data, error } = await supabase.rpc('search_mosque_committee_history', { p_search: historySearch })
        .overrideTypes<CommitteeHistoryRow[]>();
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error(t('committeeHistoryResponseInvalid'));
      return data.map((row) => ({ ...row, id: row.member_id }));
    },
  });
  const historyRows = historyQuery.data ?? [];
  const performanceQuery = useQuery<PerformanceReview[]>({
    queryKey: ['mosque-committee-performance', historyRows.map((row) => row.member_id).join(',')],
    enabled: historyRows.length > 0,
    queryFn: async () => {
      const memberIds = [...new Set(historyRows.map((row) => row.member_id))];
      if (demo) return (demoRows('mosque_committee_performance_reviews') as PerformanceReview[])
        .filter((review) => memberIds.includes(review.member_id));
      requireSupabaseConfig();
      const { data, error } = await supabase.from('mosque_committee_performance_reviews').select('*')
        .in('member_id', memberIds).order('reviewed_on', { ascending: false }).returns<PerformanceReview[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const selectedCommittee = committees.find((committee) => committee.id === selectedId) ?? null;
  const membersQuery = useQuery<CommitteeMember[]>({
    queryKey: ['mosque-committee-members', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      if (demo) return (demoRows('mosque_committee_members') as CommitteeMember[]).filter((member) => member.committee_id === selectedId);
      requireSupabaseConfig();
      const { data, error } = await supabase.from('mosque_committee_members').select('*')
        .eq('committee_id', selectedId).order('member_position').order('full_name').returns<CommitteeMember[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const members = membersQuery.data ?? [];
  const interviewsQuery = useQuery<Interview[]>({
    queryKey: ['mosque-committee-interviews', selectedId, members.map((member) => member.id).join(',')],
    enabled: Boolean(selectedId) && members.length > 0,
    queryFn: async () => {
      if (!members.length) return [];
      if (demo) {
        const memberIds = new Set((demoRows('mosque_committee_members') as CommitteeMember[])
          .filter((member) => member.committee_id === selectedId).map((member) => member.id));
        return (demoRows('mosque_committee_interviews') as Interview[]).filter((interview) => memberIds.has(interview.member_id));
      }
      requireSupabaseConfig();
      const { data, error } = await supabase.from('mosque_committee_interviews').select('*')
        .in('member_id', members.map((member) => member.id) as string[])
        .order('interview_date', { ascending: false }).order('created_at', { ascending: false }).returns<Interview[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const pledgesQuery = useQuery<CommitteePledge[]>({
    queryKey: ['mosque-committee-pledges', selectedId, members.map((member) => member.id).join(',')],
    enabled: Boolean(selectedId) && members.length > 0,
    queryFn: async () => {
      if (!members.length) return [];
      if (demo) {
        const memberIds = new Set(members.map((member) => member.id));
        return (demoRows('mosque_committee_pledges') as CommitteePledge[])
          .filter((pledge) => memberIds.has(pledge.member_id));
      }
      requireSupabaseConfig();
      const { data, error } = await supabase.from('mosque_committee_pledges').select('*')
        .in('member_id', members.map((member) => member.id) as string[])
        .order('affirmed_on', { ascending: false }).returns<CommitteePledge[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const pledgeByMember = useMemo(() => new Map(
    (pledgesQuery.data ?? []).map((pledge) => [pledge.member_id, pledge]),
  ), [pledgesQuery.data]);
  const interviewByMember = useMemo(() => {
    const result = new Map<string, Interview>();
    for (const interview of interviewsQuery.data ?? []) {
      if (!result.has(interview.member_id)) result.set(interview.member_id, interview);
    }
    return result;
  }, [interviewsQuery.data]);
  const activeMembers = members.filter((member) => member.status === 'active' && member.member_position === 'member');
  const activeSupervisors = members.filter((member) => member.status === 'active' && member.member_position === 'supervisor');
  const activeMembersAssessed = members
    .filter((member) => member.status === 'active')
    .every((member) => ['suitable', 'conditional'].includes(interviewByMember.get(member.id)?.recommendation ?? ''));
  const savedPledge = pledgeMember ? pledgeByMember.get(pledgeMember.id) : undefined;
  const termIncludesToday = Boolean(selectedCommittee
    && selectedCommittee.term_starts_on <= today() && selectedCommittee.term_ends_on >= today());
  const canActivate = activeMembers.length >= 5 && activeMembers.length <= 7
    && activeSupervisors.length === 1 && activeMembersAssessed && termIncludesToday;
  const mosqueName = (id: string) => {
    const mosque = mosques.find((item) => item.id === id);
    return mosque ? `${mosque.name}${mosque.registration_number ? ` · ${mosque.registration_number}` : ''}` : t('unknownArea');
  };
  const buildPledgeText = (member: CommitteeMember, committee: Committee) => [
    t('pledgeOpening')
      .replace('{name}', member.full_name)
      .replace('{mosque}', mosqueName(committee.mosque_id))
      .replace('{start}', committee.term_starts_on)
      .replace('{end}', committee.term_ends_on),
    t('pledgeClause_service'),
    t('pledgeClause_integrity'),
    t('pledgeClause_confidentiality'),
    t('pledgeClause_conflicts'),
    t('pledgeClause_authority'),
    t('pledgeClause_completion'),
    t('pledgeClosing'),
  ].join('\n\n');

  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['mosque-committees'] }),
      cache.invalidateQueries({ queryKey: ['mosque-committee-members'] }),
      cache.invalidateQueries({ queryKey: ['mosque-committee-interviews'] }),
      cache.invalidateQueries({ queryKey: ['mosque-committee-pledges'] }),
    ]);
  };
  const saveCommittee = useMutation({
    mutationFn: async () => {
      if (!mosqueId || !title.trim() || !termStart || !termEnd || termEnd < termStart) {
        throw new Error(t('committeeRequiredFields'));
      }
      const payload = {
        mosque_id: mosqueId, title: title.trim(), term_starts_on: termStart, term_ends_on: termEnd,
        status: 'draft' as CommitteeStatus,
      };
      if (demo) return localDemoSave('mosque_committees', 'id', null, payload);
      requireSupabaseConfig();
      const { data, error } = await supabase.from('mosque_committees').insert(payload).select('id').single();
      if (error) throw error;
      return String(data.id);
    },
    onSuccess: async (id) => {
      setCommitteeDialog(false);
      setErrorText('');
      setSelectedId(id);
      await refresh();
    },
    onError: (error) => setErrorText(error.message),
  });
  const saveMember = useMutation({
    mutationFn: async () => {
      if (!selectedId || !memberForm.full_name.trim() || !memberForm.phone.trim() || !memberForm.address.trim()) {
        throw new Error(t('committeeMemberRequired'));
      }
      const cnic = normalizeCnic(memberForm.cnic_number);
      if (memberForm.cnic_number.trim() && !/^\d{13}$/.test(cnic)) throw new Error(t('committeeCnicInvalid'));
      if (memberForm.status === 'active' && !['suitable', 'conditional'].includes(interviewByMember.get(editingMember?.id ?? '')?.recommendation ?? '')) {
        throw new Error(t('committeeInterviewBeforeAppointment'));
      }
      const payload = {
        committee_id: selectedId, ...memberForm, full_name: memberForm.full_name.trim(),
        phone: memberForm.phone.trim(), email: memberForm.email.trim() || null,
        cnic_number: cnic || null, address: memberForm.address.trim(),
      };
      if (demo) return localDemoSave('mosque_committee_members', 'id', editingMember?.id ?? null, payload);
      requireSupabaseConfig();
      const result = editingMember
        ? await supabase.from('mosque_committee_members').update(payload).eq('id', editingMember.id)
        : await supabase.from('mosque_committee_members').insert(payload);
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      setMemberDialog(false);
      setErrorText('');
      await refresh();
    },
    onError: (error) => setErrorText(error.message),
  });
  const saveInterview = useMutation({
    mutationFn: async () => {
      if (!interviewMember || panelMembers(interviewerName).length < 2 || !assessment.trim()
        || questions.some((question) => !answers[question].trim())) {
        throw new Error(t('interviewRequiredFields'));
      }
      const payload = {
        member_id: interviewMember.id, interview_date: interviewDate, interviewer_name: panelMembers(interviewerName).join(', '),
        answers, assessment: assessment.trim(), recommendation,
      };
      if (demo) return localDemoSave('mosque_committee_interviews', 'id', null, payload);
      requireSupabaseConfig();
      const { error } = await supabase.from('mosque_committee_interviews').insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      setInterviewDialog(false);
      setErrorText('');
      await refresh();
    },
    onError: (error) => setErrorText(error.message),
  });
  const savePledge = useMutation({
    mutationFn: async () => {
      if (!pledgeMember || !selectedCommittee || selectedCommittee.status !== 'active'
        || pledgeMember.status !== 'active' || !pledgeConfirmed || !pledgeDate || pledgeDate > today()
        || pledgeDate < selectedCommittee.term_starts_on || pledgeDate > selectedCommittee.term_ends_on
        || !panelMembers(pledgeWitnesses).length || panelMembers(pledgeWitnesses).length > 4) {
        throw new Error(t('pledgeRequiredFields'));
      }
      const payload = {
        member_id: pledgeMember.id,
        pledge_text: buildPledgeText(pledgeMember, selectedCommittee),
        affirmed_on: pledgeDate,
        witness_names: panelMembers(pledgeWitnesses),
      };
      if (demo) return localDemoSave('mosque_committee_pledges', 'id', null, payload);
      requireSupabaseConfig();
      const { error } = await supabase.from('mosque_committee_pledges').insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      setPledgeDialog(false);
      setErrorText('');
      await refresh();
    },
    onError: (error) => setErrorText(error.message),
  });
  const savePerformance = useMutation({
    mutationFn: async () => {
      if (!performanceMember || !performanceCommittee || !performanceForm.period_starts_on
        || !performanceForm.period_ends_on || performanceForm.period_ends_on < performanceForm.period_starts_on
        || performanceForm.period_starts_on < performanceCommittee.term_starts_on
        || performanceForm.period_ends_on > performanceCommittee.term_ends_on
        || performanceForm.reviewed_on < performanceForm.period_ends_on || performanceForm.reviewed_on > today()
        || ('member_status' in performanceMember && performanceMember.member_status === 'candidate')
        || ('status' in performanceMember && performanceMember.status === 'candidate')
        || !performanceForm.completed_tasks.trim() || !performanceForm.reviewer_name.trim()) {
        throw new Error(t('performanceRequiredFields'));
      }
      const payload = {
        member_id: performanceMember.id, ...performanceForm,
        completed_tasks: performanceForm.completed_tasks.trim(),
        pending_tasks: performanceForm.pending_tasks.trim() || null,
        achievements: performanceForm.achievements.trim() || null,
        improvement_notes: performanceForm.improvement_notes.trim() || null,
        reviewer_name: performanceForm.reviewer_name.trim(),
      };
      if (demo) return localDemoSave('mosque_committee_performance_reviews', 'id', null, payload);
      requireSupabaseConfig();
      const { error } = await supabase.from('mosque_committee_performance_reviews').insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      setPerformanceDialog(false);
      setErrorText('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['mosque-committee-performance'] }),
        cache.invalidateQueries({ queryKey: ['mosque-committee-members'] }),
      ]);
    },
    onError: (error) => setErrorText(error.message),
  });
  const setCommitteeStatus = useMutation({
    mutationFn: async (status: 'active' | 'expired') => {
      if (!selectedCommittee) throw new Error(t('selectCommittee'));
      if (demo) {
        if (status === 'active') {
          if (!canActivate) throw new Error(t('committeeActivationInvalid'));
          const current = (demoRows('mosque_committees') as Committee[])
            .find((committee) => committee.mosque_id === selectedCommittee.mosque_id
              && committee.status === 'active' && committee.id !== selectedCommittee.id);
          if (current) {
            if (selectedCommittee.term_starts_on <= current.term_starts_on) {
              throw new Error(t('committeeActivationInvalid'));
            }
            const lastDay = new Date(`${selectedCommittee.term_starts_on}T12:00:00`);
            lastDay.setDate(lastDay.getDate() - 1);
            const adjustedEnd = lastDay.toISOString().slice(0, 10);
            localDemoSave('mosque_committees', 'id', current.id, {
              status: 'expired',
              term_ends_on: adjustedEnd < current.term_ends_on ? adjustedEnd : current.term_ends_on,
            });
          }
        }
        return localDemoSave('mosque_committees', 'id', selectedCommittee.id, { status });
      }
      requireSupabaseConfig();
      const { error } = await supabase.from('mosque_committees').update({ status }).eq('id', selectedCommittee.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setErrorText('');
      await refresh();
    },
    onError: (error) => setErrorText(error.message),
  });
  const renewCommittee = useMutation({
    mutationFn: async () => {
      if (!selectedCommittee || termEnd < termStart) throw new Error(t('committeeRequiredFields'));
      if (demo) {
        const newId = localDemoSave('mosque_committees', 'id', null, {
          mosque_id: selectedCommittee.mosque_id, previous_committee_id: selectedCommittee.id,
          title: selectedCommittee.title, term_starts_on: termStart, term_ends_on: termEnd, status: 'draft',
        });
        const newCommittee = (demoRows('mosque_committees') as Committee[])
          .find((committee) => committee.id === newId);
        if (newCommittee) members.filter((member) => member.status === 'active').forEach((member) => {
          localDemoSave('mosque_committee_members', 'id', null, {
            committee_id: newCommittee.id, full_name: member.full_name, phone: member.phone, email: member.email,
            cnic_number: member.cnic_number ?? null, address: member.address,
            member_position: member.member_position, department: member.department,
            authority_level: member.authority_level, status: 'candidate',
          });
        });
        if (!newCommittee) throw new Error(t('committeeRenewalFailed'));
        return newCommittee.id;
      }
      requireSupabaseConfig();
      const { data, error } = await supabase.rpc('renew_mosque_committee', {
        p_committee_id: selectedCommittee.id, p_term_starts_on: termStart, p_term_ends_on: termEnd,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: async (id) => {
      setRenewDialog(false);
      setErrorText('');
      setSelectedId(id);
      await refresh();
    },
    onError: (error) => setErrorText(error.message),
  });

  function openNewCommittee() {
    setMosqueId(mosques[0]?.id ?? '');
    setTitle(t('committeeDefaultTitle'));
    setTermStart(today());
    setTermEnd(addYear(today()));
    setCommitteeDialog(true);
  }
  function openMember(member?: CommitteeMember) {
    setEditingMember(member ?? null);
    setMemberForm(member ? {
      full_name: member.full_name, phone: member.phone, email: member.email ?? '',
      cnic_number: member.cnic_number ?? '', address: member.address,
      member_position: member.member_position, department: member.department, authority_level: member.authority_level,
      status: member.status,
    } : emptyMember());
    setMemberDialog(true);
  }
  function openInterview(member: CommitteeMember) {
    setInterviewMember(member);
    setInterviewDate(today());
    setInterviewerName('');
    setAnswers({
      experience: '', integrity: '', community: '', conflict: '', availability: '',
      institutional_commitment: '', follow_through: '',
    });
    setAssessment('');
    setRecommendation('suitable');
    setInterviewDialog(true);
  }
  function openPledge(member: CommitteeMember) {
    const saved = pledgeByMember.get(member.id);
    setPledgeMember(member);
    setPledgeDate(saved?.affirmed_on ?? today());
    setPledgeWitnesses(saved?.witness_names.join(', ') ?? '');
    setPledgeConfirmed(Boolean(saved));
    setPledgeDialog(true);
  }
  function openPerformanceReview(member: CommitteeHistoryRow | CommitteeMember, committee: Committee) {
    setPerformanceMember(member);
    setPerformanceCommittee(committee);
    setPerformanceForm({
      period_starts_on: committee.term_starts_on,
      period_ends_on: committee.term_ends_on < today() ? committee.term_ends_on : today(),
      rating: 'good', completed_tasks: '', pending_tasks: '', achievements: '',
      improvement_notes: '', reviewer_name: '', reviewed_on: today(),
    });
    setPerformanceDialog(true);
  }
  function printPledge() {
    if (!pledgeMember || !selectedCommittee) return;
    const saved = pledgeByMember.get(pledgeMember.id);
    const pledgeText = saved?.pledge_text ?? buildPledgeText(pledgeMember, selectedCommittee);
    const popup = window.open('', '_blank');
    if (!popup) {
      setErrorText(t('pledgePopupBlocked'));
      return;
    }
    const paragraphs = pledgeText.split('\n\n').map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
    const witnesses = (saved?.witness_names ?? panelMembers(pledgeWitnesses))
      .map((name) => `<li>${escapeHtml(name)}</li>`).join('');
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ur"><head><meta charset="utf-8"><title>${escapeHtml(t('committeePledge'))}</title>
      <style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:24px;color:#17221e;line-height:1.9}
      h1{text-align:center}p{white-space:pre-wrap}.signatures{display:flex;justify-content:space-between;gap:40px;margin-top:72px}
      .line{border-top:1px solid #444;padding-top:8px;min-width:220px}.witnesses{margin-top:32px}
      @media print{body{margin:0 auto;padding:12px}}</style></head><body dir="rtl">
      <h1>${escapeHtml(t('committeePledge'))}</h1>${paragraphs}
      <p>${escapeHtml(t('pledgeAffirmedOn'))}: ${escapeHtml(saved?.affirmed_on ?? pledgeDate)}</p>
      <div class="signatures"><div class="line">${escapeHtml(t('pledgeMemberSignature'))}<br>${escapeHtml(pledgeMember.full_name)}</div>
      <div class="line">${escapeHtml(t('pledgeSupervisorSignature'))}</div></div>
      <div class="witnesses"><strong>${escapeHtml(t('pledgeWitnesses'))}</strong><ul>${witnesses}</ul>
      <div class="line">${escapeHtml(t('pledgeWitnessSignature'))}</div></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }
  function submit(event: FormEvent<HTMLFormElement>, action: () => void) {
    event.preventDefault();
    setErrorText('');
    action();
  }

  if (!canManage) return <Alert severity="info">{t('noPermission')}</Alert>;

  return <Stack spacing={2.5}>
    <PageHeading title={t('mosqueCommittees')} description={t('mosqueCommitteesDescription')}
      action={<Button variant="contained" startIcon={<AddRounded />} onClick={openNewCommittee} disabled={!mosques.length}>{t('createCommittee')}</Button>} />
    <Alert severity="info">{t('committeeAuthorityNotice')}</Alert>
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="h6" fontWeight={750}>{t('committeeHistorySearch')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('committeeHistorySearchHelp')}</Typography>
        </Box>
        <Box component="form" onSubmit={(event) => {
          event.preventDefault();
          setHistorySearch(historySearchInput.trim());
        }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField fullWidth label={t('searchNamePhoneCnic')} value={historySearchInput}
              onChange={(event) => setHistorySearchInput(event.target.value)} />
            <Button type="submit" variant="contained" disabled={historySearchInput.trim().length < 3 || historyQuery.isFetching}>
              {t('searchCommitteeHistory')}
            </Button>
          </Stack>
        </Box>
        {historyQuery.error && <Alert severity="error">{historyQuery.error.message}</Alert>}
        {historyQuery.isFetching && <CircularProgress size={24} />}
        {historySearch && !historyQuery.isFetching && historyRows.length === 0 && <Alert severity="info">{t('noCommitteeHistoryMatches')}</Alert>}
        {historyRows.map((row) => {
          const memberReviews = (performanceQuery.data ?? []).filter((review) => review.member_id === row.member_id);
          const committee = committees.find((item) => item.id === row.committee_id);
          return <Card variant="outlined" key={row.member_id} sx={{ borderRadius: 2 }}>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                  <Box>
                    <Typography fontWeight={700}>{row.full_name} · {maskCnic(row.cnic_last_digit)}</Typography>
                    <Typography variant="body2">{row.phone} · {row.mosque_name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {row.committee_title} · {row.term_starts_on} — {row.term_ends_on} · {t(`committeeStatus_${row.committee_status}`)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t(`committeePosition_${row.member_position}`)} · {t(`committeeDepartment_${row.department}`)} · {t(`committeeMemberStatus_${row.member_status}`)}
                    </Typography>
                  </Box>
                  {committee && row.committee_status !== 'draft' && row.member_status !== 'candidate' && <Button size="small" startIcon={<AddRounded />}
                    onClick={() => openPerformanceReview(row, committee)}>{t('addPerformanceReview')}</Button>}
                </Stack>
                {performanceQuery.isFetching && <CircularProgress size={20} />}
                {memberReviews.map((review) => <Paper key={review.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={0.5}>
                    <Typography fontWeight={650}>{t(`performanceRating_${review.rating}`)} · {review.period_starts_on} — {review.period_ends_on}</Typography>
                    <Typography variant="body2">{t('completedTasks')}: {review.completed_tasks}</Typography>
                    {review.pending_tasks && <Typography variant="body2">{t('pendingTasks')}: {review.pending_tasks}</Typography>}
                    {review.achievements && <Typography variant="body2">{t('achievements')}: {review.achievements}</Typography>}
                    {review.improvement_notes && <Typography variant="body2">{t('improvementNotes')}: {review.improvement_notes}</Typography>}
                    <Typography variant="caption" color="text.secondary">{t('reviewedBy')}: {review.reviewer_name} · {review.reviewed_on}</Typography>
                  </Stack>
                </Paper>)}
              </Stack>
            </CardContent>
          </Card>;
        })}
      </Stack>
    </Paper>
    {errorText && <Alert severity="error" onClose={() => setErrorText('')}>{errorText}</Alert>}
    {(mosquesQuery.error || committeesQuery.error || membersQuery.error || interviewsQuery.error || pledgesQuery.error || performanceQuery.error) &&
      <Alert severity="error">{(mosquesQuery.error ?? committeesQuery.error ?? membersQuery.error ?? interviewsQuery.error ?? pledgesQuery.error ?? performanceQuery.error as Error).message}</Alert>}
    {mosquesQuery.isLoading || committeesQuery.isLoading
      ? <Box display="grid" sx={{ placeItems: 'center', py: 6 }}><CircularProgress /></Box>
      : <Stack spacing={2}>
        {!committees.length && <Alert severity="info">{t('noCommittees')}</Alert>}
        {committees.map((committee) => <Card key={committee.id} variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between">
              <Box>
                <Typography variant="h6" fontWeight={750}>{committee.title}</Typography>
                <Typography color="text.secondary">{mosqueName(committee.mosque_id)}</Typography>
                <Typography variant="body2" color="text.secondary">{committee.term_starts_on} — {committee.term_ends_on}</Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" color={committee.status === 'active' ? 'success' : committee.status === 'draft' ? 'warning' : 'default'} label={t(`committeeStatus_${committee.status}`)} />
                <Button variant={selectedId === committee.id ? 'contained' : 'outlined'} startIcon={<GroupsRounded />} onClick={() => setSelectedId(committee.id)}>{t('manageRoster')}</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>)}
      </Stack>}

    {selectedCommittee && <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Stack p={2} direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between">
        <Box>
          <Typography variant="h6" fontWeight={750}>{t('committeeRoster')}: {selectedCommittee.title}</Typography>
          <Typography variant="body2" color="text.secondary">{mosqueName(selectedCommittee.mosque_id)}</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {selectedCommittee.status === 'draft' && <>
            <Button startIcon={<PersonAddAltRounded />} onClick={() => openMember()}>{t('addCommitteeMember')}</Button>
            <Button variant="contained" startIcon={<CheckCircleOutlineRounded />}
              disabled={setCommitteeStatus.isPending || membersQuery.isLoading || interviewsQuery.isLoading || !canActivate}
              onClick={() => setCommitteeStatus.mutate('active')}>{t('activateCommittee')}</Button>
          </>}
          {selectedCommittee.status === 'active' && <>
            <Button startIcon={<AutorenewRounded />} onClick={() => {
              const nextDay = new Date(`${selectedCommittee.term_ends_on}T12:00:00`);
              nextDay.setDate(nextDay.getDate() + 1);
              const start = nextDay.toISOString().slice(0, 10) > today() ? nextDay.toISOString().slice(0, 10) : today();
              setTermStart(start);
              setTermEnd(addYear(start));
              setRenewDialog(true);
            }}>{t('renewCommittee')}</Button>
            <Button color="warning" onClick={() => setCommitteeStatus.mutate('expired')}>{t('endCommitteeTerm')}</Button>
          </>}
        </Stack>
      </Stack>
      {selectedCommittee.status === 'draft' && <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
        <Stack spacing={0.75}>
          <Typography variant="body2">{t('committeeDraftInstructions')}</Typography>
          <Typography variant="body2">{t('committeeActivationRule').replace('{count}', String(activeMembers.length))}</Typography>
        </Stack>
      </Alert>}
      {membersQuery.isLoading || interviewsQuery.isLoading || pledgesQuery.isLoading
        ? <Box display="grid" sx={{ placeItems: 'center', py: 5 }}><CircularProgress /></Box>
        : !members.length
          ? <Alert severity="info" sx={{ m: 2 }}>{t('committeeNoMembersYet')}</Alert>
          : <TableContainer sx={{ overflowX: 'auto' }}><Table size="small">
          <TableHead><TableRow>{[
            t('name'), t('phone'), t('cnic'), t('address'), t('committeePosition'), t('committeeDepartment'),
            t('authorityLevel'), t('status'), t('interview'), t('actions'),
          ].map((label) => <TableCell key={label} sx={{ fontWeight: 750, whiteSpace: 'nowrap' }}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{members.map((member) => {
            const interview = interviewByMember.get(member.id);
            return <TableRow key={member.id} hover>
              <TableCell>{member.full_name}{member.email && <Typography variant="caption" display="block" color="text.secondary">{member.email}</Typography>}</TableCell>
              <TableCell>{member.phone}</TableCell><TableCell>{maskCnic(member.cnic_number)}</TableCell><TableCell>{member.address}</TableCell>
              <TableCell>{t(`committeePosition_${member.member_position}`)}</TableCell>
              <TableCell>{t(`committeeDepartment_${member.department}`)}</TableCell>
              <TableCell>{t(`committeeAuthority_${member.authority_level}`)}</TableCell>
              <TableCell>{t(`committeeMemberStatus_${member.status}`)}</TableCell>
              <TableCell>{interview ? `${interview.interview_date} · ${t(`interviewRecommendation_${interview.recommendation}`)}` : t('interviewNotDone')}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{selectedCommittee.status === 'draft' && <>
                <Button size="small" startIcon={<EditOutlined />} onClick={() => openMember(member)}>{t('edit')}</Button>
                <Button size="small" startIcon={<HowToRegRounded />} onClick={() => openInterview(member)}>{t('recordInterview')}</Button>
              </>}
                {selectedCommittee.status === 'active' && member.status === 'active' && <Button size="small"
                  startIcon={pledgeByMember.has(member.id) ? <VerifiedRounded /> : <EditOutlined />}
                  disabled={pledgesQuery.isLoading} onClick={() => openPledge(member)}>
                  {pledgeByMember.has(member.id) ? t('viewCommitteePledge') : t('prepareCommitteePledge')}
                </Button>}
                {selectedCommittee.status !== 'draft' && member.status !== 'candidate' && <Button size="small" startIcon={<AddRounded />}
                  onClick={() => openPerformanceReview(member, selectedCommittee)}>{t('addPerformanceReview')}</Button>}
              </TableCell>
            </TableRow>;
          })}</TableBody>
        </Table></TableContainer>}
    </Paper>}

    <Dialog open={committeeDialog} onClose={() => setCommitteeDialog(false)} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={(event) => submit(event, () => saveCommittee.mutate())}>
        <DialogTitle>{t('createCommittee')}</DialogTitle>
        <DialogContent dividers><Stack spacing={2} pt={0.5}>
          <TextField required select label={t('responsibleMosque')} value={mosqueId} onChange={(event) => setMosqueId(event.target.value)}>
            {mosques.map((mosque) => <MenuItem key={mosque.id} value={mosque.id}>{mosqueName(mosque.id)}</MenuItem>)}
          </TextField>
          <TextField required label={t('committeeTitle')} value={title} onChange={(event) => setTitle(event.target.value)} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField required type="date" label={t('termStartsOn')} value={termStart} onChange={(event) => setTermStart(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
            <TextField required type="date" label={t('termEndsOn')} value={termEnd} onChange={(event) => setTermEnd(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
          </Stack>
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setCommitteeDialog(false)}>{t('cancel')}</Button><Button type="submit" variant="contained" disabled={saveCommittee.isPending}>{t('saveDraft')}</Button></DialogActions>
      </Box>
    </Dialog>

    <Dialog open={memberDialog} onClose={() => setMemberDialog(false)} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={(event) => submit(event, () => saveMember.mutate())}>
        <DialogTitle>{editingMember ? t('editCommitteeMember') : t('addCommitteeMember')}</DialogTitle>
        <DialogContent dividers><Stack spacing={2} pt={0.5}>
          <TextField required label={t('name')} value={memberForm.full_name} onChange={(event) => setMemberForm((form) => ({ ...form, full_name: event.target.value }))} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField required type="tel" label={t('phone')} value={memberForm.phone} onChange={(event) => setMemberForm((form) => ({ ...form, phone: event.target.value }))} fullWidth />
            <TextField type="email" label={t('emailAddress')} value={memberForm.email} onChange={(event) => setMemberForm((form) => ({ ...form, email: event.target.value }))} fullWidth />
          </Stack>
          <TextField label={t('cnic')} placeholder="00000-0000000-0" value={memberForm.cnic_number}
            slotProps={{ htmlInput: { maxLength: 15 } }}
            helperText={t('committeeCnicHelp')}
            onChange={(event) => setMemberForm((form) => ({ ...form, cnic_number: event.target.value }))} />
          <TextField required multiline minRows={2} label={t('address')} value={memberForm.address} onChange={(event) => setMemberForm((form) => ({ ...form, address: event.target.value }))} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select label={t('committeePosition')} value={memberForm.member_position} onChange={(event) => setMemberForm((form) => ({ ...form, member_position: event.target.value as 'supervisor' | 'member' }))} fullWidth>
              {(['supervisor', 'member'] as const).map((value) => <MenuItem key={value} value={value}>{t(`committeePosition_${value}`)}</MenuItem>)}
            </TextField>
            <TextField select label={t('committeeDepartment')} value={memberForm.department} onChange={(event) => setMemberForm((form) => ({ ...form, department: event.target.value as Department }))} fullWidth>
              {departments.map((value) => <MenuItem key={value} value={value}>{t(`committeeDepartment_${value}`)}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select label={t('authorityLevel')} value={memberForm.authority_level} onChange={(event) => setMemberForm((form) => ({ ...form, authority_level: event.target.value as Authority }))} fullWidth>
              {authorities.map((value) => <MenuItem key={value} value={value}>{t(`committeeAuthority_${value}`)}</MenuItem>)}
            </TextField>
            <TextField select label={t('status')} value={memberForm.status} onChange={(event) => setMemberForm((form) => ({ ...form, status: event.target.value as MemberStatus }))} fullWidth>
              {(['candidate', 'active', 'removed'] as const).map((value) => <MenuItem key={value} value={value}>{t(`committeeMemberStatus_${value}`)}</MenuItem>)}
            </TextField>
          </Stack>
          {memberForm.status === 'active' && <Alert severity="info">{t('committeeInterviewBeforeAppointment')}</Alert>}
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setMemberDialog(false)}>{t('cancel')}</Button><Button type="submit" variant="contained" disabled={saveMember.isPending}>{t('save')}</Button></DialogActions>
      </Box>
    </Dialog>

    <Dialog open={interviewDialog} onClose={() => setInterviewDialog(false)} fullWidth maxWidth="md">
      <Box component="form" onSubmit={(event) => submit(event, () => saveInterview.mutate())}>
        <DialogTitle>{t('interviewFor')}: {interviewMember?.full_name}</DialogTitle>
        <DialogContent dividers><Stack spacing={2} pt={0.5}>
          <Alert severity="info">{t('interviewProcedure')}</Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField required type="date" label={t('interviewDate')} value={interviewDate} onChange={(event) => setInterviewDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
            <TextField required multiline minRows={2} label={t('interviewPanelMembers')} helperText={t('interviewPanelMembersHint')}
              value={interviewerName} onChange={(event) => setInterviewerName(event.target.value)} fullWidth />
          </Stack>
          <Typography variant="subtitle2" fontWeight={700}>{t('expectedInterviewQuestions')}</Typography>
          {questions.map((question) => <TextField key={question} required multiline minRows={2}
            label={t(`interviewQuestion_${question}`)} value={answers[question]}
            onChange={(event) => setAnswers((current) => ({ ...current, [question]: event.target.value }))} />)}
          <TextField required multiline minRows={3} label={t('interviewAssessment')} value={assessment} onChange={(event) => setAssessment(event.target.value)} />
          <TextField select label={t('interviewRecommendation')} value={recommendation} onChange={(event) => setRecommendation(event.target.value as Recommendation)}>
            {(['suitable', 'conditional', 'not_suitable'] as const).map((value) => <MenuItem key={value} value={value}>{t(`interviewRecommendation_${value}`)}</MenuItem>)}
          </TextField>
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setInterviewDialog(false)}>{t('cancel')}</Button><Button type="submit" variant="contained" disabled={saveInterview.isPending}>{t('saveInterview')}</Button></DialogActions>
      </Box>
    </Dialog>

    <Dialog open={renewDialog} onClose={() => setRenewDialog(false)} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={(event) => submit(event, () => renewCommittee.mutate())}>
        <DialogTitle>{t('renewCommittee')}</DialogTitle>
        <DialogContent dividers><Stack spacing={2} pt={0.5}>
          <Alert severity="warning">{t('renewCommitteeNotice')}</Alert>
          <TextField required type="date" label={t('termStartsOn')} value={termStart} onChange={(event) => setTermStart(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField required type="date" label={t('termEndsOn')} value={termEnd} onChange={(event) => setTermEnd(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setRenewDialog(false)}>{t('cancel')}</Button><Button type="submit" variant="contained" disabled={renewCommittee.isPending}>{t('createRenewalDraft')}</Button></DialogActions>
      </Box>
    </Dialog>

    <Dialog open={pledgeDialog} onClose={() => setPledgeDialog(false)} fullWidth maxWidth="md">
      <DialogTitle>{t('committeePledge')}{pledgeMember ? ` · ${pledgeMember.full_name}` : ''}</DialogTitle>
      <DialogContent dividers><Stack spacing={2} pt={0.5}>
        <Alert severity="info">{t('committeePledgeNotice')}</Alert>
        {pledgeMember && selectedCommittee && <Paper variant="outlined" sx={{
          p: 2.5, maxHeight: { xs: 360, md: 480 }, overflow: 'auto', whiteSpace: 'pre-line', lineHeight: 2,
        }}>
          {savedPledge?.pledge_text ?? buildPledgeText(pledgeMember, selectedCommittee)}
        </Paper>}
        {savedPledge
          ? <Alert severity="success">{t('committeePledgeRecorded')} · {savedPledge.affirmed_on}</Alert>
          : <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField required type="date" label={t('pledgeAffirmedOn')} value={pledgeDate}
                onChange={(event) => setPledgeDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
              <TextField required multiline minRows={2} label={t('pledgeWitnesses')} helperText={t('pledgeWitnessesHint')}
                value={pledgeWitnesses} onChange={(event) => setPledgeWitnesses(event.target.value)} fullWidth />
            </Stack>
            <FormControlLabel control={<Checkbox checked={pledgeConfirmed}
              onChange={(event) => setPledgeConfirmed(event.target.checked)} />}
              label={t('pledgeVoluntaryConfirmation')} />
          </>}
      </Stack></DialogContent>
      <DialogActions>
        <Button onClick={() => setPledgeDialog(false)}>{t('cancel')}</Button>
        <Button startIcon={<PrintRounded />} onClick={printPledge}>{t('printCommitteePledge')}</Button>
        {!savedPledge && <Button variant="contained" disabled={savePledge.isPending || !pledgeConfirmed}
          onClick={() => savePledge.mutate()}>{t('recordCommitteePledge')}</Button>}
      </DialogActions>
    </Dialog>

    <Dialog open={performanceDialog} onClose={() => setPerformanceDialog(false)} fullWidth maxWidth="md">
      <Box component="form" onSubmit={(event) => submit(event, () => savePerformance.mutate())}>
        <DialogTitle>{t('addPerformanceReview')}{performanceMember ? ` · ${performanceMember.full_name}` : ''}</DialogTitle>
        <DialogContent dividers><Stack spacing={2} pt={0.5}>
          <Alert severity="info">{t('performanceReviewNotice')}</Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField required type="date" label={t('reviewPeriodStart')} value={performanceForm.period_starts_on}
              onChange={(event) => setPerformanceForm((form) => ({ ...form, period_starts_on: event.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }} fullWidth />
            <TextField required type="date" label={t('reviewPeriodEnd')} value={performanceForm.period_ends_on}
              onChange={(event) => setPerformanceForm((form) => ({ ...form, period_ends_on: event.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select required label={t('performanceRating')} value={performanceForm.rating}
              onChange={(event) => setPerformanceForm((form) => ({ ...form, rating: event.target.value as PerformanceRating }))} fullWidth>
              {(['excellent', 'good', 'needs_improvement', 'unsatisfactory'] as const).map((rating) =>
                <MenuItem key={rating} value={rating}>{t(`performanceRating_${rating}`)}</MenuItem>)}
            </TextField>
            <TextField required type="date" label={t('reviewedOn')} value={performanceForm.reviewed_on}
              onChange={(event) => setPerformanceForm((form) => ({ ...form, reviewed_on: event.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }} fullWidth />
          </Stack>
          <TextField required multiline minRows={3} label={t('completedTasks')} value={performanceForm.completed_tasks}
            slotProps={{ htmlInput: { maxLength: 3000 } }}
            onChange={(event) => setPerformanceForm((form) => ({ ...form, completed_tasks: event.target.value }))} />
          <TextField multiline minRows={2} label={t('pendingTasks')} value={performanceForm.pending_tasks}
            slotProps={{ htmlInput: { maxLength: 3000 } }}
            onChange={(event) => setPerformanceForm((form) => ({ ...form, pending_tasks: event.target.value }))} />
          <TextField multiline minRows={2} label={t('achievements')} value={performanceForm.achievements}
            slotProps={{ htmlInput: { maxLength: 3000 } }}
            onChange={(event) => setPerformanceForm((form) => ({ ...form, achievements: event.target.value }))} />
          <TextField multiline minRows={2} label={t('improvementNotes')} value={performanceForm.improvement_notes}
            slotProps={{ htmlInput: { maxLength: 3000 } }}
            onChange={(event) => setPerformanceForm((form) => ({ ...form, improvement_notes: event.target.value }))} />
          <TextField required label={t('reviewedBy')} value={performanceForm.reviewer_name}
            slotProps={{ htmlInput: { maxLength: 160 } }}
            onChange={(event) => setPerformanceForm((form) => ({ ...form, reviewer_name: event.target.value }))} />
        </Stack></DialogContent>
        <DialogActions>
          <Button onClick={() => setPerformanceDialog(false)}>{t('cancel')}</Button>
          <Button type="submit" variant="contained" disabled={savePerformance.isPending}>{t('savePerformanceReview')}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  </Stack>;
}
