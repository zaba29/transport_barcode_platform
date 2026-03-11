import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import Papa from "papaparse";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ReportType = "scanned" | "missing" | "loading" | "loaded" | "not_loaded" | "reconciliation";
type ReportFormat = "pdf" | "csv" | "xlsx";
type ProjectType = "stock_check" | "loading_check";

type ReportRow = {
  id: string;
  client_reference: string;
  urn: string | null;
  package_number: string | null;
  system_barcode_id: string;
  item_name: string | null;
  title: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimensions_raw: string | null;
  weight: number | null;
  quantity: number | null;
  packages: number | null;
  volume_cbm: number | null;
  location: string | null;
  italy_location: string | null;
  uk_location: string | null;
  notes: string | null;
  status: "not_scanned" | "scanned";
  scanned_at: string | null;
  is_duplicate_reference: boolean;
};

type ActionRow = {
  item_id: string | null;
  scanned_barcode: string;
  result_type: string;
  scanned_at: string;
  scanned_by: string | null;
  device_info: string | null;
};

function toNumberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toItemStatus(value: unknown): "not_scanned" | "scanned" {
  return value === "scanned" ? "scanned" : "not_scanned";
}

function formatDimensions(row: {
  dimensions_raw: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
}) {
  if (row.dimensions_raw) {
    return row.dimensions_raw;
  }

  if (row.length != null || row.width != null || row.height != null) {
    return `${row.length ?? "-"} x ${row.width ?? "-"} x ${row.height ?? "-"}`;
  }

  return "";
}

function operationalStatus(status: "not_scanned" | "scanned", projectType: ProjectType) {
  if (projectType === "loading_check") {
    return status === "scanned" ? "loaded" : "not_loaded";
  }

  return status === "scanned" ? "scanned" : "missing";
}

function reportLabel(type: ReportType, projectType: ProjectType) {
  const loading = projectType === "loading_check";

  if (type === "reconciliation") {
    return "Full Reconciliation";
  }

  if (loading) {
    if (type === "loaded" || type === "loading" || type === "scanned") {
      return "Loading List (Loaded Only)";
    }
    return "Missing From Load List";
  }

  if (type === "scanned") {
    return "Scanned Items Report";
  }

  return "Missing Items Report";
}

async function fetchReportData(projectId: string, type: ReportType) {
  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, project_type")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    throw new Error(projectError?.message ?? "Project not found");
  }

  const projectType = (project.project_type as ProjectType) ?? "stock_check";

  let itemQuery = supabase
    .from("items")
    .select(
      [
        "id",
        "client_reference",
        "urn",
        "package_number",
        "system_barcode_id",
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
        "italy_location",
        "uk_location",
        "notes",
        "status",
        "scanned_at",
        "is_duplicate_reference",
      ].join(","),
    )
    .eq("project_id", projectId)
    .order("row_number", { ascending: true })
    .limit(20000);

  if (["scanned", "loading", "loaded"].includes(type)) {
    itemQuery = itemQuery.eq("status", "scanned");
  }

  if (["missing", "not_loaded"].includes(type)) {
    itemQuery = itemQuery.eq("status", "not_scanned");
  }

  const { data: items, error: itemsError } = await itemQuery;

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const { data: actionHistory, error: actionsError } = await supabase
    .from("scan_logs")
    .select("item_id, scanned_barcode, result_type, scanned_at, scanned_by, device_info")
    .eq("project_id", projectId)
    .order("scanned_at", { ascending: true })
    .limit(20000);

  if (actionsError) {
    throw new Error(actionsError.message);
  }

  const normalizedItems: ReportRow[] = ((items ?? []) as unknown[]).map((row) => {
    const source = row as Record<string, unknown>;

    return {
      id: String(source.id ?? ""),
      client_reference: String(source.client_reference ?? ""),
      urn: (source.urn as string | null) ?? null,
      package_number: (source.package_number as string | null) ?? null,
      system_barcode_id: String(source.system_barcode_id ?? ""),
      item_name: (source.item_name as string | null) ?? null,
      title: (source.title as string | null) ?? null,
      length: toNumberOrNull(source.length),
      width: toNumberOrNull(source.width),
      height: toNumberOrNull(source.height),
      dimensions_raw: (source.dimensions_raw as string | null) ?? null,
      weight: toNumberOrNull(source.weight),
      quantity: toNumberOrNull(source.quantity),
      packages: toNumberOrNull(source.packages),
      volume_cbm: toNumberOrNull(source.volume_cbm),
      location: (source.location as string | null) ?? null,
      italy_location: (source.italy_location as string | null) ?? null,
      uk_location: (source.uk_location as string | null) ?? null,
      notes: (source.notes as string | null) ?? null,
      status: toItemStatus(source.status),
      scanned_at: (source.scanned_at as string | null) ?? null,
      is_duplicate_reference: Boolean(source.is_duplicate_reference),
    };
  });

  const normalizedActions: ActionRow[] = ((actionHistory ?? []) as unknown[]).map((row) => {
    const source = row as Record<string, unknown>;

    return {
      item_id: (source.item_id as string | null) ?? null,
      scanned_barcode: String(source.scanned_barcode ?? ""),
      result_type: String(source.result_type ?? ""),
      scanned_at: String(source.scanned_at ?? ""),
      scanned_by: (source.scanned_by as string | null) ?? null,
      device_info: (source.device_info as string | null) ?? null,
    };
  });

  const unknownScans = normalizedActions.filter((action) => action.result_type === "not_found");

  return {
    project: {
      id: String(project.id),
      name: String(project.name ?? "Project"),
      project_type: projectType,
    },
    items: normalizedItems,
    unknownScans,
    actionHistory: normalizedActions,
  };
}

function buildActionHistoryMap(actions: ActionRow[]) {
  const map = new Map<string, ActionRow[]>();

  actions.forEach((action) => {
    if (!action.item_id) {
      return;
    }

    const existing = map.get(action.item_id) ?? [];
    existing.push(action);
    map.set(action.item_id, existing);
  });

  return map;
}

function toFlatRows(items: ReportRow[], projectType: ProjectType, actionHistoryMap: Map<string, ActionRow[]>) {
  return items.map((item) => {
    const history = actionHistoryMap.get(item.id) ?? [];
    const historyText = history
      .map((action) => `${action.result_type}@${new Date(action.scanned_at).toISOString()}`)
      .join("; ");

    return {
      client_reference: item.client_reference,
      urn: item.urn ?? "",
      package_number: item.package_number ?? "",
      system_barcode_id: item.system_barcode_id,
      item_name: item.item_name ?? "",
      title: item.title ?? "",
      quantity: item.quantity ?? "",
      packages: item.packages ?? "",
      dimensions: formatDimensions(item),
      length: item.length ?? "",
      width: item.width ?? "",
      height: item.height ?? "",
      weight: item.weight ?? "",
      volume_cbm: item.volume_cbm ?? "",
      location: item.location ?? item.italy_location ?? item.uk_location ?? "",
      notes: item.notes ?? "",
      final_status: operationalStatus(item.status, projectType),
      loaded_timestamp: item.scanned_at ? new Date(item.scanned_at).toISOString() : "",
      duplicate_warning: item.is_duplicate_reference ? "YES" : "",
      action_history: historyText,
    };
  });
}

async function buildXlsxBuffer(
  rows: ReturnType<typeof toFlatRows>,
  unknownScans: ActionRow[],
  actionHistory: ActionRow[],
) {
  const workbook = new ExcelJS.Workbook();

  const itemsSheet = workbook.addWorksheet("Items");
  itemsSheet.columns = Object.keys(rows[0] ?? { client_reference: "" }).map((key) => ({
    header: key,
    key,
    width: 24,
  }));
  rows.forEach((row) => itemsSheet.addRow(row));

  const unknownSheet = workbook.addWorksheet("Unknown Scans");
  unknownSheet.columns = [
    { header: "scanned_barcode", key: "scanned_barcode", width: 28 },
    { header: "scanned_at", key: "scanned_at", width: 28 },
    { header: "scanned_by", key: "scanned_by", width: 36 },
    { header: "device_info", key: "device_info", width: 36 },
  ];
  unknownScans.forEach((scan) => unknownSheet.addRow(scan));

  const historySheet = workbook.addWorksheet("Action History");
  historySheet.columns = [
    { header: "item_id", key: "item_id", width: 40 },
    { header: "scanned_barcode", key: "scanned_barcode", width: 28 },
    { header: "result_type", key: "result_type", width: 20 },
    { header: "scanned_at", key: "scanned_at", width: 28 },
    { header: "scanned_by", key: "scanned_by", width: 36 },
    { header: "device_info", key: "device_info", width: 36 },
  ];
  actionHistory.forEach((row) => historySheet.addRow(row));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildPdfBuffer(
  projectName: string,
  projectType: ProjectType,
  reportType: ReportType,
  rows: ReturnType<typeof toFlatRows>,
  unknownScans: ActionRow[],
  actionHistory: ActionRow[],
) {
  const doc = new PDFDocument({ size: "A4", margin: 32 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .text(`${projectName} - ${reportLabel(reportType, projectType).toUpperCase()}`);
  doc.moveDown(0.5);
  doc.fontSize(9).font("Helvetica").text(`Generated at ${new Date().toLocaleString()}`);
  doc.moveDown();

  rows.slice(0, 1200).forEach((row, index) => {
    if (doc.y > doc.page.height - 72) {
      doc.addPage();
    }

    if (projectType === "loading_check" && ["loaded", "loading", "not_loaded", "scanned", "missing"].includes(reportType)) {
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(
          `${index + 1}. URN:${row.urn || "-"} | Ref:${row.client_reference} | PkgNo:${row.package_number || "-"} | ${row.item_name || "-"} | ${row.title || "-"} | Qty:${row.quantity || "-"} | Pkg:${row.packages || "-"} | Dim:${row.dimensions || "-"} | W:${row.weight || "-"} | Loc:${row.location || "-"} | Loaded:${row.loaded_timestamp || "-"}`,
          { width: doc.page.width - 64 },
        );
    } else {
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(
          `${index + 1}. URN:${row.urn || "-"} | Ref:${row.client_reference} | ${row.system_barcode_id} | ${row.item_name || "-"} | ${row.title || "-"} | Loc:${row.location || "-"} | ${row.final_status}`,
          { width: doc.page.width - 64 },
        );
    }
  });

  if (reportType === "reconciliation") {
    doc.addPage();
    doc.fontSize(12).font("Helvetica-Bold").text("Unknown Scan List");
    doc.moveDown(0.5);

    if (!unknownScans.length) {
      doc.fontSize(9).font("Helvetica").text("No unknown scans.");
    } else {
      unknownScans.slice(0, 1000).forEach((scan, index) => {
        if (doc.y > doc.page.height - 60) {
          doc.addPage();
        }

        doc
          .fontSize(9)
          .font("Helvetica")
          .text(`${index + 1}. ${scan.scanned_barcode} | ${new Date(scan.scanned_at).toLocaleString()} | ${scan.scanned_by ?? "-"}`);
      });
    }

    doc.addPage();
    doc.fontSize(12).font("Helvetica-Bold").text("Action History");
    doc.moveDown(0.5);

    actionHistory.slice(0, 2000).forEach((action, index) => {
      if (doc.y > doc.page.height - 60) {
        doc.addPage();
      }

      doc
        .fontSize(9)
        .font("Helvetica")
        .text(
          `${index + 1}. ${action.result_type} | ${action.scanned_barcode} | ${new Date(action.scanned_at).toLocaleString()} | ${action.scanned_by ?? "-"}`,
          { width: doc.page.width - 64 },
        );
    });
  }

  doc.end();

  await new Promise<void>((resolve) => {
    doc.on("end", () => resolve());
  });

  return Buffer.concat(chunks);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const type = (url.searchParams.get("type") ?? "reconciliation") as ReportType;
    const format = (url.searchParams.get("format") ?? "pdf") as ReportFormat;

    if (!["scanned", "missing", "loading", "loaded", "not_loaded", "reconciliation"].includes(type)) {
      return new Response("Invalid report type", { status: 400 });
    }

    if (!["pdf", "csv", "xlsx"].includes(format)) {
      return new Response("Invalid report format", { status: 400 });
    }

    const { project, items, unknownScans, actionHistory } = await fetchReportData(projectId, type);
    const actionHistoryMap = buildActionHistoryMap(actionHistory);
    const rows = toFlatRows(items, project.project_type, actionHistoryMap);

    if (format === "csv") {
      const csv = Papa.unparse(rows);

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${project.name}-${type}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "xlsx") {
      const buffer = await buildXlsxBuffer(rows, unknownScans, actionHistory);

      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${project.name}-${type}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = await buildPdfBuffer(
      project.name,
      project.project_type,
      type,
      rows,
      unknownScans,
      actionHistory,
    );

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${project.name}-${type}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unexpected report error", {
      status: 500,
    });
  }
}
