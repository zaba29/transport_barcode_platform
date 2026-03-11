export const MAPPING_FIELDS = [
  "client_reference",
  "urn",
  "package_number",
  "warehouse_number",
  "artist",
  "item_name",
  "title",
  "quantity",
  "length",
  "width",
  "height",
  "dimensions_raw",
  "weight",
  "volume_cbm",
  "packing",
  "packages",
  "location",
  "italy_location",
  "uk_location",
  "external_barcode",
  "comments",
  "notes",
  "checked",
  "picked",
  "loaded",
  "date",
  "client",
  "job_number",
  "consignee",
  "vehicle_route_reference",
] as const;

export type MappingField = (typeof MAPPING_FIELDS)[number];

export type MappingState = Record<MappingField, string>;

export const mappingFieldLabels: Record<MappingField, string> = {
  client_reference: "Customer Ref (required)",
  urn: "URN",
  package_number: "Package No.",
  warehouse_number: "WH no.",
  artist: "Artist",
  item_name: "Item name",
  title: "Title / Description",
  quantity: "Qty",
  length: "Length",
  width: "Width",
  height: "Height",
  dimensions_raw: "Dimensions raw",
  weight: "Weight",
  volume_cbm: "Volume (CBM)",
  packing: "Packing",
  packages: "Packages",
  location: "Location",
  italy_location: "Italy Location",
  uk_location: "UK Location",
  external_barcode: "External Barcode",
  comments: "Comments",
  notes: "Notes",
  checked: "Check",
  picked: "Picked",
  loaded: "Loaded",
  date: "Date",
  client: "Client",
  job_number: "Job N",
  consignee: "Consignee",
  vehicle_route_reference: "Vehicle route reference",
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const aliases: Record<MappingField, string[]> = {
  package_number: ["package no", "package number"],
  warehouse_number: ["wh no", "warehouse number"],
  client_reference: ["customer ref", "customer reference", "client reference", "ref"],
  artist: ["artist"],
  item_name: ["item", "item name"],
  title: ["artist title description", "title description", "artist - title - description"],
  quantity: ["qty", "quantity"],
  length: ["length", "l", "l cm"],
  width: ["width", "w", "w cm"],
  height: ["height", "h", "h cm"],
  dimensions_raw: ["dimension", "dimensions", "size"],
  weight: ["weight"],
  volume_cbm: ["volume", "volume m 3", "volume m3", "cbm"],
  packing: ["packingtype", "packaging", "packing"],
  packages: ["packages", "package count"],
  location: ["location"],
  italy_location: ["italy location"],
  uk_location: ["uk location"],
  urn: ["urn"],
  external_barcode: ["qr code", "barcode", "external barcode"],
  comments: ["comments"],
  notes: ["note", "notes"],
  checked: ["check", "checked"],
  picked: ["picked"],
  loaded: ["loaded"],
  date: ["date"],
  client: ["client", "customer"],
  job_number: ["job n", "job number"],
  consignee: ["consignee"],
  vehicle_route_reference: ["route", "vehicle", "loading reference"],
};

export function createDefaultMapping(): MappingState {
  return Object.fromEntries(MAPPING_FIELDS.map((field) => [field, ""])) as MappingState;
}

export function inferMapping(headers: string[]): MappingState {
  const normalized = headers.map((header) => ({ header, normalized: normalize(header) }));
  const mapping = createDefaultMapping();

  for (const field of MAPPING_FIELDS) {
    const match = normalized.find(({ normalized: value }) =>
      aliases[field].some((alias) => value.includes(normalize(alias))),
    );

    if (match) {
      mapping[field] = match.header;
    }
  }

  if (!mapping.client_reference && mapping.package_number) {
    mapping.client_reference = mapping.package_number;
  }

  return mapping;
}

export function normalizeHeaderName(value: string) {
  return normalize(value);
}
