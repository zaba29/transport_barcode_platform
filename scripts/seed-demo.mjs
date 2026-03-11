import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

dotenv.config({ path: ".env.local" });

const samplePath =
  process.argv[2] ?? "/Users/lukaszjarocki/Downloads/Nicola L._work list_restitution_2026.xlsx";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoUserId = process.env.DEMO_USER_ID;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

if (!demoUserId) {
  throw new Error("Missing DEMO_USER_ID in .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function detectHeaderRow(rows) {
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const row = rows[i] ?? [];
    const score = row.filter((value) => String(value ?? "").trim().length > 0).length;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function normalize(value) {
  const parsed = String(value ?? "").trim();
  return parsed.length ? parsed : null;
}

function findHeader(headers, keywords) {
  return (
    headers.find((header) => keywords.some((keyword) => header.toLowerCase().includes(keyword))) ??
    headers[0]
  );
}

async function main() {
  const bytes = await fs.readFile(samplePath);
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error("No sheet found in the demo workbook");
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  const headerRowIndex = detectHeaderRow(rows);
  const headers = (rows[headerRowIndex] ?? []).map((header, idx) => {
    const value = String(header ?? "").trim();
    return value.length ? value : `column_${idx + 1}`;
  });

  const mapping = {
    client_reference: findHeader(headers, ["reference", "ref", "inventory", "id", "code"]),
    item_name: findHeader(headers, ["artist", "item", "name"]),
    title: findHeader(headers, ["title", "description", "artwork"]),
    length: findHeader(headers, ["length", "len"]),
    width: findHeader(headers, ["width", "wide"]),
    height: findHeader(headers, ["height"]),
    dimensions_raw: findHeader(headers, ["dimension", "size", "misure"]),
    weight: findHeader(headers, ["weight", "peso", "kg"]),
    quantity: findHeader(headers, ["qty", "quantity"]),
    packages: findHeader(headers, ["packages", "package", "colli"]),
    volume_cbm: findHeader(headers, ["volume", "cbm", "m3"]),
    location: findHeader(headers, ["location", "warehouse", "rack"]),
    notes: findHeader(headers, ["notes", "remark"]),
    client: findHeader(headers, ["client", "customer"]),
    consignee: findHeader(headers, ["consignee"]),
    vehicle_route_reference: findHeader(headers, ["vehicle", "route", "load"]),
  };

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", demoUserId)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    throw new Error("Demo user must belong to an organization before seeding");
  }

  const timestamp = new Date().toISOString().slice(0, 10);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      organization_id: membership.organization_id,
      name: `Demo Loading Check ${timestamp}`,
      project_type: "loading_check",
      description: `Seeded from ${path.basename(samplePath)}`,
      created_by: demoUserId,
    })
    .select("id")
    .single();

  if (projectError || !project) {
    throw new Error(projectError?.message ?? "Failed to create demo project");
  }

  const storagePath = `${membership.organization_id}/${project.id}/demo-${Date.now()}-${path
    .basename(samplePath)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")}`;

  await supabase.storage.from("excel-files").upload(storagePath, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: true,
  });

  const { data: sheetRow, error: sheetError } = await supabase
    .from("imported_sheets")
    .insert({
      project_id: project.id,
      original_filename: path.basename(samplePath),
      storage_path: storagePath,
      sheet_name: sheetName,
      reference_column: mapping.client_reference,
      mapping_json: mapping,
      imported_by: demoUserId,
    })
    .select("id")
    .single();

  if (sheetError || !sheetRow) {
    throw new Error(sheetError?.message ?? "Failed to create imported_sheets row");
  }

  const payload = [];
  const maxRows = Math.min(rows.length, headerRowIndex + 1001);

  for (let index = headerRowIndex + 1; index < maxRows; index += 1) {
    const row = rows[index] ?? [];
    const fullRow = {};

    headers.forEach((header, colIndex) => {
      fullRow[header] = row[colIndex] ?? "";
    });

    const clientReference = normalize(fullRow[mapping.client_reference]);

    if (!clientReference) {
      continue;
    }

    const systemBarcodeId = `PRJ${project.id.replaceAll("-", "").slice(0, 6).toUpperCase()}-${String(
      payload.length + 1,
    ).padStart(6, "0")}`;

    payload.push({
      project_id: project.id,
      sheet_id: sheetRow.id,
      row_number: index + 1,
      system_barcode_id: systemBarcodeId,
      client_reference: clientReference,
      item_name: normalize(fullRow[mapping.item_name]),
      title: normalize(fullRow[mapping.title]),
      length: Number(fullRow[mapping.length]) || null,
      width: Number(fullRow[mapping.width]) || null,
      height: Number(fullRow[mapping.height]) || null,
      dimensions_raw: normalize(fullRow[mapping.dimensions_raw]),
      weight: Number(fullRow[mapping.weight]) || null,
      quantity: Number(fullRow[mapping.quantity]) || null,
      packages: Number.parseInt(fullRow[mapping.packages], 10) || null,
      volume_cbm: Number(fullRow[mapping.volume_cbm]) || null,
      location: normalize(fullRow[mapping.location]),
      notes: normalize(fullRow[mapping.notes]),
      client: normalize(fullRow[mapping.client]),
      consignee: normalize(fullRow[mapping.consignee]),
      vehicle_route_reference: normalize(fullRow[mapping.vehicle_route_reference]),
      full_row_json: fullRow,
      status: "not_scanned",
    });
  }

  if (!payload.length) {
    throw new Error("No data rows found in sample file");
  }

  const refs = new Map();
  payload.forEach((item) => {
    refs.set(item.client_reference, (refs.get(item.client_reference) ?? 0) + 1);
  });
  const duplicates = [...refs.entries()].filter(([, count]) => count > 1).map(([ref]) => ref);
  payload.forEach((item) => {
    item.is_duplicate_reference = duplicates.includes(item.client_reference);
  });

  for (let offset = 0; offset < payload.length; offset += 500) {
    const chunk = payload.slice(offset, offset + 500);
    const { error } = await supabase.from("items").insert(chunk);
    if (error) {
      throw new Error(error.message);
    }
  }

  console.log("Demo seed complete");
  console.log(`Project ID: ${project.id}`);
  console.log(`Imported rows: ${payload.length}`);
  console.log(`Duplicate refs: ${duplicates.length}`);
  console.log(`Reference column: ${mapping.client_reference}`);
  console.log(`Sheet: ${sheetName}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
