import { resources } from '../features/resources/definitions';
import type { DbRow, MosqueSummary, ResourceDefinition } from '../types';

const storageKey = 'masjid-local-demo-v1';
const demoCounts: Record<string, number> = {
  staff_members: 8,
  rental_properties: 8,
  tenants: 8,
  rental_leases: 8,
  rent_payments: 6,
  staff_salary_payments: 4,
  utility_bills: 5,
  maintenance_requests: 5,
  financial_transactions: 6,
  donations: 6,
  prayer_schedules: 5,
  prayer_attendance: 7,
  worshippers: 7,
  community_programs: 6,
  program_registrations: 4,
  facility_bookings: 4,
  announcements: 3,
  legal_matters: 5,
  bank_accounts: 4,
  bank_transactions: 12,
  bank_cheques: 5,
};

type DemoStore = Record<string, DbRow[]>;

const names = ['Ahmad Khan', 'Bilal Ahmed', 'Fatima Noor', 'Usman Ali', 'Ayesha Malik', 'Hamza Raza', 'Maryam Iqbal', 'Yusuf Shah'];
const today = new Date();
const dateOffset = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);
const uuid = (index: number) => `demo-${String(index).padStart(4, '0')}`;

export function isLocalDemoEnabled(): boolean {
  return localStorage.getItem('masjid-local-demo-enabled') === 'true';
}

function getStore(): DemoStore {
  const raw = localStorage.getItem(storageKey);
  if (!raw) throw new Error('Local demo records are missing. Turn local demo mode off and on to recreate them.');
  const store = JSON.parse(raw) as DemoStore;
  let changed = false;
  if (!Array.isArray(store.legal_matters)) {
    store.legal_matters = [
      { id: uuid(5001), matter_number: 'DEMO-LGL-001', title: 'Shop rent follow-up', matter_area: 'shop', related_party: names[1], opened_on: dateOffset(-14), deadline: dateOffset(7), status: 'open', summary: 'Fictional local demonstration record. No real legal advice or personal data.', notes: 'Demo only.' },
      { id: uuid(5002), matter_number: 'DEMO-LGL-002', title: 'Employee response requested', matter_area: 'employee', related_party: names[2], opened_on: dateOffset(-11), deadline: null, status: 'waiting', summary: 'Fictional local demonstration record. No real legal advice or personal data.', notes: 'Demo only.' },
      { id: uuid(5003), matter_number: 'DEMO-LGL-003', title: 'Committee meeting record', matter_area: 'mosque', related_party: names[3], opened_on: dateOffset(-8), deadline: dateOffset(10), status: 'open', summary: 'Fictional local demonstration record. No real legal advice or personal data.', notes: 'Demo only.' },
      { id: uuid(5004), matter_number: 'DEMO-LGL-004', title: 'Lease clause review', matter_area: 'shop', related_party: names[4], opened_on: dateOffset(-6), deadline: null, status: 'resolved', summary: 'Fictional local demonstration record. No real legal advice or personal data.', notes: 'Demo only.' },
      { id: uuid(5005), matter_number: 'DEMO-LGL-005', title: 'Lawyer review requested', matter_area: 'employee', related_party: names[5], opened_on: dateOffset(-3), deadline: dateOffset(14), status: 'open', summary: 'Fictional local demonstration record. No real legal advice or personal data.', notes: 'Demo only.' },
    ];
    changed = true;
  }
  if (!Array.isArray(store.bank_accounts)) {
    const centralId = uuid(6001);
    store.bank_accounts = [
      { id: centralId, account_name: 'Central Masjid Accounts', account_type: 'central', parent_account_id: null, currency: 'PKR', opening_balance: 0, active: true },
      ...['Demo Masjid 1', 'Demo Masjid 2', 'Demo Masjid 3'].map((account_name, index) => ({
        id: uuid(6002 + index), account_name, account_type: 'mosque', parent_account_id: centralId,
        bank_name: ['Demo Bank', 'Community Bank', 'Sample Bank'][index], branch_name: `Sample Branch ${index + 1}`,
        account_last4: String(1020 + index), currency: 'PKR', opening_balance: 100000 * (index + 1), active: true,
      })),
    ];
    store.bank_transactions = Array.from({ length: 6 }, (_, index) => ({
      id: uuid(6101 + index), bank_account_id: store.bank_accounts[1 + (index % 3)].id,
      entry_type: index % 2 ? 'withdrawal' : 'deposit',
      category: index % 2 ? 'Utilities' : 'Donation deposit',
      description: `Fictional bank ledger entry ${index + 1}`,
      amount: index === 1 ? 10500 : 5000 + index * 250, transaction_date: dateOffset(-index),
      reference: `DEMO-BANK-${index + 1}`, cheque_number: index === 1 ? 'DEMO-1002' : null,
      transfer_group_id: null,
    }));
    store.bank_cheques = Array.from({ length: 5 }, (_, index) => ({
      id: uuid(6201 + index), bank_account_id: store.bank_accounts[1 + (index % 3)].id,
      cheque_number: `DEMO-${String(1001 + index)}`, payee: names[index],
      amount: 10000 + index * 500, issue_date: dateOffset(-index),
      status: ['issued', 'cleared', 'issued', 'void', 'bounced'][index],
      cleared_date: index === 1 ? dateOffset(-1) : null,
      bank_transaction_id: index === 1 ? store.bank_transactions[1].id : null,
      reference: 'Fictional demo cheque.',
    }));
    changed = true;
  }
  if (!Array.isArray(store.administrative_areas)) {
    const countryId = uuid(7001);
    const regions = [
      ['Punjab', 'پنجاب', 'PK-PB'],
      ['Sindh', 'سندھ', 'PK-SD'],
      ['Khyber Pakhtunkhwa', 'خیبر پختونخوا', 'PK-KP'],
      ['Balochistan', 'بلوچستان', 'PK-BA'],
      ['Islamabad Capital Territory', 'اسلام آباد وفاقی علاقہ', 'PK-IS'],
      ['Gilgit-Baltistan', 'گلگت بلتستان', 'PK-GB'],
      ['Azad Jammu and Kashmir', 'آزاد جموں و کشمیر', 'PK-JK'],
    ] as const;
    store.administrative_areas = [
      { id: countryId, parent_id: null, area_type: 'country', name_en: 'Pakistan', name_ur: 'پاکستان', code: 'PK', seeded: true },
      ...regions.map(([name_en, name_ur, code], index) => ({
        id: uuid(7002 + index), parent_id: countryId, area_type: 'province',
        name_en, name_ur, code, seeded: true,
      })),
    ];
    store.mosque_registrations = [{
      id: uuid(7101), name: 'Demo Masjid', registration_number: 'DEMO-REG-001',
      administrative_area_id: uuid(7002), address: 'Fictional local demonstration record',
      registered_on: dateOffset(-365), registration_authority: 'Demo only',
      land_area: 2, land_area_unit: 'kanal', built_up_area: 3600, built_up_area_unit: 'sqft',
      facilities: {
        prayer_halls: { count: 2, condition: 'available', note: '' },
        wudu_areas: { count: 1, condition: 'available', note: '' },
        washrooms: { count: 4, condition: 'available', note: '' },
        cameras: { count: 6, condition: 'available', note: '' },
        residential_rooms: { count: 2, condition: 'available', note: '' },
        classrooms: { count: 3, condition: 'needs_repair', note: '' },
        offices: { count: 1, condition: 'available', note: '' },
        parking: { count: 1, condition: 'available', note: '' },
        other: { count: 0, condition: 'not_available', note: '' },
      },
      contact_name: 'Demo caretaker', contact_phone: '', status: 'active',
      notes: 'Fictional local demo record. Not saved to Supabase.',
    }];
    changed = true;
  }
  store.mosque_registrations ??= [];
  store.administrative_areas ??= [];
  store.staff_members ??= [];
  const demoAreaNote = 'Demo relationship example only. Verify official boundaries before operational use.';
  const ensureDemoArea = (parentId: string, areaType: string, nameEn: string, nameUr: string, id: number) => {
    const existing = store.administrative_areas.find((area) =>
      String(area.parent_id ?? '') === parentId
      && area.area_type === areaType
      && String(area.name_en ?? '').toLocaleLowerCase() === nameEn.toLocaleLowerCase());
    if (existing) return String(existing.id);
    const areaId = uuid(id);
    store.administrative_areas.push({
      id: areaId, parent_id: parentId, area_type: areaType, name_en: nameEn, name_ur: nameUr,
      source_note: demoAreaNote, seeded: true,
    });
    changed = true;
    return areaId;
  };
  const country = store.administrative_areas.find((area) => area.area_type === 'country');
  let korangiTownId: string | null = null;
  if (country) {
    const countryId = String(country.id);
    const sindhId = ensureDemoArea(countryId, 'province', 'Sindh', 'سندھ', 7003);
    const karachiDivisionId = ensureDemoArea(sindhId, 'division', 'Karachi Division', 'کراچی ڈویژن', 7010);
    const korangiDistrictId = ensureDemoArea(karachiDivisionId, 'district', 'Korangi District', 'کورنگی ضلع', 7011);
    const korangiTehsilId = ensureDemoArea(korangiDistrictId, 'tehsil', 'Korangi Tehsil', 'کورنگی تحصیل', 7012);
    korangiTownId = ensureDemoArea(korangiTehsilId, 'town', 'Korangi', 'کورنگی', 7013);
  }
  let demoImam = store.staff_members.find((staff) =>
    staff.full_name === 'Rashid Ali (Demo)' && staff.staff_type === 'imam');
  if (!demoImam) {
    demoImam = {
      id: uuid(8001), staff_number: 'DEMO-IMAM-001', full_name: 'Rashid Ali (Demo)',
      staff_type: 'imam', job_title: 'Imam', status: 'active', monthly_salary: 0,
      start_date: dateOffset(-365), email: null, phone: null,
    };
    store.staff_members.push(demoImam);
    changed = true;
  }
  if (korangiTownId && !store.mosque_registrations.some((mosque) => mosque.registration_number === 'DEMO-REG-KHI-001')) {
    store.mosque_registrations.push({
      id: uuid(7102), name: 'Madina Masjid (Demo)', registration_number: 'DEMO-REG-KHI-001',
      administrative_area_id: korangiTownId, imam_staff_id: demoImam.id,
      address: 'Demo address, Korangi, Karachi', registered_on: dateOffset(-180),
      registration_authority: 'Demo only', land_area: 1.5, land_area_unit: 'kanal',
      built_up_area: 2400, built_up_area_unit: 'sqft',
      facilities: {
        prayer_halls: { count: 1, condition: 'available', note: '' },
        wudu_areas: { count: 1, condition: 'available', note: '' },
        washrooms: { count: 2, condition: 'available', note: '' },
        cameras: { count: 4, condition: 'available', note: '' },
        residential_rooms: { count: 1, condition: 'available', note: '' },
        classrooms: { count: 1, condition: 'available', note: '' },
        offices: { count: 1, condition: 'available', note: '' },
        parking: { count: 0, condition: 'not_available', note: '' },
        other: { count: 0, condition: 'not_available', note: '' },
      },
      contact_name: 'Demo caretaker', contact_phone: '', status: 'active',
      notes: 'Fictional local demo record. Not saved to Supabase.',
    });
    changed = true;
  }
  store.mosque_committees ??= [];
  store.mosque_committee_members ??= [];
  store.mosque_committee_interviews ??= [];
  store.mosque_committee_pledges ??= [];
  store.mosque_committee_performance_reviews ??= [];
  const demoMasjid = store.mosque_registrations.find((mosque) => mosque.registration_number === 'DEMO-REG-KHI-001');
  if (demoMasjid && !store.mosque_committees.some((committee) => committee.title === 'Demo Masjid Management Committee')) {
    const committeeId = uuid(9001);
    store.mosque_committees.push({
      id: committeeId, mosque_id: demoMasjid.id, previous_committee_id: null,
      title: 'Demo Masjid Management Committee', term_starts_on: dateOffset(-90),
      term_ends_on: dateOffset(275), status: 'active',
    });
    const demoCommitteeMembers = [
      ['Demo Supervisor', 'supervisor', 'administration', 'manage'],
      ['Ahmad Khan (Demo)', 'member', 'finance', 'approve'],
      ['Bilal Ahmed (Demo)', 'member', 'maintenance', 'manage'],
      ['Fatima Noor (Demo)', 'member', 'events', 'propose'],
      ['Usman Ali (Demo)', 'member', 'education', 'propose'],
      ['Ayesha Malik (Demo)', 'member', 'welfare', 'view'],
    ] as const;
    demoCommitteeMembers.forEach(([full_name, member_position, department, authority_level], index) => {
      const memberId = uuid(9101 + index);
      store.mosque_committee_members.push({
        id: memberId, committee_id: committeeId, full_name,
        phone: `0300-555-${String(2001 + index)}`, email: null,
        address: `Fictional Demo Address ${index + 1}, Korangi, Karachi`,
        member_position, department, authority_level, status: 'active',
      });
      store.mosque_committee_interviews.push({
        id: uuid(9201 + index), member_id: memberId, interview_date: dateOffset(-100),
        interviewer_name: 'Demo Interview Panel',
        answers: {
          experience: 'Fictional demo interview response.',
          integrity: 'Fictional demo interview response.',
          community: 'Fictional demo interview response.',
          conflict: 'Fictional demo interview response.',
          availability: 'Fictional demo interview response.',
        },
        assessment: 'Fictional demo interview assessment. Not a real person or appointment.',
        recommendation: 'suitable',
      });
    });
    changed = true;
  }
  if (demoMasjid) {
    for (const [table, rows] of Object.entries(store)) {
      if (table === 'administrative_areas' || table === 'mosque_registrations') continue;
      for (const row of rows) {
        if (table === 'mosque_committees') continue;
        if (!row.mosque_id) {
          row.mosque_id = demoMasjid.id;
          changed = true;
        }
      }
    }
    for (const member of store.mosque_committee_members) {
      const committee = store.mosque_committees.find((item) => item.id === member.committee_id);
      if (committee && member.mosque_id !== committee.mosque_id) {
        member.mosque_id = committee.mosque_id;
        changed = true;
      }
    }
    for (const interview of store.mosque_committee_interviews) {
      const member = store.mosque_committee_members.find((item) => item.id === interview.member_id);
      const committee = store.mosque_committees.find((item) => item.id === member?.committee_id);
      if (committee && interview.mosque_id !== committee.mosque_id) {
        interview.mosque_id = committee.mosque_id;
        changed = true;
      }
    }
    for (const pledge of store.mosque_committee_pledges) {
      const member = store.mosque_committee_members.find((item) => item.id === pledge.member_id);
      const committee = store.mosque_committees.find((item) => item.id === member?.committee_id);
      if (committee && pledge.mosque_id !== committee.mosque_id) {
        pledge.mosque_id = committee.mosque_id;
        changed = true;
      }
    }
    for (const review of store.mosque_committee_performance_reviews) {
      const member = store.mosque_committee_members.find((item) => item.id === review.member_id);
      const committee = store.mosque_committees.find((item) => item.id === member?.committee_id);
      if (committee && review.mosque_id !== committee.mosque_id) {
        review.mosque_id = committee.mosque_id;
        changed = true;
      }
    }
    if (!Array.isArray(store.staff_interviews)) {
      store.staff_interviews = [];
      changed = true;
    }
    for (const interview of store.staff_interviews) {
      if (!interview.mosque_id) {
        interview.mosque_id = demoMasjid.id;
        changed = true;
      }
    }
  }
  store.bank_transactions ??= [];
  store.bank_cheques ??= [];
  (store.staff_members ?? []).forEach((staff, index) => {
    const defaults: DbRow = {
      pension_deduction_percent: 3 + (index % 6),
      medical_allowance: 2500 + (index % 3) * 250,
      housing_allowance: 4000 + (index % 3) * 250,
      transport_allowance: 1500 + (index % 3) * 250,
      other_benefit_name: index % 2 === 0 ? 'Meal allowance' : null,
      other_benefit_amount: index % 2 === 0 ? 1000 : 0,
      gratuity_eligible: true,
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (staff[key] === undefined || staff[key] === null) {
        staff[key] = value;
        changed = true;
      }
    }
    if (staff.start_date && Date.parse(String(staff.start_date)) > Date.now() - 300 * 86_400_000) {
      staff.start_date = dateOffset(-(365 * (index + 1)));
      changed = true;
    }
  });
  (store.staff_salary_payments ?? []).forEach((payment) => {
    const before = `${payment.gross_salary}|${payment.pension_deduction}|${payment.benefit_amount}|${payment.amount}`;
    calculateLocalSalary(payment, store);
    if (before !== `${payment.gross_salary}|${payment.pension_deduction}|${payment.benefit_amount}|${payment.amount}`) changed = true;
  });
  if (changed) localStorage.setItem(storageKey, JSON.stringify(store));
  store.bank_reconciliations ??= [];
  store.bank_statement_lines ??= [];
  return store;
}

function makeValue(definition: ResourceDefinition, fieldKey: string, index: number, store: DemoStore): unknown {
  const field = definition.fields.find((item) => item.key === fieldKey);
  if (field?.relation) {
    const related = store[field.relation.table] ?? [];
    return related.length ? related[index % related.length][field.relation.idField] : null;
  }
  if (field?.options?.length) {
    const value = field.options[index % field.options.length].value;
    if (fieldKey === 'active' || fieldKey === 'contact_consent') return value === 'true';
    return value;
  }
  if (field?.type === 'number') {
    if (fieldKey === 'pension_deduction_percent') return 3 + (index % 6);
    if (['medical_allowance', 'housing_allowance', 'transport_allowance', 'other_benefit_amount'].includes(fieldKey)) return [2500, 4000, 1500, 1000][['medical_allowance', 'housing_allowance', 'transport_allowance', 'other_benefit_amount'].indexOf(fieldKey)] + (index % 3) * 250;
    if (fieldKey.includes('salary') || fieldKey.includes('rent') || fieldKey === 'amount' || fieldKey === 'security_deposit') return 15000 + (index % 8) * 5000;
    if (fieldKey.includes('count') || fieldKey === 'family_size' || fieldKey === 'capacity') return 15 + index;
    return 1 + index;
  }
  if (field?.type === 'date') {
    if (['donation_date', 'payment_date', 'paid_at', 'entry_date', 'prayer_date'].includes(fieldKey)) {
      return dateOffset(-(index % Math.max(today.getDate(), 1)));
    }
    return dateOffset(index - 12);
  }
  if (field?.type === 'time') return `${String(5 + (index % 14)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`;
  if (field?.type === 'datetime-local') return `${dateOffset(index + 1)}T${String(10 + (index % 8)).padStart(2, '0')}:00`;
  if (fieldKey === 'full_name' || fieldKey === 'donor_name' || fieldKey === 'requested_by') return names[index % names.length];
  if (fieldKey === 'name') return `Demo ${definition.titleKey} ${String(index + 1).padStart(2, '0')}`;
  if (fieldKey === 'staff_type') return ['imam', 'muezzin', 'khadim', 'teacher'][index % 4];
  if (fieldKey === 'job_title') return ['Imam', 'Muezzin', 'Caretaker', 'Quran teacher'][index % 4];
  if (fieldKey === 'property_type') return index % 2 ? 'shop' : 'house';
  if (fieldKey === 'tenant_type') return index % 2 ? 'shopkeeper' : 'resident';
  if (fieldKey === 'business_name') return `Demo Shop ${index + 1}`;
  if (fieldKey === 'email') return `demo${index + 1}@example.invalid`;
  if (fieldKey.includes('phone') || fieldKey === 'phone') return `0300-555-${String(1000 + index).slice(-4)}`;
  if (fieldKey.includes('period')) return today.toISOString().slice(0, 7);
  if (fieldKey === 'prayer_name') return ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'][index % 5];
  if (fieldKey === 'entry_type') return index % 2 ? 'income' : 'expense';
  if (fieldKey === 'category') return index % 2 ? 'donation' : 'maintenance';
  if (fieldKey === 'title') return `Demo maintenance request ${index + 1}`;
  if (fieldKey === 'description' || fieldKey === 'notes' || fieldKey === 'body') return 'Fictional local demonstration record.';
  if (fieldKey === 'unit_number') return `UNIT-${String(index + 1).padStart(2, '0')}`;
  if (fieldKey === 'address') return `Demo Street ${index + 1}, Sample Town`;
  if (fieldKey === 'instructor_name') return names[index % names.length];
  if (fieldKey === 'reference') return `DEMO-${index + 1}`;
  if (fieldKey === 'agreement_reference') return `DEMO-LEASE-${index + 1}`;
  if (fieldKey === 'receipt_number') return `DEMO-${definition.key.toUpperCase()}-${String(index + 1).padStart(4, '0')}`;
  if (fieldKey === 'staff_number') return `STF-${String(index + 1).padStart(6, '0')}`;
  if (fieldKey === 'property_number') return `PRP-${String(index + 1).padStart(6, '0')}`;
  if (fieldKey === 'tenant_number') return `TNT-${String(index + 1).padStart(6, '0')}`;
  if (fieldKey === 'lease_number') return `LSE-${String(index + 1).padStart(6, '0')}`;
  return `Demo ${fieldKey.replaceAll('_', ' ')} ${index + 1}`;
}

function createStore(): DemoStore {
  const store: DemoStore = {};
  const definitions = Object.values(resources).filter((definition, index, list) =>
    definition.table !== 'rent_due_status' && list.findIndex((item) => item.table === definition.table) === index);

  for (const definition of definitions) {
    const count = demoCounts[definition.table] ?? 0;
    store[definition.table] = Array.from({ length: count }, (_, index) => {
      const row: DbRow = { [definition.idField]: uuid(Object.values(store).reduce((sum, rows) => sum + rows.length, 0) + index + 1) };
      for (const field of definition.fields) row[field.key] = makeValue(definition, field.key, index, store);
      for (const column of definition.columns) {
        if (!(column.key in row)) row[column.key] = makeValue(definition, column.key, index, store);
      }
      if (definition.table === 'rental_properties') row.status = index < 6 ? 'occupied' : 'vacant';
      if (definition.table === 'rental_leases') row.status = 'active';
      if (definition.table === 'rent_payments') row.amount = 15000 + (index % 8) * 5000;
      if (definition.table === 'staff_members') row.start_date = dateOffset(-(365 * (index + 1)));
      if (definition.table === 'prayer_schedules') {
        row.prayer_name = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'][index];
        row.effective_from = dateOffset(-30);
        row.active = true;
      }
      if (definition.table === 'legal_matters') {
        row.matter_number = `DEMO-LGL-${String(index + 1).padStart(3, '0')}`;
        row.title = ['Shop rent follow-up', 'Employee response requested', 'Committee meeting record', 'Lease clause review', 'Lawyer review requested'][index];
        row.opened_on = dateOffset(-14 + index);
        row.deadline = index % 2 === 0 ? dateOffset(index + 7) : null;
        row.status = ['open', 'waiting', 'open', 'resolved', 'open'][index];
        row.related_party = names[(index + 2) % names.length];
        row.summary = 'Fictional local demonstration record. No real legal advice or personal data.';
        row.notes = 'Demo only.';
      }
      row.created_at ??= new Date(today.getTime() - index * 86_400_000).toISOString();
      return row;
    });
  }
  const bankAccounts = store.bank_accounts ?? [];
  if (bankAccounts.length) {
    bankAccounts[0] = {
      ...bankAccounts[0], account_name: 'Central Masjid Accounts', account_type: 'central',
      parent_account_id: null, bank_name: null, branch_name: null, account_last4: null,
      currency: 'PKR', opening_balance: 0, active: true,
    };
    for (const [index, account] of bankAccounts.slice(1).entries()) {
      Object.assign(account, {
        account_name: `Demo Masjid ${index + 1}`,
        account_type: 'mosque',
        parent_account_id: bankAccounts[0].id,
        bank_name: ['Demo Bank', 'Community Bank', 'Sample Bank'][index % 3],
        branch_name: `Sample Branch ${index + 1}`,
        account_last4: String(1020 + index),
        currency: 'PKR',
        opening_balance: 100000 * (index + 1),
        active: true,
      });
    }
    (store.bank_transactions ?? []).forEach((transaction, index) => {
      const account = bankAccounts[1 + (index % Math.max(bankAccounts.length - 1, 1))];
      Object.assign(transaction, {
        bank_account_id: account?.id,
        entry_type: index % 2 ? 'withdrawal' : 'deposit',
        category: index % 2 ? 'Utilities' : 'Donation deposit',
        description: `Fictional bank ledger entry ${index + 1}`,
        amount: index === 1 ? 10500 : 5000 + index * 250,
        transaction_date: dateOffset(-index),
        reference: `DEMO-BANK-${index + 1}`,
        cheque_number: index === 1 ? 'DEMO-1002' : null,
        transfer_group_id: null,
      });
    });
    (store.bank_cheques ?? []).forEach((cheque, index) => {
      const account = bankAccounts[1 + (index % Math.max(bankAccounts.length - 1, 1))];
      Object.assign(cheque, {
        bank_account_id: account?.id,
        cheque_number: `DEMO-${String(1001 + index)}`,
        payee: names[index % names.length],
        amount: 10000 + index * 500,
        issue_date: dateOffset(-index),
        status: ['issued', 'cleared', 'issued', 'void', 'bounced'][index % 5],
        cleared_date: index % 5 === 1 ? dateOffset(-1) : null,
        bank_transaction_id: index % 5 === 1 ? store.bank_transactions?.find((transaction) =>
          transaction.bank_account_id === account?.id && transaction.cheque_number === `DEMO-${String(1001 + index)}`)?.id ?? null : null,
        reference: 'Fictional demo cheque.',
      });
    });
  }
  (store.staff_salary_payments ?? []).forEach((payment) => calculateLocalSalary(payment, store));
  store.bank_reconciliations ??= [];
  store.bank_statement_lines ??= [];
  return store;
}

export function enableLocalDemo(): void {
  localStorage.setItem(storageKey, JSON.stringify(createStore()));
  localStorage.setItem('masjid-local-demo-enabled', 'true');
}

export function disableLocalDemo(): void {
  localStorage.removeItem('masjid-local-demo-enabled');
}

export function localDemoOptions(table: string, idField: string, labelField: string, mosqueId = ''): DbRow[] {
  const store = getStore();
  const source = table === 'bank_masjid_account_options'
    ? (store.bank_accounts ?? []).filter((row) => row.account_type === 'mosque' && row.active)
    : table === 'bank_accounts'
      ? (store.bank_accounts ?? []).filter((row) => row.account_type === 'central')
    : store[table] ?? [];
  return source
    ?.filter((row) => table === 'mosque_registrations'
      || (table === 'bank_accounts' && row.account_type === 'central')
      || !mosqueId || String(row.mosque_id ?? '') === mosqueId)
    .map((row) => ({ [idField]: row[idField], [labelField]: row[labelField] })) ?? [];
}

function rentDueRows(store: DemoStore): DbRow[] {
  const properties = store.rental_properties ?? [];
  const tenants = store.tenants ?? [];
  const payments = store.rent_payments ?? [];
  const currentPeriod = today.toISOString().slice(0, 7);
  return (store.rental_leases ?? []).map((lease) => {
    const property = properties.find((item) => item.id === lease.property_id);
    const tenant = tenants.find((item) => item.id === lease.tenant_id);
    const paid = payments.filter((item) => item.lease_id === lease.id && item.period === currentPeriod)
      .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    return {
      lease_id: lease.id,
      mosque_id: lease.mosque_id,
      lease_number: lease.lease_number,
      property_name: property?.name ?? 'Demo property',
      property_number: property?.property_number,
      tenant_name: tenant?.full_name ?? 'Demo tenant',
      tenant_number: tenant?.tenant_number,
      period: currentPeriod,
      monthly_rent: lease.monthly_rent,
      paid_amount: paid,
      balance_due: Math.max(Number(lease.monthly_rent ?? 0) - paid, 0),
      due_date: `${currentPeriod}-${String(lease.rent_due_day ?? 1).padStart(2, '0')}`,
    };
  });
}

function staffBenefitRows(store: DemoStore): DbRow[] {
  const serviceYears = (startDate: unknown) => startDate
    ? Math.max(new Date().getFullYear() - new Date(String(startDate)).getFullYear()
      - (new Date().getMonth() < new Date(String(startDate)).getMonth()
        || (new Date().getMonth() === new Date(String(startDate)).getMonth() && new Date().getDate() < new Date(String(startDate)).getDate()) ? 1 : 0), 0)
    : 0;
  return (store.staff_members ?? []).map((staff) => {
    const years = serviceYears(staff.start_date);
    const salary = Number(staff.monthly_salary ?? 0);
    const pensionPercent = Number(staff.pension_deduction_percent ?? 0);
    const benefits = ['medical_allowance', 'housing_allowance', 'transport_allowance', 'other_benefit_amount']
      .reduce((sum, field) => sum + Number(staff[field] ?? 0), 0);
    return {
      id: staff.id,
      mosque_id: staff.mosque_id,
      staff_number: staff.staff_number,
      full_name: staff.full_name,
      staff_type: staff.staff_type,
      job_title: staff.job_title,
      start_date: staff.start_date,
      monthly_salary: salary,
      pension_deduction_percent: pensionPercent,
      monthly_pension_deduction: Math.round(salary * pensionPercent) / 100,
      medical_allowance: staff.medical_allowance,
      housing_allowance: staff.housing_allowance,
      transport_allowance: staff.transport_allowance,
      other_benefit_name: staff.other_benefit_name,
      other_benefit_amount: staff.other_benefit_amount,
      monthly_benefits_total: benefits,
      gratuity_eligible: staff.gratuity_eligible,
      completed_service_years: years,
      estimated_gratuity: staff.gratuity_eligible ? salary * years : 0,
    };
  });
}

function calculateLocalSalary(payment: DbRow, store: DemoStore): void {
  const staff = (store.staff_members ?? []).find((row) => row.id === payment.staff_id);
  if (!staff) return;
  const gross = Number(payment.gross_salary ?? payment.amount ?? staff.monthly_salary ?? 0);
  const deduction = Math.round(gross * Number(staff.pension_deduction_percent ?? 0)) / 100;
  const benefits = ['medical_allowance', 'housing_allowance', 'transport_allowance', 'other_benefit_amount']
    .reduce((sum, field) => sum + Number(staff[field] ?? 0), 0);
  payment.gross_salary = gross;
  payment.pension_deduction = deduction;
  payment.benefit_amount = benefits;
  payment.amount = gross + benefits - deduction;
}

export function localDemoList(table: string, options: {
  page: number; pageSize: number; search: string; sortBy: string; sortDirection: 'asc' | 'desc';
  searchFields: string[]; fixedFilters?: { field: string; value: string }[]; mosqueId?: string;
}): { rows: DbRow[]; total: number } {
  const store = getStore();
  const rows = table === 'rent_due_status' ? rentDueRows(store)
    : table === 'staff_benefit_summary' ? staffBenefitRows(store)
      : [...(store[table] ?? [])];
  const filtered = rows.filter((row) =>
    (table === 'mosque_registrations' || !options.mosqueId || String(row.mosque_id ?? '') === options.mosqueId)
    &&
    (options.fixedFilters ?? []).every((filter) => String(row[filter.field]) === filter.value)
    && (!options.search || options.searchFields.some((field) => String(row[field] ?? '').toLowerCase().includes(options.search.toLowerCase()))));
  filtered.sort((a, b) => {
    const left = a[options.sortBy];
    const right = b[options.sortBy];
    const compare = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
    return options.sortDirection === 'asc' ? compare : -compare;
  });
  const start = options.page * options.pageSize;
  return { rows: filtered.slice(start, start + options.pageSize), total: filtered.length };
}

export function localDemoSave(table: string, idField: string, id: string | null, payload: DbRow): string {
  const store = getStore();
  const rows = store[table] ?? [];
  if (id) {
    const index = rows.findIndex((row) => String(row[idField]) === id);
    if (index < 0) throw new Error('The selected demo record no longer exists.');
    if (table !== 'mosque_registrations'
      && String(rows[index].mosque_id ?? '') !== String(payload.mosque_id ?? '')) {
      throw new Error('This record no longer belongs to the selected mosque.');
    }
    rows[index] = { ...rows[index], ...payload };
    if (table === 'staff_salary_payments') calculateLocalSalary(rows[index], store);
    store[table] = rows;
    localStorage.setItem(storageKey, JSON.stringify(store));
    return id;
  } else {
    const newRow = { ...payload, [idField]: uuid(Object.values(store).reduce((sum, items) => sum + items.length, 0) + 1), created_at: new Date().toISOString() };
    if (table === 'legal_matters') {
      newRow.matter_number = `DEMO-LGL-${String(Date.now()).slice(-6)}`;
      newRow.opened_on ??= dateOffset(0);
    }
    if (table === 'staff_salary_payments') calculateLocalSalary(newRow, store);
    rows.unshift(newRow);
    store[table] = rows;
    localStorage.setItem(storageKey, JSON.stringify(store));
    return String(newRow[idField]);
  }
}

export function localDemoRemove(table: string, idField: string, id: string, mosqueId = ''): void {
  const store = getStore();
  const rows = store[table] ?? [];
  const target = rows.find((row) => String(row[idField]) === id);
  if (!target) throw new Error('The selected demo record no longer exists.');
  if (table !== 'mosque_registrations' && mosqueId && String(target.mosque_id ?? '') !== mosqueId) {
    throw new Error('This record no longer belongs to the selected mosque.');
  }
  store[table] = rows.filter((row) => String(row[idField]) !== id);
  localStorage.setItem(storageKey, JSON.stringify(store));
}

export function localDemoImportAdministrativeAreas(rows: DbRow[]): number {
  const store = getStore();
  const areas = [...(store.administrative_areas ?? [])];
  const types = ['country', 'province', 'division', 'district', 'tehsil', 'town', 'union_council'];
  const parentTypes: Record<string, string[]> = {
    country: [],
    province: ['country'],
    division: ['province'],
    district: ['division'],
    tehsil: ['district'],
    town: ['tehsil'],
    union_council: ['tehsil', 'town'],
  };
  const fullPath = (area: DbRow) => {
    const parts = [String(area.name_en)];
    let parentId = area.parent_id == null ? null : String(area.parent_id);
    while (parentId) {
      const parent = areas.find((item) => String(item.id) === parentId);
      if (!parent) break;
      parts.unshift(String(parent.name_en));
      parentId = parent.parent_id == null ? null : String(parent.parent_id);
    }
    return parts.join(' / ');
  };
  let inserted = 0;
  for (const type of types) {
    for (const row of rows.filter((item) => item.level === type)) {
      const name = String(row.name_en ?? '').trim();
      const line = String(row.line_number ?? '?');
      if (!name) throw new Error(`CSV row ${line}: English name is required.`);
      let parentId: string | null = null;
      if (type !== 'country') {
        const parentType = String(row.parent_level ?? '').toLowerCase();
        const parentPath = String(row.parent_path ?? '').trim().toLowerCase();
        if (!parentTypes[type].includes(parentType) || !parentPath) {
          throw new Error(`CSV row ${line}: enter a valid parent level and full parent path.`);
        }
        const parents = areas.filter((area) => String(area.area_type) === parentType && fullPath(area).toLowerCase() === parentPath);
        if (parents.length !== 1) throw new Error(`CSV row ${line}: parent path must match exactly one existing or imported area.`);
        parentId = String(parents[0].id);
      }
      const existing = areas.some((area) => String(area.area_type) === type
        && (area.parent_id == null ? null : String(area.parent_id)) === parentId
        && String(area.name_en).toLocaleLowerCase() === name.toLocaleLowerCase());
      if (existing) continue;
      const id = uuid(8000 + areas.length + inserted);
      areas.push({
        id, parent_id: parentId, area_type: type, name_en: name,
        name_ur: String(row.name_ur ?? '').trim() || null,
        code: String(row.code ?? '').trim() || null,
        source_note: String(row.source_note ?? '').trim() || null,
        seeded: false,
      });
      inserted += 1;
    }
  }
  store.administrative_areas = areas;
  localStorage.setItem(storageKey, JSON.stringify(store));
  return inserted;
}

export function localDemoCreateBankTransfer(input: {
  from_account_id: string; to_account_id: string; amount: number; transaction_date: string; description: string;
}): void {
  const store = getStore();
  const fromAccount = (store.bank_accounts ?? []).find((account) => account.id === input.from_account_id);
  const toAccount = (store.bank_accounts ?? []).find((account) => account.id === input.to_account_id);
  if (!fromAccount || !toAccount || fromAccount.id === toAccount.id
    || fromAccount.account_type !== 'mosque' || toAccount.account_type !== 'mosque'
    || !fromAccount.active || !toAccount.active) {
    throw new Error('Choose two different active mosque bank accounts.');
  }
  const rows = store.bank_transactions ?? [];
  const group = uuid(Object.values(store).reduce((sum, items) => sum + items.length, 0) + 1);
  for (const [account, entry_type] of [
    [fromAccount, 'withdrawal'],
    [toAccount, 'deposit'],
  ] as const) {
    rows.unshift({
      id: uuid(Object.values(store).reduce((sum, items) => sum + items.length, 0) + 2),
      mosque_id: account.mosque_id,
      bank_account_id: account.id,
      entry_type,
      category: 'transfer',
      description: input.description,
      amount: input.amount,
      transaction_date: input.transaction_date,
      reference: group,
      transfer_group_id: group,
      created_at: new Date().toISOString(),
    });
  }
  store.bank_transactions = rows;
  localStorage.setItem(storageKey, JSON.stringify(store));
}

export function localDemoCreateBankReconciliation(input: {
  bank_account_id: string;
  period_start: string;
  period_end: string;
  statement_opening_balance: number;
  statement_closing_balance: number;
}): string {
  const store = getStore();
  const id = uuid(Object.values(store).reduce((sum, items) => sum + items.length, 0) + 1);
  const account = (store.bank_accounts ?? []).find((row) => row.id === input.bank_account_id);
  if (!account) throw new Error('Choose a bank account belonging to a registered mosque.');
  store.bank_reconciliations.unshift({
    id, ...input, mosque_id: account.mosque_id, status: 'in_progress', created_at: new Date().toISOString(),
  });
  localStorage.setItem(storageKey, JSON.stringify(store));
  return id;
}

export function localDemoImportBankStatementLines(
  reconciliationId: string,
  lines: { transaction_date: string; description: string; amount: number; reference: string | null }[],
): void {
  const store = getStore();
  const reconciliation = (store.bank_reconciliations ?? []).find((row) => row.id === reconciliationId);
  if (!reconciliation || reconciliation.status !== 'in_progress') throw new Error('Choose an open bank reconciliation.');
  const rows = store.bank_statement_lines ?? [];
  for (const line of lines) {
    const duplicate = rows.some((row) => row.reconciliation_id === reconciliationId
      && row.transaction_date === line.transaction_date
      && Number(row.amount) === line.amount
      && row.reference === line.reference
      && row.description === line.description);
    if (duplicate) throw new Error('This statement already contains a duplicate line. Nothing was imported.');
  }
  const importedRows: DbRow[] = lines.map((line, index) => ({
    id: uuid(Object.values(store).reduce((sum, items) => sum + items.length, 0) + index + 1),
    mosque_id: reconciliation.mosque_id,
    reconciliation_id: reconciliationId,
    ...line,
    matched_transaction_id: null,
  }));
  store.bank_statement_lines = [...importedRows, ...rows];
  localStorage.setItem(storageKey, JSON.stringify(store));
}

export function localDemoMatchBankStatementLine(statementLineId: string, transactionId: string): void {
  const store = getStore();
  const line = (store.bank_statement_lines ?? []).find((row) => row.id === statementLineId);
  const transaction = (store.bank_transactions ?? []).find((row) => row.id === transactionId);
  const reconciliation = (store.bank_reconciliations ?? []).find((row) => row.id === line?.reconciliation_id);
  if (!line || !transaction || !reconciliation || reconciliation.status !== 'in_progress' || line.matched_transaction_id) {
    throw new Error('The statement line or transaction cannot be matched.');
  }
  const signedAmount = transaction.entry_type === 'deposit' ? Number(transaction.amount) : -Number(transaction.amount);
  if (transaction.bank_account_id !== reconciliation.bank_account_id
    || signedAmount !== Number(line.amount)
    || transaction.transaction_date !== line.transaction_date
    || (store.bank_statement_lines ?? []).some((row) => row.matched_transaction_id === transactionId)) {
    throw new Error('The account, date and signed amount must match, and each transaction can only be matched once.');
  }
  line.matched_transaction_id = transactionId;
  localStorage.setItem(storageKey, JSON.stringify(store));
}

export function localDemoCompleteBankReconciliation(reconciliationId: string): void {
  const store = getStore();
  const reconciliation = (store.bank_reconciliations ?? []).find((row) => row.id === reconciliationId);
  const lines = (store.bank_statement_lines ?? []).filter((row) => row.reconciliation_id === reconciliationId);
  if (!reconciliation || reconciliation.status !== 'in_progress' || !lines.length || lines.some((row) => !row.matched_transaction_id)) {
    throw new Error('Match every statement line before completing reconciliation.');
  }
  const closing = Number(reconciliation.statement_opening_balance)
    + lines.reduce((sum, line) => sum + Number(line.amount), 0);
  if (Math.abs(closing - Number(reconciliation.statement_closing_balance)) > 0.01) {
    throw new Error('The statement lines do not add up to the closing balance.');
  }
  reconciliation.status = 'completed';
  reconciliation.completed_at = new Date().toISOString();
  localStorage.setItem(storageKey, JSON.stringify(store));
}

export function localDemoDashboard(mosqueId: string): MosqueSummary {
  const store = getStore();
  const transactions = (store.financial_transactions ?? []).filter((row) => row.mosque_id === mosqueId);
  const donations = (store.donations ?? []).filter((row) => row.mosque_id === mosqueId);
  const properties = (store.rental_properties ?? []).filter((row) => row.mosque_id === mosqueId);
  const programs = (store.community_programs ?? []).filter((row) => row.mosque_id === mosqueId);
  const month = today.toISOString().slice(0, 7);
  const currentTransactions = transactions.filter((row) => String(row.entry_date).startsWith(month));
  const sumType = (rows: DbRow[], type: string) => rows.filter((row) => row.entry_type === type).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  return {
    incomeThisMonth: sumType(currentTransactions, 'income') + donations.filter((row) => String(row.donation_date).startsWith(month)).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    expensesThisMonth: sumType(currentTransactions, 'expense'),
    outstandingRent: rentDueRows(store).reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0),
    occupiedProperties: properties.filter((row) => row.status === 'occupied').length,
    totalProperties: properties.length,
    worshipperCount: (store.worshippers ?? []).filter((row) => row.mosque_id === mosqueId).length,
    donationsThisMonth: donations.filter((row) => String(row.donation_date).startsWith(month)).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    prayerAttendanceToday: (store.prayer_attendance ?? []).filter((row) => row.mosque_id === mosqueId).reduce((sum, row) => sum + Number(row.attendee_count ?? 0), 0),
    todayPrayerTimes: (store.prayer_schedules ?? []).filter((row) => row.mosque_id === mosqueId).map((row) => ({ prayer_name: String(row.prayer_name), jamaat_time: String(row.jamaat_time) })),
    monthlyTrend: Array.from({ length: 6 }, (_, index) => ({ month: new Date(today.getFullYear(), today.getMonth() - 5 + index, 1).toLocaleString('en', { month: 'short' }), income: 25000 + index * 5000, expenses: 12000 + index * 2500 })),
    recentTransactions: transactions.slice(0, 5).map((row) => ({
      id: String(row.id), entry_type: row.entry_type as 'income' | 'expense', category: String(row.category),
      amount: Number(row.amount), entry_date: String(row.entry_date), description: String(row.description ?? ''),
    })),
    upcomingPrograms: programs.slice(0, 5).map((row) => ({
      id: String(row.id), name: String(row.name), starts_at: String(row.starts_at), program_type: String(row.program_type),
    })),
  };
}
