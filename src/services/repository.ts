import { requireSupabaseConfig, supabase } from '../lib/supabase';
import type { DbRow, MosqueSummary, PageResult, ResourceDefinition } from '../types';
import { getSelectedMosqueId } from '../features/mosques/MosqueScope';
import {
  isLocalDemoEnabled, localDemoDashboard, localDemoList, localDemoOptions,
  localDemoRemove, localDemoSave,
} from './localDemo';

export type PageOptions = {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
};

function safeSearch(value: string): string {
  return value.trim().replace(/[,%()\\"]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

export const resourceRepository = {
  async list(definition: ResourceDefinition, options: PageOptions): Promise<PageResult<DbRow>> {
    const mosqueId = getSelectedMosqueId();
    if (isLocalDemoEnabled()) {
      return localDemoList(definition.table, {
        ...options,
        searchFields: definition.searchFields,
        fixedFilters: definition.fixedFilters,
        mosqueId,
      });
    }
    if (!mosqueId && definition.table !== 'mosque_registrations') throw new Error('Select a registered mosque before opening this module.');
    requireSupabaseConfig();
    let query = supabase.from(definition.table).select('*', { count: 'exact' });
    if (mosqueId && definition.table !== 'mosque_registrations') query = query.eq('mosque_id', mosqueId);
    for (const filter of definition.fixedFilters ?? []) query = query.eq(filter.field, filter.value);
    const term = safeSearch(options.search);
    if (term.length >= 2) {
      const filters = definition.searchFields.map((field) => `${field}.ilike.%${term}%`).join(',');
      query = query.or(filters);
    }
    const sortField = definition.columns.some((column) => column.key === options.sortBy)
      ? options.sortBy
      : definition.orderField;
    const { data, error, count } = await query
      .order(sortField, { ascending: options.sortDirection === 'asc', nullsFirst: false })
      .order(definition.idField, { ascending: true })
      .range(options.page * options.pageSize, (options.page + 1) * options.pageSize - 1)
      .returns<DbRow[]>();
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  },

  async save(definition: ResourceDefinition, id: string | null, values: Record<string, string>): Promise<void> {
    const mosqueId = getSelectedMosqueId();
    const payload: Record<string, string | number | boolean | null> = {};
    for (const field of definition.fields) {
      if (field.readOnly) continue;
      if (!(field.key in values)) continue;
      const value = values[field.key].trim();
      if (!value) {
        if (!id || field.type === 'select') continue;
        payload[field.key] = null;
      } else if (field.type === 'number') {
        const number = Number(value);
        if (!Number.isFinite(number) || (field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) {
          throw new Error(`${field.labelKey} must be a valid number.`);
        }
        payload[field.key] = number;
      } else if (['active', 'contact_consent', 'gratuity_eligible'].includes(field.key)) {
        payload[field.key] = value === 'true';
      } else if (field.key === 'national_id' && definition.key === 'staff') {
        const cnic = value.replace(/\D/g, '');
        if (cnic && !/^\d{13}$/.test(cnic)) throw new Error('staffCnicInvalid');
        payload[field.key] = cnic || null;
      } else if (field.type === 'datetime-local') {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) throw new Error(`${field.labelKey} must be a valid date and time.`);
        payload[field.key] = date.toISOString();
      } else {
        payload[field.key] = value;
      }
    }
    if (definition.key === 'attendance') {
      const mode = payload.attendance_mode;
      if (mode === 'individual') {
        if (!payload.worshipper_id) throw new Error('Select a worshipper for individual attendance.');
        if (payload.attendee_count !== 1) throw new Error('Individual attendance count must be 1.');
      } else if (mode === 'aggregate') {
        payload.worshipper_id = null;
      }
    }
    if (definition.table !== 'mosque_registrations') {
      if (!mosqueId) throw new Error('Select a registered mosque before saving this record.');
      payload.mosque_id = mosqueId;
    }
    if (isLocalDemoEnabled()) {
      localDemoSave(definition.table, definition.idField, id, payload);
      return;
    }
    requireSupabaseConfig();
    if (id) {
      let query = supabase.from(definition.table).update(payload).eq(definition.idField, id);
      if (definition.table !== 'mosque_registrations') query = query.eq('mosque_id', mosqueId);
      const { data, error } = await query.select(definition.idField).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This record no longer belongs to the selected mosque.');
    } else {
      const { error } = await supabase.from(definition.table).insert(payload);
      if (error) throw error;
    }
  },

  async remove(definition: ResourceDefinition, id: string): Promise<void> {
    const mosqueId = getSelectedMosqueId();
    if (definition.table !== 'mosque_registrations' && !mosqueId) {
      throw new Error('Select a registered mosque before removing this record.');
    }
    if (isLocalDemoEnabled()) {
      localDemoRemove(definition.table, definition.idField, id, mosqueId);
      return;
    }
    requireSupabaseConfig();
    let query = supabase.from(definition.table).delete().eq(definition.idField, id);
    if (mosqueId && definition.table !== 'mosque_registrations') query = query.eq('mosque_id', mosqueId);
    const { data, error } = await query.select(definition.idField).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This record no longer belongs to the selected mosque.');
  },

  async dashboard(): Promise<MosqueSummary> {
    const mosqueId = getSelectedMosqueId();
    if (!mosqueId) throw new Error('Select a registered mosque before loading the dashboard.');
    if (isLocalDemoEnabled()) return localDemoDashboard(mosqueId);
    requireSupabaseConfig();
    const { data, error } = await supabase.rpc('masjid_dashboard_summary', { p_mosque_id: mosqueId });
    if (error) throw error;
    return data as MosqueSummary;
  },

  async options(table: string, idField: string, labelField: string): Promise<DbRow[]> {
    const mosqueId = getSelectedMosqueId();
    if (isLocalDemoEnabled()) return localDemoOptions(table, idField, labelField, mosqueId);
    requireSupabaseConfig();
    let query = supabase.from(table)
      .select(`${idField}, ${labelField}${table === 'mosque_registrations' ? '' : ', mosque_id'}`);
    if (table === 'bank_accounts') query = query.eq('account_type', 'central');
    else if (mosqueId && table !== 'mosque_registrations') query = query.eq('mosque_id', mosqueId);
    const { data, error } = await query
      .order(labelField)
      .limit(500)
      .returns<DbRow[]>();
    if (error) throw error;
    return data ?? [];
  },
};
