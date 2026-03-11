create extension if not exists pgcrypto;

create type public.project_type as enum ('stock_check', 'loading_check');
create type public.item_status as enum ('not_scanned', 'scanned');
create type public.scan_result_type as enum ('matched', 'already_scanned', 'not_found', 'manual_mark');

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'operator' check (role in ('owner', 'manager', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  project_type public.project_type not null,
  description text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.imported_sheets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  original_filename text not null,
  storage_path text,
  sheet_name text not null,
  reference_column text not null,
  mapping_json jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  imported_by uuid not null references public.profiles (id)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sheet_id uuid not null references public.imported_sheets (id) on delete cascade,
  row_number integer not null,
  system_barcode_id text not null,
  client_reference text not null,
  item_name text,
  title text,
  quantity numeric,
  location text,
  notes text,
  client text,
  consignee text,
  vehicle_route_reference text,
  full_row_json jsonb not null default '{}'::jsonb,
  status public.item_status not null default 'not_scanned',
  scanned_at timestamptz,
  scanned_by uuid references public.profiles (id),
  is_duplicate_reference boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, system_barcode_id)
);

create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  item_id uuid references public.items (id) on delete set null,
  scanned_barcode text not null,
  result_type public.scan_result_type not null,
  scanned_at timestamptz not null default now(),
  scanned_by uuid references public.profiles (id),
  device_info text
);

create index if not exists idx_projects_org on public.projects (organization_id);
create index if not exists idx_imported_sheets_project on public.imported_sheets (project_id);
create index if not exists idx_items_project on public.items (project_id);
create index if not exists idx_items_status on public.items (project_id, status);
create index if not exists idx_items_client_reference on public.items (project_id, client_reference);
create index if not exists idx_scan_logs_project on public.scan_logs (project_id, scanned_at desc);

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do update set email = excluded.email;

  insert into public.organizations (name, created_by)
  values (coalesce(new.raw_user_meta_data ->> 'company', 'Default Warehouse'), new.id)
  returning id into v_org_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner')
  on conflict (organization_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

create or replace function public.build_system_barcode_id(p_project_id uuid, p_row_number integer)
returns text
language sql
immutable
as $$
  select 'PRJ'
    || upper(substring(replace(p_project_id::text, '-', '') from 1 for 6))
    || '-'
    || lpad(p_row_number::text, 6, '0');
$$;

create or replace function public.process_scan(
  p_project_id uuid,
  p_scanned_barcode text,
  p_user_id uuid default auth.uid(),
  p_device_info text default null,
  p_manual_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items%rowtype;
  v_result public.scan_result_type;
  v_effective_user uuid := coalesce(p_user_id, auth.uid());
  v_now timestamptz := now();
begin
  if not exists (
    select 1
    from public.projects p
    join public.organization_memberships m
      on m.organization_id = p.organization_id
    where p.id = p_project_id
      and m.user_id = v_effective_user
  ) then
    raise exception 'forbidden';
  end if;

  if p_manual_item_id is not null then
    select *
    into v_item
    from public.items
    where id = p_manual_item_id
      and project_id = p_project_id
    for update;

    if not found then
      insert into public.scan_logs (
        project_id,
        item_id,
        scanned_barcode,
        result_type,
        scanned_by,
        device_info
      )
      values (
        p_project_id,
        null,
        p_scanned_barcode,
        'not_found',
        v_effective_user,
        p_device_info
      );

      return jsonb_build_object(
        'result_type', 'not_found',
        'message', 'Item not found for manual mark'
      );
    end if;

    if v_item.status = 'scanned' then
      insert into public.scan_logs (
        project_id,
        item_id,
        scanned_barcode,
        result_type,
        scanned_by,
        device_info
      )
      values (
        p_project_id,
        v_item.id,
        p_scanned_barcode,
        'already_scanned',
        v_effective_user,
        p_device_info
      );

      return jsonb_build_object(
        'result_type', 'already_scanned',
        'item_id', v_item.id,
        'client_reference', v_item.client_reference,
        'item_name', v_item.item_name,
        'title', v_item.title,
        'scanned_at', v_item.scanned_at
      );
    end if;

    update public.items
    set status = 'scanned',
        scanned_at = v_now,
        scanned_by = v_effective_user
    where id = v_item.id;

    insert into public.scan_logs (
      project_id,
      item_id,
      scanned_barcode,
      result_type,
      scanned_by,
      device_info
    )
    values (
      p_project_id,
      v_item.id,
      p_scanned_barcode,
      'manual_mark',
      v_effective_user,
      p_device_info
    );

    return jsonb_build_object(
      'result_type', 'manual_mark',
      'item_id', v_item.id,
      'client_reference', v_item.client_reference,
      'item_name', v_item.item_name,
      'title', v_item.title,
      'scanned_at', v_now
    );
  end if;

  select *
  into v_item
  from public.items
  where project_id = p_project_id
    and system_barcode_id = p_scanned_barcode
  for update;

  if not found then
    insert into public.scan_logs (
      project_id,
      item_id,
      scanned_barcode,
      result_type,
      scanned_by,
      device_info
    )
    values (
      p_project_id,
      null,
      p_scanned_barcode,
      'not_found',
      v_effective_user,
      p_device_info
    );

    return jsonb_build_object(
      'result_type', 'not_found',
      'message', 'Barcode not found'
    );
  end if;

  if v_item.status = 'scanned' then
    v_result := 'already_scanned';

    insert into public.scan_logs (
      project_id,
      item_id,
      scanned_barcode,
      result_type,
      scanned_by,
      device_info
    )
    values (
      p_project_id,
      v_item.id,
      p_scanned_barcode,
      v_result,
      v_effective_user,
      p_device_info
    );

    return jsonb_build_object(
      'result_type', v_result,
      'item_id', v_item.id,
      'client_reference', v_item.client_reference,
      'item_name', v_item.item_name,
      'title', v_item.title,
      'scanned_at', v_item.scanned_at
    );
  end if;

  update public.items
  set status = 'scanned',
      scanned_at = v_now,
      scanned_by = v_effective_user
  where id = v_item.id;

  v_result := 'matched';

  insert into public.scan_logs (
    project_id,
    item_id,
    scanned_barcode,
    result_type,
    scanned_by,
    device_info
  )
  values (
    p_project_id,
    v_item.id,
    p_scanned_barcode,
    v_result,
    v_effective_user,
    p_device_info
  );

  return jsonb_build_object(
    'result_type', v_result,
    'item_id', v_item.id,
    'client_reference', v_item.client_reference,
    'item_name', v_item.item_name,
    'title', v_item.title,
    'scanned_at', v_now
  );
end;
$$;

create or replace view public.project_progress as
select
  p.id as project_id,
  count(i.id)::integer as total_items,
  count(i.id) filter (where i.status = 'scanned')::integer as scanned_items,
  count(i.id) filter (where i.status = 'not_scanned')::integer as missing_items,
  round(
    case
      when count(i.id) = 0 then 0
      else (count(i.id) filter (where i.status = 'scanned')::numeric / count(i.id)::numeric) * 100
    end,
    2
  ) as completion_percentage,
  count(i.id) filter (where i.is_duplicate_reference = true)::integer as duplicate_items,
  (
    select count(*)::integer
    from public.scan_logs sl
    where sl.project_id = p.id
      and sl.result_type = 'not_found'
  ) as unknown_scans
from public.projects p
left join public.items i on i.project_id = p.id
group by p.id;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.imported_sheets enable row level security;
alter table public.items enable row level security;
alter table public.scan_logs enable row level security;

create policy "Users can read own profile"
on public.profiles
for select
using (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "Members can read organizations"
on public.organizations
for select
using (public.is_org_member(id));

create policy "Members can read memberships"
on public.organization_memberships
for select
using (user_id = auth.uid() or public.is_org_member(organization_id));

create policy "Members can read projects"
on public.projects
for select
using (public.is_org_member(organization_id));

create policy "Members can insert projects"
on public.projects
for insert
with check (public.is_org_member(organization_id) and created_by = auth.uid());

create policy "Members can update projects"
on public.projects
for update
using (public.is_org_member(organization_id));

create policy "Members can delete projects"
on public.projects
for delete
using (public.is_org_member(organization_id));

create policy "Members can read imported sheets"
on public.imported_sheets
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = imported_sheets.project_id
      and public.is_org_member(p.organization_id)
  )
);

create policy "Members can insert imported sheets"
on public.imported_sheets
for insert
with check (
  imported_by = auth.uid()
  and exists (
    select 1
    from public.projects p
    where p.id = imported_sheets.project_id
      and public.is_org_member(p.organization_id)
  )
);

create policy "Members can read items"
on public.items
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = items.project_id
      and public.is_org_member(p.organization_id)
  )
);

create policy "Members can insert items"
on public.items
for insert
with check (
  exists (
    select 1
    from public.projects p
    where p.id = items.project_id
      and public.is_org_member(p.organization_id)
  )
);

create policy "Members can update items"
on public.items
for update
using (
  exists (
    select 1
    from public.projects p
    where p.id = items.project_id
      and public.is_org_member(p.organization_id)
  )
);

create policy "Members can read scan logs"
on public.scan_logs
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = scan_logs.project_id
      and public.is_org_member(p.organization_id)
  )
);

create policy "Members can insert scan logs"
on public.scan_logs
for insert
with check (
  exists (
    select 1
    from public.projects p
    where p.id = scan_logs.project_id
      and public.is_org_member(p.organization_id)
  )
);

grant usage on schema public to anon, authenticated;
grant select on public.project_progress to authenticated;
grant execute on function public.process_scan(uuid, text, uuid, text, uuid) to authenticated;
grant execute on function public.build_system_barcode_id(uuid, integer) to authenticated;

insert into storage.buckets (id, name, public)
values ('excel-files', 'excel-files', false)
on conflict (id) do nothing;
