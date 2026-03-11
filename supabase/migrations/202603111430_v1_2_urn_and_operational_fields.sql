alter table public.items
  add column if not exists package_number text,
  add column if not exists warehouse_number text,
  add column if not exists urn text,
  add column if not exists italy_location text,
  add column if not exists uk_location text,
  add column if not exists packing text,
  add column if not exists picked text,
  add column if not exists loaded text,
  add column if not exists comments text,
  add column if not exists external_barcode text,
  add column if not exists artist text,
  add column if not exists checked text,
  add column if not exists date text,
  add column if not exists job_number text;

create index if not exists idx_items_urn on public.items (project_id, urn);
create index if not exists idx_items_external_barcode on public.items (project_id, external_barcode);
create index if not exists idx_items_location on public.items (project_id, location);
