import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AddRounded, DeleteOutlineRounded, EditOutlined, SearchRounded,
} from '@mui/icons-material';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Paper, Snackbar, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../../i18n';
import type { DbRow, FieldDefinition, ResourceDefinition } from '../../types';
import { resourceRepository } from '../../services/repository';
import PageHeading from '../../components/PageHeading';
import { useMosqueScope } from '../mosques/MosqueScope';

function cellText(value: unknown, locale: 'ur' | 'en', translate: (key: string) => string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? (locale === 'ur' ? 'فعال' : 'Active') : (locale === 'ur' ? 'غیر فعال' : 'Inactive');
  if (typeof value === 'string' && value.length > 36 && /^[0-9a-f-]{36}$/i.test(value)) return value.slice(0, 8);
  return typeof value === 'string' ? translate(value) : String(value);
}

function relationQuery(field: FieldDefinition) {
  if (!field.relation) return null;
  return () => resourceRepository.options(field.relation!.table, field.relation!.idField, field.relation!.labelField);
}

function ResourceForm({ definition, row, canManage, busy, onClose, onSave }: {
  definition: ResourceDefinition;
  row: DbRow | null;
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
}) {
  const { t, locale } = useI18n();
  const { mosqueId } = useMosqueScope();
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = definition.fields.filter((field) => !field.readOnly && (!field.managerOnly || canManage));
  const relationFields = fields.filter((field) => field.relation);
  const relations = useQuery({
    queryKey: ['resource-options', mosqueId, relationFields.map((field) => field.relation?.table)],
    queryFn: async () => {
      const pairs = await Promise.all(relationFields.map(async (field) => [field.key, await relationQuery(field)!()] as const));
      return Object.fromEntries(pairs);
    },
    enabled: Boolean(mosqueId),
  });

  useEffect(() => {
    setValues(Object.fromEntries(fields.map((field) => {
      const value = row?.[field.key];
      if (value === null || value === undefined) return [field.key, ''];
      if (field.type === 'datetime-local') {
        const date = new Date(String(value));
        return [field.key, Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''];
      }
      return [field.key, String(value)];
    })));
  }, [definition, row, canManage]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(values);
  }

  return <Box component="form" onSubmit={submit}>
    <DialogTitle>{row ? `${t('edit')} · ${t(definition.titleKey)}` : `${t('add')} · ${t(definition.titleKey)}`}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2} pt={0.5}>
        {relations.error && <Alert severity="error">{relations.error.message}</Alert>}
        {fields.map((field) => {
          const value = values[field.key] ?? '';
          const required = Boolean(field.required || (field.requiredWhen && values[field.requiredWhen.field] === field.requiredWhen.value));
          const onChange = (next: string) => setValues((current) => ({ ...current, [field.key]: next }));
          if (field.type === 'select') {
            const relatedRows = relations.data?.[field.key] ?? [];
            return <TextField key={field.key} select label={t(field.labelKey)} required={required} value={value} onChange={(event) => onChange(event.target.value)}>
              {!required && <MenuItem value="">—</MenuItem>}
              {field.options?.map((option) => <MenuItem key={option.value} value={option.value}>{t(option.labelKey)}</MenuItem>)}
              {relatedRows.map((item) => <MenuItem key={String(item[field.relation!.idField])} value={String(item[field.relation!.idField])}>{cellText(item[field.relation!.labelField], locale, t)}</MenuItem>)}
            </TextField>;
          }
          return <TextField
            key={field.key}
            label={t(field.labelKey)}
            type={field.type === 'textarea' ? 'text' : field.type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required={required}
            multiline={field.type === 'textarea'}
            minRows={field.type === 'textarea' ? 3 : undefined}
            helperText={field.helperTextKey ? t(field.helperTextKey) : undefined}
            slotProps={field.type === 'number' ? { htmlInput: { min: field.min ?? 0, max: field.max, step: 'any' } } : ['date', 'time', 'datetime-local'].includes(field.type) ? { inputLabel: { shrink: true } } : undefined}
          />;
        })}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ p: 2 }}>
      <Button color="inherit" onClick={onClose}>{t('cancel')}</Button>
      <Button type="submit" variant="contained" disabled={busy || Boolean(relations.error)}>{busy ? t('saving') : t('save')}</Button>
    </DialogActions>
  </Box>;
}

export default function ResourcePage({ definition }: { definition: ResourceDefinition }) {
  const { t, locale } = useI18n();
  const { role } = useAuth();
  const { mosqueId, isLoading: mosquesLoading, error: mosquesError } = useMosqueScope();
  const cache = useQueryClient();
  const canManage = Boolean(role && definition.roles.includes(role));
  const canRead = Boolean(role && (definition.roles.includes(role) || definition.readRoles?.includes(role)));
  const canCreate = canManage || Boolean(role && definition.createRoles?.includes(role));
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState(definition.orderField);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DbRow | null>(null);
  const [deleting, setDeleting] = useState<DbRow | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const queryKey = ['resource', mosqueId, definition.key, definition.table, definition.fixedFilters, page, pageSize, searchTerm, sortBy, sortDirection] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => resourceRepository.list(definition, { page, pageSize, search: searchTerm, sortBy, sortDirection }),
    placeholderData: keepPreviousData,
    enabled: Boolean(mosqueId) && (searchTerm.length === 0 || searchTerm.length >= 2),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setSortBy(definition.orderField), [definition]);

  const save = useMutation({
    mutationFn: (values: Record<string, string>) => resourceRepository.save(definition, editing ? String(editing[definition.idField]) : null, values),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['resource', mosqueId, definition.key] }),
        cache.invalidateQueries({ queryKey: ['mosque-dashboard'] }),
      ]);
      setEditorOpen(false);
      setEditing(null);
      setNotice(t('savedSuccessfully'));
    },
    onError: (reason: unknown) => setError(reason instanceof Error ? reason.message : t('unexpectedError')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => resourceRepository.remove(definition, id),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['resource', mosqueId, definition.key] }),
        cache.invalidateQueries({ queryKey: ['mosque-dashboard'] }),
      ]);
      setDeleting(null);
      setNotice(t('deletedSuccessfully'));
    },
    onError: (reason: unknown) => setError(reason instanceof Error ? reason.message : t('unexpectedError')),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const fieldLabels = useMemo(() => new Map(definition.fields.map((field) => [field.key, t(field.labelKey)])), [definition, t]);
  const displayRelations = definition.columns.filter((column) => column.relation);
  const displayRelationQuery = useQuery({
    queryKey: ['resource-column-options', mosqueId, displayRelations.map((column) => column.relation?.table)],
    queryFn: async () => {
      const pairs = await Promise.all(displayRelations.map(async (column) => {
        const relation = column.relation!;
        const rows = await resourceRepository.options(relation.table, relation.idField, relation.labelField);
        return [column.key, new Map(rows.map((option) => [String(option[relation.idField]), String(option[relation.labelField] ?? '')]))] as const;
      }));
      return Object.fromEntries(pairs);
    },
    enabled: Boolean(mosqueId) && canRead && displayRelations.length > 0,
  });

  if (!canRead) {
    return <Alert severity="info">{t('noPermission')}</Alert>;
  }
  if (mosquesError) return <Alert severity="error">{mosquesError.message}</Alert>;
  if (mosquesLoading) return <Box p={4} textAlign="center"><Typography>{t('loading')}</Typography></Box>;
  if (!mosqueId && definition.table !== 'mosque_registrations') return <Alert severity="warning">{t('selectMosqueFirst')}</Alert>;
  if (searchTerm.length > 0 && searchTerm.length < 2) {
    return <Box><PageHeading title={t(definition.titleKey)} description={t(definition.descriptionKey)} /><Alert severity="info">{t('searchMinimum')}</Alert></Box>;
  }

  return <Box className="page-enter">
    <PageHeading
      title={t(definition.titleKey)}
      description={t(definition.descriptionKey)}
      action={canCreate && definition.fields.length > 0 ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => { setEditing(null); setEditorOpen(true); }}>{t('add')}</Button> : undefined}
    />
    <Paper variant="outlined" sx={{ borderRadius: 4, overflow: 'hidden', boxShadow: '0 10px 30px rgba(22,58,43,.045)' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5} px={2.2} py={1.8}>
        <Box><Typography fontWeight={700}>{total.toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-US')} {t('records')}</Typography><Typography variant="caption" color="text.secondary">{t(definition.descriptionKey)}</Typography></Box>
        <TextField size="small" placeholder={t('search')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} slotProps={{ input: { startAdornment: <SearchRounded fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }} sx={{ width: { xs: '100%', sm: 280 } }} />
      </Stack>
      {query.isPending ? <Box p={5} textAlign="center"><Typography color="text.secondary">{t('loading')}</Typography></Box>
        : query.error ? <Alert severity="error" sx={{ m: 2 }}>{query.error.message}</Alert>
          : rows.length === 0 ? <Box p={5} textAlign="center"><Typography variant="h6">{t('noRecords')}</Typography><Typography color="text.secondary" mt={0.5}>{t('noRecordsDescription')}</Typography></Box>
            : <TableContainer sx={{ overflowX: 'auto' }}><Table size="small">
              <TableHead><TableRow>{definition.columns.map((column) => <TableCell key={column.key} sx={{ whiteSpace: 'nowrap', fontWeight: 750 }}>
                <TableSortLabel active={sortBy === column.key} direction={sortBy === column.key ? sortDirection : 'asc'} onClick={() => { if (sortBy === column.key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(column.key); setSortDirection('asc'); } setPage(0); }}>{t(column.labelKey)}</TableSortLabel>
              </TableCell>)}{canManage && <TableCell align="center">{t('actions')}</TableCell>}</TableRow></TableHead>
              <TableBody>{rows.map((row) => <TableRow key={String(row[definition.idField])} hover>
                {definition.columns.map((column) => {
                  const relatedLabel = displayRelationQuery.data?.[column.key]?.get(String(row[column.key]));
                  const value = row[column.key];
                  const displayValue = value === null || value === undefined || value === '' || typeof value === 'boolean'
                    ? cellText(value, locale, t)
                    : fieldLabels.has(column.key) ? t(String(value)) : cellText(value, locale, t);
                  return <TableCell key={column.key} sx={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={relatedLabel ?? String(row[column.key] ?? '')}>
                    {relatedLabel ?? displayValue}
                  </TableCell>;
                })}
                {canManage && <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                  {definition.key === 'bank-transactions' && row.transfer_group_id
                    ? <Typography variant="caption" color="text.secondary">{t('pairedTransfer')}</Typography>
                    : <>
                  <IconButton size="small" aria-label={`${t('edit')} ${t(definition.titleKey)}`} onClick={() => { setEditing(row); setEditorOpen(true); }}><EditOutlined fontSize="small" /></IconButton>
                  {role === 'admin' && <IconButton size="small" color="error" aria-label={t('delete')} onClick={() => setDeleting(row)}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                    </>}
                </TableCell>}
              </TableRow>)}</TableBody>
            </Table></TableContainer>}
      {total > 0 && <TablePagination component="div" count={total} page={page} onPageChange={(_event, next) => setPage(next)} rowsPerPage={pageSize} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage={t('rows')} />}
    </Paper>
    <Dialog open={editorOpen} onClose={() => !save.isPending && setEditorOpen(false)} maxWidth="sm" fullWidth><ResourceForm definition={definition} row={editing} canManage={canManage} busy={save.isPending} onClose={() => setEditorOpen(false)} onSave={(values) => save.mutate(values)} /></Dialog>
    <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth><DialogTitle>{t('confirmDelete')}</DialogTitle><DialogContent><Typography>{t('deleteWarning')}</Typography></DialogContent><DialogActions sx={{ p: 2 }}><Button onClick={() => setDeleting(null)} color="inherit">{t('cancel')}</Button><Button color="error" variant="contained" disabled={remove.isPending} onClick={() => { if (deleting) remove.mutate(String(deleting[definition.idField])); }}>{remove.isPending ? t('deleting') : t('delete')}</Button></DialogActions></Dialog>
    <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice('')} message={notice} />
    <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError('')} message={error} />
  </Box>;
}
