import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AddRounded, DeleteOutlineRounded, EditOutlined, MosqueRounded } from '@mui/icons-material';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, Paper, Stack, Tab, Tabs, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import PageHeading from '../../components/PageHeading';
import { useI18n } from '../../i18n';
import {
  isLocalDemoEnabled, localDemoImportAdministrativeAreas, localDemoList, localDemoRemove, localDemoSave,
} from '../../services/localDemo';
import { requireSupabaseConfig, supabase } from '../../lib/supabase';
import type { DbRow } from '../../types';
import { csvRecords } from '../../utils/csv';

type AreaType = 'country' | 'province' | 'division' | 'district' | 'tehsil' | 'town' | 'union_council';
type Area = DbRow & { id: string; parent_id: string | null; area_type: AreaType; name_en: string; name_ur: string | null; seeded: boolean };
type StaffMember = DbRow & { id: string; full_name: string; job_title: string; staff_type: string; status: string; mosque_id?: string };
type FacilityKey = 'prayer_halls' | 'wudu_areas' | 'washrooms' | 'cameras' | 'residential_rooms' | 'classrooms' | 'offices' | 'parking' | 'other';
type FacilityDetail = { count: number; condition: string; note: string };
type Facilities = Record<FacilityKey, FacilityDetail>;
type Mosque = DbRow & {
  id: string; name: string; registration_number: string | null; administrative_area_id: string; imam_staff_id: string | null;
  facilities: Partial<Facilities>; status: string;
};

const areaTypes: AreaType[] = ['country', 'province', 'division', 'district', 'tehsil', 'town', 'union_council'];
const parentTypes: Record<AreaType, AreaType[]> = {
  country: [],
  province: ['country'],
  division: ['province'],
  district: ['division'],
  tehsil: ['district'],
  town: ['tehsil'],
  union_council: ['tehsil', 'town'],
};
const facilityTypes: FacilityKey[] = [
  'prayer_halls', 'wudu_areas', 'washrooms', 'cameras', 'residential_rooms',
  'classrooms', 'offices', 'parking', 'other',
];
const facilityConditionValues = ['available', 'needs_repair', 'not_operational', 'not_available'];
const emptyFacilities = (): Facilities => Object.fromEntries(facilityTypes.map((key) => [
  key, { count: 0, condition: 'not_available', note: '' },
])) as Facilities;
const emptyMosque = () => ({
  name: '', registration_number: '', administrative_area_id: '', imam_staff_id: '', address: '', registered_on: '',
  registration_authority: '', land_area: '', land_area_unit: 'kanal',
  built_up_area: '', built_up_area_unit: 'sqft', contact_name: '', contact_phone: '',
  status: 'active', notes: '', facilities: emptyFacilities(),
});
const levelSort = (type: AreaType) => areaTypes.indexOf(type);

function demoRows(table: string): DbRow[] {
  return localDemoList(table, {
    page: 0, pageSize: 10000, search: '', sortBy: table === 'administrative_areas' ? 'name_en' : 'name',
    sortDirection: 'asc', searchFields: [],
  }).rows;
}

function areaName(area: Area, locale: 'ur' | 'en'): string {
  return locale === 'ur' ? String(area.name_ur || area.name_en) : area.name_en;
}

function makeAreaPath(id: string, areas: Area[], locale: 'ur' | 'en', t: (key: string) => string): string {
  const index = new Map(areas.map((area) => [area.id, area]));
  const path: string[] = [];
  let current = index.get(id);
  while (current) {
    path.unshift(areaName(current, locale));
    current = current.parent_id ? index.get(current.parent_id) : undefined;
  }
  return path.join(' / ') || t('unknownArea');
}

function facilityCount(facilities: Partial<Facilities> | null | undefined): number {
  return facilityTypes.reduce((sum, key) => sum + Number(facilities?.[key]?.count ?? 0), 0);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

function parseAdministrativeAreaCsv(text: string): DbRow[] {
  const rows = csvRecords(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('CSV needs a header row and at least one administrative area.');
  if (rows.length > 20001) throw new Error('Import up to 20,000 area rows at a time.');
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[\s-]+/g, '_'));
  const column = (key: string) => headers.indexOf(key);
  const levelColumn = column('level');
  const nameColumn = column('name_en');
  if (levelColumn < 0 || nameColumn < 0) throw new Error('CSV must include level and name_en columns.');
  return rows.slice(1).map((cells, index) => {
    const value = (key: string) => {
      const position = column(key);
      return position < 0 ? '' : (cells[position] ?? '').trim();
    };
    const level = value('level').toLowerCase();
    if (!areaTypes.includes(level as AreaType)) throw new Error(`CSV row ${index + 2}: unsupported area level "${level}".`);
    if (!value('name_en')) throw new Error(`CSV row ${index + 2}: English name is required.`);
    return {
      level,
      name_en: value('name_en'),
      name_ur: value('name_ur'),
      parent_level: value('parent_level').toLowerCase(),
      parent_path: value('parent_path'),
      code: value('code'),
      source_note: value('source_note'),
      line_number: index + 2,
    };
  });
}

export default function MosqueRegistryPage() {
  const { t, locale } = useI18n();
  const { role } = useAuth();
  const cache = useQueryClient();
  const demo = isLocalDemoEnabled();
  const canManage = role === 'admin' || role === 'mosque_manager';
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [importedAreaCount, setImportedAreaCount] = useState<number | null>(null);
  const areaFileRef = useRef<HTMLInputElement>(null);
  const [mosqueDialog, setMosqueDialog] = useState(false);
  const [editingMosque, setEditingMosque] = useState<Mosque | null>(null);
  const [mosqueForm, setMosqueForm] = useState(emptyMosque);
  const [areaDialog, setAreaDialog] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [areaType, setAreaType] = useState<AreaType>('province');
  const [areaParent, setAreaParent] = useState('');
  const [areaNameEn, setAreaNameEn] = useState('');
  const [areaNameUr, setAreaNameUr] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [areaSourceNote, setAreaSourceNote] = useState('');

  const areasQuery = useQuery<Area[]>({
    queryKey: ['administrative-areas'],
    queryFn: async () => {
      if (demo) return demoRows('administrative_areas') as Area[];
      requireSupabaseConfig();
      const { data, error } = await supabase.from('administrative_areas').select('*')
        .order('area_type').order('name_en').limit(10000).returns<Area[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const imamsQuery = useQuery<StaffMember[]>({
    queryKey: ['mosque-imams'],
    queryFn: async () => {
      if (demo) return (demoRows('staff_members') as StaffMember[])
        .filter((member) => member.staff_type === 'imam');
      requireSupabaseConfig();
      const { data, error } = await supabase.from('staff_members')
        .select('id, full_name, job_title, staff_type, status, mosque_id')
        .eq('staff_type', 'imam')
        .order('full_name').limit(1000).returns<StaffMember[]>();
      if (error?.message.includes('column staff_members.mosque_id does not exist')) {
        const { data: legacyData, error: legacyError } = await supabase.from('staff_members')
          .select('id, full_name, job_title, staff_type, status')
          .eq('staff_type', 'imam')
          .order('full_name').limit(1000).returns<StaffMember[]>();
        if (legacyError) throw legacyError;
        return legacyData ?? [];
      }
      if (error) throw error;
      return data ?? [];
    },
  });
  const mosquesQuery = useQuery<Mosque[]>({
    queryKey: ['mosque-registrations'],
    queryFn: async () => {
      if (demo) return demoRows('mosque_registrations') as Mosque[];
      requireSupabaseConfig();
      const { data, error } = await supabase.from('mosque_registrations').select('*')
        .order('name').limit(5000).returns<Mosque[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  const areas = areasQuery.data ?? [];
  const imams = imamsQuery.data ?? [];
  const availableImams = editingMosque
    ? imams.filter((imam) => (!imam.mosque_id || imam.mosque_id === editingMosque.id)
      && (imam.status === 'active' || imam.id === mosqueForm.imam_staff_id))
    : [];
  const imamById = useMemo(() => new Map(imams.map((imam) => [imam.id, imam])), [imams]);
  const matchingMosques = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (mosquesQuery.data ?? []).filter((mosque) => !term
      || [mosque.name, mosque.registration_number, mosque.address, imamById.get(mosque.imam_staff_id ?? '')?.full_name]
        .some((value) => String(value ?? '').toLocaleLowerCase().includes(term)));
  }, [imamById, mosquesQuery.data, search]);

  const saveMosque = useMutation({
    mutationFn: async () => {
      if (!mosqueForm.name.trim() || !mosqueForm.administrative_area_id) {
        throw new Error(t('mosqueNameAndAreaRequired'));
      }
      const selectedImam = availableImams.find((imam) => imam.id === mosqueForm.imam_staff_id);
      if (mosqueForm.imam_staff_id && (!selectedImam
        || (selectedImam.mosque_id !== undefined && selectedImam.mosque_id !== editingMosque?.id)
        || (selectedImam.status !== 'active' && selectedImam.id !== editingMosque?.imam_staff_id))) {
        throw new Error(t('assignedImamMustBelong'));
      }
      const payload = {
        name: mosqueForm.name.trim(),
        registration_number: mosqueForm.registration_number.trim() || null,
        administrative_area_id: mosqueForm.administrative_area_id,
        imam_staff_id: mosqueForm.imam_staff_id || null,
        address: mosqueForm.address.trim() || null,
        registered_on: mosqueForm.registered_on || null,
        registration_authority: mosqueForm.registration_authority.trim() || null,
        land_area: mosqueForm.land_area === '' ? null : Number(mosqueForm.land_area),
        land_area_unit: mosqueForm.land_area === '' ? null : mosqueForm.land_area_unit,
        built_up_area: mosqueForm.built_up_area === '' ? null : Number(mosqueForm.built_up_area),
        built_up_area_unit: mosqueForm.built_up_area === '' ? null : mosqueForm.built_up_area_unit,
        contact_name: mosqueForm.contact_name.trim() || null,
        contact_phone: mosqueForm.contact_phone.trim() || null,
        status: mosqueForm.status,
        notes: mosqueForm.notes.trim() || null,
        facilities: mosqueForm.facilities,
      };
      for (const [label, value] of [['landArea', payload.land_area], ['builtUpArea', payload.built_up_area]] as const) {
        if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`${t(label)}: ${t('enterValidNumber')}`);
      }
      if (demo) {
        localDemoSave('mosque_registrations', 'id', editingMosque?.id ?? null, payload);
        return;
      }
      requireSupabaseConfig();
      const result = editingMosque
        ? await supabase.from('mosque_registrations').update(payload).eq('id', editingMosque.id)
        : await supabase.from('mosque_registrations').insert(payload);
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      setMosqueDialog(false);
      setEditingMosque(null);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['mosque-registrations'] }),
        cache.invalidateQueries({ queryKey: ['mosque-options'] }),
      ]);
    },
  });
  const deleteMosque = useMutation({
    mutationFn: async (id: string) => {
      if (demo) return localDemoRemove('mosque_registrations', 'id', id);
      requireSupabaseConfig();
      const { error } = await supabase.from('mosque_registrations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['mosque-registrations'] }),
        cache.invalidateQueries({ queryKey: ['mosque-options'] }),
      ]);
    },
  });
  const saveArea = useMutation({
    mutationFn: async () => {
      if (!areaNameEn.trim() || (areaType !== 'country' && !areaParent)) {
        throw new Error(t('areaNameAndParentRequired'));
      }
      const payload = {
        area_type: areaType, parent_id: areaType === 'country' ? null : areaParent,
        name_en: areaNameEn.trim(), name_ur: areaNameUr.trim() || null,
        code: areaCode.trim() || null, source_note: areaSourceNote.trim() || null,
      };
      if (demo) {
        localDemoSave('administrative_areas', 'id', editingArea?.id ?? null, { ...payload, seeded: false });
        return;
      }
      requireSupabaseConfig();
      const result = editingArea
        ? await supabase.from('administrative_areas').update(payload).eq('id', editingArea.id)
        : await supabase.from('administrative_areas').insert(payload);
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      setAreaDialog(false);
      setEditingArea(null);
      await cache.invalidateQueries({ queryKey: ['administrative-areas'] });
    },
  });
  const deleteArea = useMutation({
    mutationFn: async (id: string) => {
      if (demo) {
        const hasChildren = demoRows('administrative_areas').some((area) => area.parent_id === id);
        const hasMosques = demoRows('mosque_registrations').some((mosque) => mosque.administrative_area_id === id);
        if (hasChildren || hasMosques) throw new Error(t('areaHasDependencies'));
        return localDemoRemove('administrative_areas', 'id', id);
      }
      requireSupabaseConfig();
      const { error } = await supabase.from('administrative_areas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: ['administrative-areas'] }),
  });
  const importAreas = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 5 * 1024 * 1024) throw new Error('CSV file size must be 5 MB or less.');
      const rows = parseAdministrativeAreaCsv(await file.text());
      if (demo) return localDemoImportAdministrativeAreas(rows);
      requireSupabaseConfig();
      const { data, error } = await supabase.rpc('import_pakistan_admin_areas', { p_areas: rows });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: async (count) => {
      setImportedAreaCount(count);
      await cache.invalidateQueries({ queryKey: ['administrative-areas'] });
    },
  });

  function chooseAreaCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) importAreas.mutate(file);
    event.target.value = '';
  }

  function openMosque(mosque?: Mosque) {
    setEditingMosque(mosque ?? null);
    if (!mosque) {
      setMosqueForm(emptyMosque());
    } else {
      const defaults = emptyMosque();
      const savedFacilities = mosque.facilities ?? {};
      const facilities = Object.fromEntries(facilityTypes.map((key) => [
        key, { ...defaults.facilities[key], ...(savedFacilities[key] ?? {}) },
      ])) as Facilities;
      setMosqueForm({
        ...defaults,
        name: mosque.name,
        registration_number: String(mosque.registration_number ?? ''),
        administrative_area_id: mosque.administrative_area_id,
        imam_staff_id: String(mosque.imam_staff_id ?? ''),
        address: String(mosque.address ?? ''),
        registered_on: String(mosque.registered_on ?? ''),
        registration_authority: String(mosque.registration_authority ?? ''),
        land_area: mosque.land_area == null ? '' : String(mosque.land_area),
        land_area_unit: String(mosque.land_area_unit ?? 'kanal'),
        built_up_area: mosque.built_up_area == null ? '' : String(mosque.built_up_area),
        built_up_area_unit: String(mosque.built_up_area_unit ?? 'sqft'),
        contact_name: String(mosque.contact_name ?? ''),
        contact_phone: String(mosque.contact_phone ?? ''),
        status: mosque.status,
        notes: String(mosque.notes ?? ''),
        facilities,
      });
    }
    setMosqueDialog(true);
  }

  function openArea(area?: Area) {
    setEditingArea(area ?? null);
    setAreaType(area?.area_type ?? 'province');
    setAreaParent(String(area?.parent_id ?? ''));
    setAreaNameEn(area?.name_en ?? '');
    setAreaNameUr(String(area?.name_ur ?? ''));
    setAreaCode(String(area?.code ?? ''));
    setAreaSourceNote(String(area?.source_note ?? ''));
    setAreaDialog(true);
  }

  function submitMosque(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMosque.mutate();
  }

  function submitArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveArea.mutate();
  }

  if (!canManage) return <Alert severity="info">{t('noPermission')}</Alert>;

  return <Box className="page-enter">
    <PageHeading
      title={t('mosqueRegistry')}
      description={t('mosqueRegistryDescription')}
      action={tab === 0
        ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => openMosque()}>{t('registerMosque')}</Button>
        : <Stack direction="row" spacing={1}>
          <Button component="label" variant="outlined" disabled={importAreas.isPending}>
            {importAreas.isPending ? t('importing') : t('importAreasCsv')}
            <input ref={areaFileRef} hidden type="file" accept=".csv,text/csv" onChange={chooseAreaCsv} />
          </Button>
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => openArea()}>{t('addAdministrativeArea')}</Button>
        </Stack>}
    />
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <MosqueRounded color="primary" />
          <Typography variant="body2">{t('mosqueRegistryNotice')}</Typography>
        </Stack>
      </CardContent>
    </Card>
    {(areasQuery.error || imamsQuery.error || mosquesQuery.error || saveMosque.error || saveArea.error || deleteMosque.error || deleteArea.error || importAreas.error) &&
      <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(
        areasQuery.error ?? imamsQuery.error ?? mosquesQuery.error ?? saveMosque.error ?? saveArea.error ?? deleteMosque.error ?? deleteArea.error ?? importAreas.error,
      )}</Alert>}
    {importedAreaCount !== null && <Alert severity="success" sx={{ mb: 2 }}>{t('administrativeAreasImported').replace('{count}', importedAreaCount.toLocaleString())}</Alert>}
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" scrollButtons="auto">
        <Tab label={t('registeredMosques')} />
        <Tab label={t('administrativeAreas')} />
      </Tabs>
      {tab === 0 ? <Stack spacing={1.5} p={2}>
        <TextField size="small" label={t('search')} value={search} onChange={(event) => setSearch(event.target.value)} />
        {mosquesQuery.isLoading || areasQuery.isLoading || imamsQuery.isLoading
          ? <Box display="grid" sx={{ placeItems: 'center', p: 5 }}><CircularProgress /></Box>
          : matchingMosques.length === 0
            ? <Alert severity="info">{t('noMosquesRegistered')}</Alert>
            : <TableContainer sx={{ overflowX: 'auto' }}><Table size="small">
              <TableHead><TableRow>
                {[t('mosqueName'), t('registrationNumber'), t('administrativeArea'), t('imam'), t('landArea'), t('facilitySummary'), t('status'), ...(canManage ? [t('actions')] : [])]
                  .map((label) => <TableCell key={label} sx={{ fontWeight: 750, whiteSpace: 'nowrap' }}>{label}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>{matchingMosques.map((mosque) => <TableRow key={mosque.id} hover>
                <TableCell>{mosque.name}</TableCell>
                <TableCell>{mosque.registration_number || '—'}</TableCell>
                <TableCell>{makeAreaPath(mosque.administrative_area_id, areas, locale, t)}</TableCell>
                <TableCell>{imamById.get(mosque.imam_staff_id ?? '')?.full_name || '—'}</TableCell>
                <TableCell>{mosque.land_area == null ? '—' : `${mosque.land_area} ${t(String(mosque.land_area_unit ?? ''))}`}</TableCell>
                <TableCell>{facilityCount(mosque.facilities)} · {t('facilitySummary')}</TableCell>
                <TableCell>{t(`mosqueStatus_${mosque.status}`)}</TableCell>
                {canManage && <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton aria-label={t('edit')} onClick={() => openMosque(mosque)}><EditOutlined /></IconButton>
                  {isAdmin && <IconButton aria-label={t('delete')} onClick={() => {
                    if (window.confirm(t('confirmDelete'))) deleteMosque.mutate(mosque.id);
                  }}><DeleteOutlineRounded /></IconButton>}
                </TableCell>}
              </TableRow>)}</TableBody>
            </Table></TableContainer>}
      </Stack> : <Stack spacing={1.5} p={2}>
        <Alert severity="info">{t('administrativeAreasNotice')}</Alert>
        <Alert severity="info">{t('administrativeAreasCsvFormat')}</Alert>
        {areasQuery.isLoading ? <Box display="grid" sx={{ placeItems: 'center', p: 5 }}><CircularProgress /></Box>
          : <TableContainer sx={{ maxHeight: 620, overflowX: 'auto' }}><Table size="small" stickyHeader>
            <TableHead><TableRow>
              {[t('areaLevel'), t('areaName'), t('parentArea'), t('source'), t('actions')].map((label) => <TableCell key={label} sx={{ fontWeight: 750, whiteSpace: 'nowrap' }}>{label}</TableCell>)}
            </TableRow></TableHead>
            <TableBody>{areas.map((area) => <TableRow key={area.id} hover>
              <TableCell>{t(`areaLevel_${area.area_type}`)}</TableCell>
              <TableCell>{areaName(area, locale)}</TableCell>
              <TableCell>{area.parent_id ? makeAreaPath(area.parent_id, areas, locale, t) : '—'}</TableCell>
              <TableCell>{area.source_note ? String(area.source_note) : (area.seeded ? t('starterRecord') : t('customRecord'))}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <IconButton aria-label={t('edit')} onClick={() => openArea(area)}><EditOutlined /></IconButton>
                {isAdmin && !area.seeded && <IconButton aria-label={t('delete')} onClick={() => {
                  if (window.confirm(t('confirmDelete'))) deleteArea.mutate(area.id);
                }}><DeleteOutlineRounded /></IconButton>}
              </TableCell>
            </TableRow>)}</TableBody>
          </Table></TableContainer>}
      </Stack>}
    </Paper>

    <Dialog open={mosqueDialog} onClose={() => setMosqueDialog(false)} fullWidth maxWidth="md">
      <Box component="form" onSubmit={submitMosque}>
        <DialogTitle>{editingMosque ? t('editMosque') : t('registerMosque')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} pt={0.5}>
            {saveMosque.error && <Alert severity="error">{saveMosque.error.message}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField required fullWidth label={t('mosqueName')} value={mosqueForm.name} onChange={(event) => setMosqueForm((form) => ({ ...form, name: event.target.value }))} />
              <TextField fullWidth label={t('registrationNumber')} value={mosqueForm.registration_number} onChange={(event) => setMosqueForm((form) => ({ ...form, registration_number: event.target.value }))} />
            </Stack>
            <TextField required select label={t('administrativeArea')} value={mosqueForm.administrative_area_id}
              helperText={t('administrativeAreaHelp')}
              onChange={(event) => setMosqueForm((form) => ({ ...form, administrative_area_id: event.target.value }))}>
            {areas.filter((area) => !areas.some((candidate) => candidate.parent_id === area.id))
              .slice().sort((a, b) => levelSort(a.area_type) - levelSort(b.area_type) || areaName(a, locale).localeCompare(areaName(b, locale)))
                .map((area) => <MenuItem key={area.id} value={area.id}>{`${t(`areaLevel_${area.area_type}`)} · ${makeAreaPath(area.id, areas, locale, t)}`}</MenuItem>)}
            </TextField>
            <TextField select label={t('assignedImam')} value={mosqueForm.imam_staff_id}
              helperText={!availableImams.some((imam) => imam.status === 'active') ? t('addImamFirst') : undefined}
              onChange={(event) => setMosqueForm((form) => ({ ...form, imam_staff_id: event.target.value }))}>
              <MenuItem value="">{t('unassigned')}</MenuItem>
              {availableImams.map((imam) => <MenuItem key={imam.id} value={imam.id}>{imam.full_name}</MenuItem>)}
            </TextField>
            <TextField multiline minRows={2} label={t('address')} value={mosqueForm.address} onChange={(event) => setMosqueForm((form) => ({ ...form, address: event.target.value }))} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField fullWidth type="date" slotProps={{ inputLabel: { shrink: true } }} label={t('registeredOn')} value={mosqueForm.registered_on} onChange={(event) => setMosqueForm((form) => ({ ...form, registered_on: event.target.value }))} />
              <TextField fullWidth label={t('registrationAuthority')} value={mosqueForm.registration_authority} onChange={(event) => setMosqueForm((form) => ({ ...form, registration_authority: event.target.value }))} />
              <TextField fullWidth select label={t('status')} value={mosqueForm.status} onChange={(event) => setMosqueForm((form) => ({ ...form, status: event.target.value }))}>
                {['active', 'inactive', 'under_construction'].map((value) => <MenuItem key={value} value={value}>{t(`mosqueStatus_${value}`)}</MenuItem>)}
              </TextField>
            </Stack>
            <Typography fontWeight={750}>{t('areaMeasurements')}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField fullWidth type="number" label={t('landArea')} value={mosqueForm.land_area} onChange={(event) => setMosqueForm((form) => ({ ...form, land_area: event.target.value }))} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} />
              <TextField fullWidth select label={t('landAreaUnit')} value={mosqueForm.land_area_unit} onChange={(event) => setMosqueForm((form) => ({ ...form, land_area_unit: event.target.value }))}>
                {['sqft', 'sqm', 'marla', 'kanal', 'acre'].map((unit) => <MenuItem key={unit} value={unit}>{t(unit)}</MenuItem>)}
              </TextField>
              <TextField fullWidth type="number" label={t('builtUpArea')} value={mosqueForm.built_up_area} onChange={(event) => setMosqueForm((form) => ({ ...form, built_up_area: event.target.value }))} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} />
              <TextField fullWidth select label={t('builtUpAreaUnit')} value={mosqueForm.built_up_area_unit} onChange={(event) => setMosqueForm((form) => ({ ...form, built_up_area_unit: event.target.value }))}>
                {['sqft', 'sqm', 'marla', 'kanal', 'acre'].map((unit) => <MenuItem key={unit} value={unit}>{t(unit)}</MenuItem>)}
              </TextField>
            </Stack>
            <Typography fontWeight={750}>{t('mosqueFacilities')}</Typography>
            <Alert severity="info">{t('facilityCountConditionNote')}</Alert>
            {facilityTypes.map((key) => <Stack key={key} direction={{ xs: 'column', sm: 'row' }} spacing={1.2} alignItems={{ sm: 'center' }}>
              <Typography sx={{ width: { sm: 175 }, flexShrink: 0 }}>{t(`facility_${key}`)}</Typography>
              <TextField type="number" size="small" label={t('quantity')} value={mosqueForm.facilities[key].count}
                onChange={(event) => setMosqueForm((form) => ({ ...form, facilities: { ...form.facilities, [key]: { ...form.facilities[key], count: Number(event.target.value) } } }))}
                slotProps={{ htmlInput: { min: 0, step: 1 } }} sx={{ width: { sm: 120 } }} />
              <TextField select size="small" label={t('condition')} value={mosqueForm.facilities[key].condition}
                onChange={(event) => setMosqueForm((form) => ({ ...form, facilities: { ...form.facilities, [key]: { ...form.facilities[key], condition: event.target.value } } }))} sx={{ minWidth: { sm: 190 } }}>
                {facilityConditionValues.map((value) => <MenuItem key={value} value={value}>{t(`facilityCondition_${value}`)}</MenuItem>)}
              </TextField>
              <TextField fullWidth size="small" label={t('notes')} value={mosqueForm.facilities[key].note}
                onChange={(event) => setMosqueForm((form) => ({ ...form, facilities: { ...form.facilities, [key]: { ...form.facilities[key], note: event.target.value } } }))} />
            </Stack>)}
            <Typography fontWeight={750}>{t('contactInformation')}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField fullWidth label={t('contactName')} value={mosqueForm.contact_name} onChange={(event) => setMosqueForm((form) => ({ ...form, contact_name: event.target.value }))} />
              <TextField fullWidth label={t('phone')} value={mosqueForm.contact_phone} onChange={(event) => setMosqueForm((form) => ({ ...form, contact_phone: event.target.value }))} />
            </Stack>
            <TextField multiline minRows={2} label={t('notes')} value={mosqueForm.notes} onChange={(event) => setMosqueForm((form) => ({ ...form, notes: event.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setMosqueDialog(false)}>{t('cancel')}</Button><Button type="submit" variant="contained" disabled={saveMosque.isPending}>{saveMosque.isPending ? <CircularProgress size={18} /> : t('save')}</Button></DialogActions>
      </Box>
    </Dialog>

    <Dialog open={areaDialog} onClose={() => setAreaDialog(false)} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={submitArea}>
        <DialogTitle>{editingArea ? t('editAdministrativeArea') : t('addAdministrativeArea')}</DialogTitle>
        <DialogContent dividers><Stack spacing={2} pt={0.5}>
          {saveArea.error && <Alert severity="error">{saveArea.error.message}</Alert>}
          <TextField select label={t('areaLevel')} value={areaType} disabled={Boolean(editingArea)}
            onChange={(event) => { setAreaType(event.target.value as AreaType); setAreaParent(''); }}>
            {areaTypes.map((type) => <MenuItem key={type} value={type}>{t(`areaLevel_${type}`)}</MenuItem>)}
          </TextField>
          {areaType !== 'country' && <TextField required select label={t('parentArea')} value={areaParent} onChange={(event) => setAreaParent(event.target.value)}>
            {areas.filter((area) => parentTypes[areaType].includes(area.area_type))
              .map((area) => <MenuItem key={area.id} value={area.id}>{`${t(`areaLevel_${area.area_type}`)} · ${makeAreaPath(area.id, areas, locale, t)}`}</MenuItem>)}
          </TextField>}
          <TextField required label={t('nameEnglish')} value={areaNameEn} onChange={(event) => setAreaNameEn(event.target.value)} />
          <TextField label={t('nameUrdu')} value={areaNameUr} onChange={(event) => setAreaNameUr(event.target.value)} />
          <TextField label={t('areaCode')} value={areaCode} onChange={(event) => setAreaCode(event.target.value)} />
          <TextField multiline minRows={2} label={t('areaCodeSource')} value={areaSourceNote} onChange={(event) => setAreaSourceNote(event.target.value)} />
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setAreaDialog(false)}>{t('cancel')}</Button><Button type="submit" variant="contained" disabled={saveArea.isPending}>{saveArea.isPending ? <CircularProgress size={18} /> : t('save')}</Button></DialogActions>
      </Box>
    </Dialog>
  </Box>;
}
