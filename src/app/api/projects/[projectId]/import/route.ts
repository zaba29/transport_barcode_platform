import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MappingState } from "@/lib/import/header-mapping";
import { createClient } from "@/lib/supabase/server";

function sanitizeFilename(filename: string) {
  return filename.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

function toNullableString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed.length ? parsed : null;
}

function toNullableNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

function toNullableInteger(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

function jsonError(status: number, message: string, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...details }, { status });
}

function readMappedString(mapping: MappingState, key: keyof MappingState, row: Record<string, unknown>) {
  return mapping[key] ? toNullableString(row[mapping[key]]) : null;
}

function readMappedNumber(mapping: MappingState, key: keyof MappingState, row: Record<string, unknown>) {
  return mapping[key] ? toNullableNumber(row[mapping[key]]) : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError(401, "Unauthorized");
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return jsonError(404, "Project not found");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const sheetName = String(formData.get("sheetName") ?? "");
    const headerRowIndex = Number(formData.get("headerRowIndex") ?? "0");
    const mappingRaw = formData.get("mapping");

    if (!(file instanceof File)) {
      return jsonError(400, "Missing file");
    }

    if (!sheetName) {
      return jsonError(400, "Missing sheetName");
    }

    if (typeof mappingRaw !== "string") {
      return jsonError(400, "Missing mapping payload");
    }

    let mapping: MappingState;
    try {
      mapping = JSON.parse(mappingRaw) as MappingState;
    } catch {
      return jsonError(400, "Invalid mapping payload", { code: "INVALID_MAPPING_JSON" });
    }

    if (!mapping.client_reference) {
      return jsonError(400, "Customer Ref mapping is required");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(bytes, { type: "buffer" });
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return jsonError(400, "Selected sheet not found in workbook");
    }

    const rowMatrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    }) as Array<Array<string | number | boolean | null | undefined>>;

    const headerRow = rowMatrix[headerRowIndex] ?? [];
    const headers = headerRow.map((header, idx) => {
      const value = String(header ?? "").trim();
      return value.length ? value : `column_${idx + 1}`;
    });

    const existingRefsResult = await supabase
      .from("items")
      .select("client_reference")
      .eq("project_id", projectId)
      .limit(200000);

    if (existingRefsResult.error) {
      throw existingRefsResult.error;
    }

    const referenceCount = new Map<string, number>();

    for (const row of existingRefsResult.data ?? []) {
      const ref = String(row.client_reference ?? "").trim();
      if (ref) {
        referenceCount.set(ref, (referenceCount.get(ref) ?? 0) + 1);
      }
    }

    const { count: existingCount, error: countError } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);

    if (countError) {
      throw countError;
    }

    const sequenceStart = (existingCount ?? 0) + 1;
    const projectPrefix = `PRJ${projectId.replaceAll("-", "").slice(0, 6).toUpperCase()}`;

    const itemRows: Array<Record<string, unknown>> = [];

    for (let index = headerRowIndex + 1; index < rowMatrix.length; index += 1) {
      const row = rowMatrix[index] ?? [];
      const fullRow: Record<string, unknown> = {};

      headers.forEach((header, columnIndex) => {
        fullRow[header] = row[columnIndex] ?? "";
      });

      const clientReference = toNullableString(fullRow[mapping.client_reference]);

      if (!clientReference) {
        continue;
      }

      referenceCount.set(clientReference, (referenceCount.get(clientReference) ?? 0) + 1);

      const barcodeSequence = sequenceStart + itemRows.length;
      const systemBarcodeId = `${projectPrefix}-${String(barcodeSequence).padStart(6, "0")}`;

      itemRows.push({
        project_id: projectId,
        row_number: index + 1,
        system_barcode_id: systemBarcodeId,
        client_reference: clientReference,
        package_number: readMappedString(mapping, "package_number", fullRow),
        warehouse_number: readMappedString(mapping, "warehouse_number", fullRow),
        urn: readMappedString(mapping, "urn", fullRow),
        artist: readMappedString(mapping, "artist", fullRow),
        item_name: readMappedString(mapping, "item_name", fullRow),
        title: readMappedString(mapping, "title", fullRow),
        length: readMappedNumber(mapping, "length", fullRow),
        width: readMappedNumber(mapping, "width", fullRow),
        height: readMappedNumber(mapping, "height", fullRow),
        dimensions_raw: readMappedString(mapping, "dimensions_raw", fullRow),
        weight: readMappedNumber(mapping, "weight", fullRow),
        quantity: readMappedNumber(mapping, "quantity", fullRow),
        packages: mapping.packages ? toNullableInteger(fullRow[mapping.packages]) : null,
        volume_cbm: readMappedNumber(mapping, "volume_cbm", fullRow),
        location:
          readMappedString(mapping, "location", fullRow) ??
          readMappedString(mapping, "italy_location", fullRow) ??
          readMappedString(mapping, "uk_location", fullRow),
        italy_location: readMappedString(mapping, "italy_location", fullRow),
        uk_location: readMappedString(mapping, "uk_location", fullRow),
        packing: readMappedString(mapping, "packing", fullRow),
        notes: readMappedString(mapping, "notes", fullRow),
        comments: readMappedString(mapping, "comments", fullRow),
        external_barcode: readMappedString(mapping, "external_barcode", fullRow),
        picked: readMappedString(mapping, "picked", fullRow),
        loaded: readMappedString(mapping, "loaded", fullRow),
        checked: readMappedString(mapping, "checked", fullRow),
        date: readMappedString(mapping, "date", fullRow),
        client: readMappedString(mapping, "client", fullRow),
        job_number: readMappedString(mapping, "job_number", fullRow),
        consignee: readMappedString(mapping, "consignee", fullRow),
        vehicle_route_reference: readMappedString(mapping, "vehicle_route_reference", fullRow),
        full_row_json: fullRow,
        status: "not_scanned",
        is_duplicate_reference: false,
      });
    }

    if (!itemRows.length) {
      return jsonError(400, "No valid rows found after mapping", {
        code: "NO_VALID_ROWS",
        hint: "Ensure Customer Ref is mapped to a populated column",
      });
    }

    const duplicateRefs = [...referenceCount.entries()]
      .filter(([, count]) => count > 1)
      .map(([ref]) => ref);

    const admin = createAdminClient();
    let storagePath: string | null = null;

    try {
      storagePath = `${project.organization_id}/${projectId}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await admin.storage.from("excel-files").upload(storagePath, bytes, {
        contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });

      if (uploadError) {
        storagePath = null;
      }
    } catch {
      storagePath = null;
    }

    const { data: importedSheet, error: sheetError } = await supabase
      .from("imported_sheets")
      .insert({
        project_id: projectId,
        original_filename: file.name,
        storage_path: storagePath,
        sheet_name: sheetName,
        reference_column: mapping.client_reference,
        mapping_json: mapping,
        imported_by: user.id,
      })
      .select("id")
      .single();

    if (sheetError || !importedSheet) {
      throw sheetError ?? new Error("Failed to create imported sheet");
    }

    const payload = itemRows.map((row) => ({
      ...row,
      sheet_id: importedSheet.id,
      is_duplicate_reference: duplicateRefs.includes(String(row.client_reference ?? "")),
    }));

    const chunkSize = 500;

    for (let offset = 0; offset < payload.length; offset += chunkSize) {
      const chunk = payload.slice(offset, offset + chunkSize);
      const { error: insertError } = await supabase.from("items").insert(chunk);

      if (insertError) {
        throw insertError;
      }
    }

    if (duplicateRefs.length) {
      const { error: duplicateMarkError } = await supabase
        .from("items")
        .update({ is_duplicate_reference: true })
        .eq("project_id", projectId)
        .in("client_reference", duplicateRefs);

      if (duplicateMarkError) {
        throw duplicateMarkError;
      }
    }

    return NextResponse.json({
      importedCount: payload.length,
      duplicateCount: duplicateRefs.length,
      storagePath,
    });
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : "Unexpected import error", {
      code: "IMPORT_FAILED",
    });
  }
}
