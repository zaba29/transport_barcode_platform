export const PROJECT_TYPES = ["stock_check", "loading_check"] as const;

export const STATUS_FILTERS = [
  "all",
  "scanned",
  "missing",
  "duplicates",
  "unknown",
] as const;

export const OPTIONAL_MAPPING_FIELDS = [
  "item_name",
  "title",
  "length",
  "width",
  "height",
  "dimensions_raw",
  "weight",
  "quantity",
  "packages",
  "volume_cbm",
  "location",
  "notes",
  "client",
  "consignee",
  "vehicle_route_reference",
] as const;
