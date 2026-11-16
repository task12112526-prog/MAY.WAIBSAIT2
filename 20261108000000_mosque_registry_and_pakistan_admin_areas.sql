begin;

create table public.administrative_areas (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.administrative_areas(id) on delete restrict,
  area_type text not null check (area_type in (
    'country', 'province', 'division', 'district', 'tehsil', 'town', 'union_council'
  )),
  name_en text not null check (length(btrim(name_en)) between 1 and 160),
  name_ur text check (name_ur is null or length(btrim(name_ur)) between 1 and 160),
  code text,
  source_note text check (source_note is null or length(source_note) <= 500),
  seeded boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index administrative_areas_sibling_name_idx
  on public.administrative_areas(coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), area_type, lower(name_en));
create index administrative_areas_parent_type_idx on public.administrative_areas(parent_id, area_type, name_en);

create or replace function public.validate_administrative_area()
returns trigger
language plpgsql
set search_path = ''
as $$
declare parent_type text;
begin
  if tg_op = 'UPDATE' and new.area_type is distinct from old.area_type then
    raise exception 'An administrative area type cannot be changed after creation.';
  end if;

  if new.area_type = 'country' then
    if new.parent_id is not null then
      raise exception 'A country cannot have a parent area.';
    end if;
  else
    select area_type into parent_type
      from public.administrative_areas where id = new.parent_id;
    if not found or not (
      (new.area_type = 'province' and parent_type = 'country')
      or (new.area_type = 'division' and parent_type = 'province')
      or (new.area_type = 'district' and parent_type = 'division')
      or (new.area_type = 'tehsil' and parent_type = 'district')
      or (new.area_type = 'town' and parent_type = 'tehsil')
      or (new.area_type = 'union_council' and parent_type in ('tehsil', 'town'))
    ) then
      raise exception 'Choose the correct parent level for this administrative area.';
    end if;
  end if;
  return new;
end;
$$;

create trigger administrative_areas_validate
before insert or update on public.administrative_areas
for each row execute function public.validate_administrative_area();

create or replace function public.import_pakistan_admin_areas(p_areas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  area_type_value text;
  area_record jsonb;
  area_name text;
  parent_type text;
  parent_path text;
  v_parent_id uuid;
  v_area_id uuid;
  v_parent_count integer;
  imported_count integer := 0;
begin
  if auth.uid() is null or not public.has_masjid_role(array['admin', 'mosque_manager']) then
    raise exception 'You are not allowed to import administrative areas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_areas) is distinct from 'array' then
    raise exception 'Provide an array of administrative area rows.';
  end if;
  if jsonb_array_length(p_areas) = 0 or jsonb_array_length(p_areas) > 20000 then
    raise exception 'Provide between 1 and 20,000 administrative area rows.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_areas) as parsed(item)
    where coalesce(lower(btrim(item ->> 'level')), '') not in (
      'country', 'province', 'division', 'district', 'tehsil', 'town', 'union_council'
    )
  ) then
    raise exception 'CSV levels must be country, province, division, district, tehsil, town or union_council.';
  end if;

  foreach area_type_value in array array[
    'country', 'province', 'division', 'district', 'tehsil', 'town', 'union_council'
  ] loop
    for area_record in
      select parsed.item from jsonb_array_elements(p_areas) as parsed(item)
      where lower(btrim(item ->> 'level')) = area_type_value
    loop
      area_name := nullif(btrim(area_record ->> 'name_en'), '');
      if area_name is null then
        raise exception 'Each imported area requires an English name.';
      end if;

      v_parent_id := null;
      if area_type_value <> 'country' then
        parent_type := lower(btrim(area_record ->> 'parent_level'));
        parent_path := nullif(btrim(area_record ->> 'parent_path'), '');
        if parent_path is null or not (
          (area_type_value = 'province' and parent_type = 'country')
          or (area_type_value = 'division' and parent_type = 'province')
          or (area_type_value = 'district' and parent_type = 'division')
          or (area_type_value = 'tehsil' and parent_type = 'district')
          or (area_type_value = 'town' and parent_type = 'tehsil')
          or (area_type_value = 'union_council' and parent_type in ('tehsil', 'town'))
        ) then
          raise exception 'Each non-country row needs a valid parent_level and full English parent_path.';
        end if;

        with recursive area_chain(candidate_id, id, parent_id, name_en, full_path) as (
          select candidate.id, candidate.id, candidate.parent_id, candidate.name_en, candidate.name_en
          from public.administrative_areas candidate
          where candidate.area_type = parent_type
          union all
          select chain.candidate_id, ancestor.id, ancestor.parent_id, ancestor.name_en,
            ancestor.name_en || ' / ' || chain.full_path
          from area_chain chain
          join public.administrative_areas ancestor on ancestor.id = chain.parent_id
        )
        select count(distinct candidate_id), (array_agg(distinct candidate_id))[1]
          into v_parent_count, v_parent_id
          from area_chain
          where area_chain.parent_id is null and lower(area_chain.full_path) = lower(parent_path);
        if v_parent_count <> 1 then
          raise exception 'Parent path "%" for area "%" matched % rows; import parent areas first and use their full English path.',
            parent_path, area_name, v_parent_count;
        end if;
      end if;

      insert into public.administrative_areas(
        parent_id, area_type, name_en, name_ur, code, source_note
      ) values (
        v_parent_id, area_type_value, area_name,
        nullif(btrim(area_record ->> 'name_ur'), ''),
        nullif(btrim(area_record ->> 'code'), ''),
        nullif(btrim(area_record ->> 'source_note'), '')
      )
      on conflict do nothing
      returning id into v_area_id;

      if v_area_id is not null then
        imported_count := imported_count + 1;
      else
        select existing.id into v_area_id
          from public.administrative_areas existing
          where existing.parent_id is not distinct from v_parent_id
            and existing.area_type = area_type_value and lower(existing.name_en) = lower(area_name);
        if v_area_id is null then
          raise exception 'Area "%" could not be inserted or matched to an existing row.', area_name;
        end if;
      end if;
    end loop;
  end loop;
  return imported_count;
end;
$$;

insert into public.administrative_areas(area_type, name_en, name_ur, code, source_note, seeded)
select 'country', 'Pakistan', 'پاکستان', 'PK', 'Country and first-level units are starter records; lower-level boundaries need locally verified data.', true
where not exists (
  select 1 from public.administrative_areas where area_type = 'country' and code = 'PK'
);

insert into public.administrative_areas(parent_id, area_type, name_en, name_ur, code, source_note, seeded)
select country.id, 'province', unit.name_en, unit.name_ur, unit.code,
  'Starter administrative unit. Verify current official boundaries before operational use.', true
from public.administrative_areas country
cross join (values
  ('Punjab', 'پنجاب', 'PK-PB'),
  ('Sindh', 'سندھ', 'PK-SD'),
  ('Khyber Pakhtunkhwa', 'خیبر پختونخوا', 'PK-KP'),
  ('Balochistan', 'بلوچستان', 'PK-BA'),
  ('Islamabad Capital Territory', 'اسلام آباد وفاقی علاقہ', 'PK-IS'),
  ('Gilgit-Baltistan', 'گلگت بلتستان', 'PK-GB'),
  ('Azad Jammu and Kashmir', 'آزاد جموں و کشمیر', 'PK-JK')
) as unit(name_en, name_ur, code)
where country.area_type = 'country' and country.code = 'PK'
  and not exists (
    select 1 from public.administrative_areas existing
    where existing.parent_id = country.id and existing.code = unit.code
  );

create table public.mosque_registrations (
  id uuid primary key default gen_random_uuid(),
  registration_number text unique,
  name text not null check (length(btrim(name)) between 1 and 180),
  administrative_area_id uuid not null references public.administrative_areas(id) on delete restrict,
  imam_staff_id uuid references public.staff_members(id) on delete set null,
  address text,
  registered_on date,
  registration_authority text,
  land_area numeric(14,2) check (land_area is null or land_area >= 0),
  land_area_unit text check (land_area_unit is null or land_area_unit in ('sqft', 'sqm', 'marla', 'kanal', 'acre')),
  built_up_area numeric(14,2) check (built_up_area is null or built_up_area >= 0),
  built_up_area_unit text check (built_up_area_unit is null or built_up_area_unit in ('sqft', 'sqm', 'marla', 'kanal', 'acre')),
  facilities jsonb not null default '{}'::jsonb check (jsonb_typeof(facilities) = 'object'),
  contact_name text,
  contact_phone text,
  status text not null default 'active' check (status in ('active', 'inactive', 'under_construction')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mosque_registrations_area_idx on public.mosque_registrations(administrative_area_id, name);
create index mosque_registrations_search_idx on public.mosque_registrations using gin (name public.gin_trgm_ops);

create or replace function public.validate_mosque_facilities()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  facility_key text;
  detail jsonb;
begin
  foreach facility_key in array array[
    'prayer_halls', 'wudu_areas', 'washrooms', 'cameras', 'residential_rooms',
    'classrooms', 'offices', 'parking', 'other'
  ] loop
    detail := new.facilities -> facility_key;
    if detail is null or jsonb_typeof(detail) is distinct from 'object'
      or jsonb_typeof(detail -> 'count') is distinct from 'number'
      or coalesce(detail ->> 'condition' not in ('available', 'needs_repair', 'not_operational', 'not_available'), true)
      or coalesce(length(detail ->> 'note'), 0) > 500 then
      raise exception 'Enter a whole non-negative facility count, a valid condition and a note of at most 500 characters for every facility.';
    end if;
    if (detail ->> 'count')::numeric < 0
      or trunc((detail ->> 'count')::numeric) <> (detail ->> 'count')::numeric then
      raise exception 'Facility counts must be whole non-negative numbers.';
    end if;
  end loop;
  return new;
end;
$$;

create trigger mosque_registrations_validate_facilities
before insert or update on public.mosque_registrations
for each row execute function public.validate_mosque_facilities();

create or replace function public.set_mosque_registration_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger mosque_registrations_set_updated_at
before update on public.mosque_registrations
for each row execute function public.set_mosque_registration_updated_at();

alter table public.administrative_areas enable row level security;
alter table public.mosque_registrations enable row level security;

revoke all on public.administrative_areas, public.mosque_registrations from public, anon;
grant select, insert, update, delete on public.administrative_areas, public.mosque_registrations to authenticated;
revoke all on function public.import_pakistan_admin_areas(jsonb) from public, anon;
grant execute on function public.import_pakistan_admin_areas(jsonb) to authenticated;

create policy administrative_areas_read on public.administrative_areas for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy administrative_areas_manage on public.administrative_areas for insert to authenticated
with check (public.has_masjid_role(array['admin', 'mosque_manager']) and created_by = auth.uid());
create policy administrative_areas_update on public.administrative_areas for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy administrative_areas_delete on public.administrative_areas for delete to authenticated
using (public.has_masjid_role(array['admin']));

create policy mosque_registrations_read on public.mosque_registrations for select to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy mosque_registrations_create on public.mosque_registrations for insert to authenticated
with check (public.has_masjid_role(array['admin', 'mosque_manager']) and created_by = auth.uid());
create policy mosque_registrations_update on public.mosque_registrations for update to authenticated
using (public.has_masjid_role(array['admin', 'mosque_manager']))
with check (public.has_masjid_role(array['admin', 'mosque_manager']));
create policy mosque_registrations_delete on public.mosque_registrations for delete to authenticated
using (public.has_masjid_role(array['admin']));

commit;
