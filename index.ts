import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const allowedRoles = new Set(['imam', 'committee', 'worshipper']);

type MemberRole = 'imam' | 'committee' | 'worshipper';
type MemberRow = {
  member_number: string;
  full_name: string;
  email: string;
  role: MemberRole;
  status: 'pending' | 'invited' | 'active' | 'error';
  auth_user_id: string | null;
};
type MemberInput = Record<string, unknown> & { mosque_id?: string };

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, { error: 'The account service is missing its Supabase configuration.' });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return response(401, { error: 'Sign in as an administrator.' });

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return response(401, { error: 'Your session is invalid or expired. Sign in again.' });
  if (callerData.user.app_metadata.role !== 'admin') {
    return response(403, { error: 'Only a trusted administrator can manage member accounts.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let input: MemberInput;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return response(400, { error: 'Invalid request body.' });
    }
    input = body as Record<string, unknown>;
  } catch {
    return response(400, { error: 'Invalid JSON request body.' });
  }

  if (input.action === 'list') {
    const mosqueId = typeof input.mosque_id === 'string' ? input.mosque_id : '';
    if (!mosqueId) return response(400, { error: 'Select a registered mosque.' });
    const { data: rows, error } = await adminClient
      .from('masjid_member_accounts')
      .select('member_number, full_name, email, role, status, auth_user_id')
      .eq('mosque_id', mosqueId)
      .order('member_number');
    if (error) return response(500, { error: `Could not load member accounts: ${error.message}` });

    const members: Omit<MemberRow, 'auth_user_id'>[] = [];
    for (const row of rows as MemberRow[]) {
      if (!row.auth_user_id) {
        const { auth_user_id: _, ...member } = row;
        members.push(member);
        continue;
      }
      const { data, error: userError } = await adminClient.auth.admin.getUserById(row.auth_user_id);
      if (userError) return response(500, { error: `Could not check the invitation for ${row.email}: ${userError.message}` });
      const { auth_user_id: _, ...member } = row;
      members.push({ ...member, status: data.user.email_confirmed_at ? 'active' : row.status });
    }
    return response(200, { members });
  }

  if (input.action !== 'invite') return response(400, { error: 'Unknown account action.' });
  const fullName = typeof input.full_name === 'string' ? input.full_name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const role = input.role;
  if (!fullName || fullName.length > 100) return response(400, { error: 'Enter a name between 1 and 100 characters.' });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response(400, { error: 'Enter a valid email address.' });
  }
  if (typeof role !== 'string' || !allowedRoles.has(role)) {
    return response(400, { error: 'Choose Imam, committee, or worshipper. Elevated roles cannot be assigned here.' });
  }
  const mosqueId = typeof input.mosque_id === 'string' ? input.mosque_id : '';
  if (!mosqueId) return response(400, { error: 'Select a registered mosque.' });
  const { data: mosque, error: mosqueError } = await adminClient
    .from('mosque_registrations').select('id').eq('id', mosqueId).maybeSingle();
  if (mosqueError) return response(500, { error: `Could not verify the selected mosque: ${mosqueError.message}` });
  if (!mosque) return response(400, { error: 'The selected mosque is not registered.' });

  const { data: existing, error: listError } = await adminClient
    .from('masjid_member_accounts')
    .select('member_number')
    .order('member_number');
  if (listError) return response(500, { error: `Could not reserve a user number: ${listError.message}` });
  const used = new Set(existing.map((row) => row.member_number));
  const slot = Array.from({ length: 9 }, (_, index) => `USER-${String(index + 1).padStart(3, '0')}`)
    .find((number) => !used.has(number));
  if (!slot) return response(409, { error: 'All nine member numbers, USER-001 through USER-009, are assigned.' });

  const { error: reserveError } = await adminClient.from('masjid_member_accounts').insert({
    member_number: slot,
    full_name: fullName,
    email,
    role: role as MemberRole,
    status: 'pending',
    mosque_id: mosqueId,
  });
  if (reserveError) {
    const message = reserveError.code === '23505'
      ? 'This email or user number was just assigned. Refresh the list and try again.'
      : `Could not reserve ${slot}: ${reserveError.message}`;
    return response(reserveError.code === '23505' ? 409 : 500, { error: message });
  }

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });
  if (inviteError || !inviteData.user) {
    const { error: cleanupError } = await adminClient.from('masjid_member_accounts').delete().eq('member_number', slot);
    if (cleanupError) {
      return response(500, { error: `Invite failed (${inviteError?.message ?? 'no user returned'}) and the reserved number could not be released: ${cleanupError.message}` });
    }
    return response(400, { error: `Could not send the invitation: ${inviteError?.message ?? 'Supabase returned no user.'}` });
  }

  const { error: roleError } = await adminClient.auth.admin.updateUserById(inviteData.user.id, {
    app_metadata: { role },
  });
  if (roleError) {
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(inviteData.user.id);
    if (deleteUserError) {
      const { error: recordError } = await adminClient.from('masjid_member_accounts').update({
        auth_user_id: inviteData.user.id,
        status: 'error',
      }).eq('member_number', slot);
      return response(500, { error: `Could not assign the account role (${roleError.message}); the invited user could not be removed (${deleteUserError.message}).${recordError ? ` The account record also could not be updated (${recordError.message}).` : ''} Contact your Supabase administrator before retrying.` });
    }
    const { error: reservationError } = await adminClient.from('masjid_member_accounts').delete().eq('member_number', slot);
    return response(500, { error: `Could not assign the account role: ${roleError.message}. The incomplete Auth account was removed.${reservationError ? ` The reserved number could not be released (${reservationError.message}).` : ''}` });
  }

  let worshipperId: string | null = null;
  if (role === 'worshipper') {
    const { data: worshipper, error: worshipperError } = await adminClient
      .from('worshippers')
      .insert({
        user_id: inviteData.user.id,
        mosque_id: mosqueId,
        full_name: fullName,
        family_size: 1,
        contact_consent: false,
        status: 'active',
      })
      .select('id')
      .single();
    if (worshipperError) {
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(inviteData.user.id);
      if (deleteUserError) {
        const { error: recordError } = await adminClient.from('masjid_member_accounts').update({
          auth_user_id: inviteData.user.id,
          status: 'error',
        }).eq('member_number', slot);
        return response(500, { error: `Could not create the linked worshipper profile (${worshipperError.message}), and cleanup failed (${deleteUserError.message}).${recordError ? ` The account record also could not be updated (${recordError.message}).` : ''} Contact your Supabase administrator.` });
      }
      const { error: reservationError } = await adminClient.from('masjid_member_accounts').delete().eq('member_number', slot);
      return response(500, { error: `Could not create the linked worshipper profile: ${worshipperError.message}. The incomplete Auth account was removed.${reservationError ? ` The reserved number could not be released (${reservationError.message}).` : ''}` });
    }
    worshipperId = worshipper.id;
  }

  const { error: linkError } = await adminClient.from('masjid_member_accounts').update({
    auth_user_id: inviteData.user.id,
    worshipper_id: worshipperId,
    status: 'invited',
  }).eq('member_number', slot);
  if (linkError) {
    const { error: deleteWorshipperError } = worshipperId
      ? await adminClient.from('worshippers').delete().eq('id', worshipperId)
      : { error: null };
    if (deleteWorshipperError) {
      const { error: recordError } = await adminClient.from('masjid_member_accounts').update({
        auth_user_id: inviteData.user.id,
        worshipper_id: worshipperId,
        status: 'error',
      }).eq('member_number', slot);
      return response(500, { error: `Could not save the invitation record (${linkError.message}) or remove its worshipper profile (${deleteWorshipperError.message}).${recordError ? ` The account record also could not be updated (${recordError.message}).` : ''} Contact your Supabase administrator.` });
    }
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(inviteData.user.id);
    if (deleteUserError) {
      const { error: recordError } = await adminClient.from('masjid_member_accounts').update({
        auth_user_id: inviteData.user.id,
        worshipper_id: worshipperId,
        status: 'error',
      }).eq('member_number', slot);
      return response(500, { error: `The invitation was sent but its account record could not be saved (${linkError.message}), and cleanup failed (${deleteUserError.message}).${recordError ? ` The account record also could not be updated (${recordError.message}).` : ''} Contact your Supabase administrator.` });
    }
    const { error: reservationError } = await adminClient.from('masjid_member_accounts').delete().eq('member_number', slot);
    return response(500, { error: `Could not save the invitation record: ${linkError.message}. The incomplete Auth account was removed.${reservationError ? ` The reserved number could not be released (${reservationError.message}).` : ''}` });
  }

  return response(200, {
    member: {
      member_number: slot,
      full_name: fullName,
      email,
      role,
      status: 'invited',
    },
  });
});
