alter type public.scan_result_type add value if not exists 'unmark';

alter table public.items
  add column if not exists length numeric,
  add column if not exists width numeric,
  add column if not exists height numeric,
  add column if not exists dimensions_raw text,
  add column if not exists weight numeric,
  add column if not exists packages integer,
  add column if not exists volume_cbm numeric;

create or replace function public.process_unmark(
  p_project_id uuid,
  p_item_id uuid,
  p_user_id uuid default auth.uid(),
  p_device_info text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items%rowtype;
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

  select *
  into v_item
  from public.items
  where id = p_item_id
    and project_id = p_project_id
  for update;

  if not found then
    return jsonb_build_object(
      'result_type', 'not_found',
      'message', 'Item not found'
    );
  end if;

  if v_item.status = 'not_scanned' then
    return jsonb_build_object(
      'result_type', 'unmark',
      'item_id', v_item.id,
      'client_reference', v_item.client_reference,
      'item_name', v_item.item_name,
      'title', v_item.title,
      'scanned_at', null,
      'message', 'Item already in not_scanned state'
    );
  end if;

  update public.items
  set status = 'not_scanned',
      scanned_at = null,
      scanned_by = null
  where id = v_item.id;

  insert into public.scan_logs (
    project_id,
    item_id,
    scanned_barcode,
    result_type,
    scanned_by,
    device_info,
    scanned_at
  )
  values (
    p_project_id,
    v_item.id,
    v_item.system_barcode_id,
    'unmark',
    v_effective_user,
    p_device_info,
    v_now
  );

  return jsonb_build_object(
    'result_type', 'unmark',
    'item_id', v_item.id,
    'client_reference', v_item.client_reference,
    'item_name', v_item.item_name,
    'title', v_item.title,
    'scanned_at', null,
    'message', 'Item unmarked successfully'
  );
end;
$$;

grant execute on function public.process_unmark(uuid, uuid, uuid, text) to authenticated;
