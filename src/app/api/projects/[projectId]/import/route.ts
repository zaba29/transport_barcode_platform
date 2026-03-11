import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type MappingPayload = {
  client_reference: string;
  item_name?: string;
  title?: string;
  length?: string;
  width?: string;
  height?: string;
  dimensions_raw?: string;
  weight?: string;
  quantity?: string;
  packages?: string;
  volume_cbm?: string;
  location?: string;
  notes?: string;
  client?: string;
  consignee?: string;
  vehicle_route_reference?: string;
};

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const sheetName = String(formData.get("sheetName") ?? "");
    const headerRowIndex = Number(formData.get("headerRowIndex") ?? "0");
    const mappingRaw = formData.get("mapping");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!sheetName) {
      return NextResponse.json({ error: "Missing sheetName" }, { status: 400 });
    }

    if (typeof mappingRaw !== "string") {
      return NextResponse.json({ error: "Missing mapping payload" }, { status: 400 });
    }

    const mapping = JSON.parse(mappingRaw) as MappingPayload;

    if (!mapping.client_reference) {
      return NextResponse.json({ error: "Reference column mapping is required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(bytes, { type: "buffer" });
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return NextResponse.json({ error: "Selected sheet not found in workbook" }, { status: 400 });
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
        item_name: mapping.item_name ? toNullableString(fullRow[mapping.item_name]) : null,
        title: mapping.title ? toNullableString(fullRow[mapping.title]) : null,
        length: mapping.length ? toNullableNumber(fullRow[mapping.length]) : null,
        width: mapping.width ? toNullableNumber(fullRow[mapping.width]) : null,
        height: mapping.height ? toNullableNumber(fullRow[mapping.height]) : null,
        dimensions_raw: mapping.dimensions_raw ? toNullableString(fullRow[mapping.dimensions_raw]) : null,
        weight: mapping.weight ? toNullableNumber(fullRow[mapping.weight]) : null,
        quantity: mapping.quantity ? toNullableNumber(fullRow[mapping.quantity]) : null,
        packages: mapping.packages ? toNullableInteger(fullRow[mapping.packages]) : null,
        volume_cbm: mapping.volume_cbm ? toNullableNumber(fullRow[mapping.volume_cbm]) : null,
        location: mapping.location ? toNullableString(fullRow[mapping.location]) : null,
        notes: mapping.notes ? toNullableString(fullRow[mapping.notes]) : null,
        client: mapping.client ? toNullableString(fullRow[mapping.client]) : null,
        consignee: mapping.consignee ? toNullableString(fullRow[mapping.consignee]) : null,
        vehicle_route_reference: mapping.vehicle_route_reference
          ? toNullableString(fullRow[mapping.vehicle_route_reference])
          : null,
        full_row_json: fullRow,
        status: "not_scanned",
        is_duplicate_reference: false,
      });
    }

    if (!itemRows.length) {
      return NextResponse.json({ error: "No valid rows found after mapping" }, { status: 400 });
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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected import error",
      },
      { status: 500 },
    );
  }
}
