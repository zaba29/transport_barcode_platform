import bwipjs from "bwip-js";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type LabelRow = {
  system_barcode_id: string | null;
  client_reference: string | null;
  package_number: string | null;
  urn: string | null;
  item_name: string | null;
  title: string | null;
  status: "not_scanned" | "scanned" | null;
};

type NormalizedLabelRow = {
  system_barcode_id: string;
  urn: string;
  client_reference: string;
  package_number: string;
  item_name: string;
  title: string;
};

const pageLayout = {
  margin: 24,
  columns: 3,
  rows: 8,
  horizontalGap: 8,
  verticalGap: 8,
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ error, details }, { status });
}

function parseRequest(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const barcodes = (url.searchParams.get("barcodes") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!["all", "missing", "scanned", "selected"].includes(scope)) {
    return { error: jsonError(400, "Invalid scope", `Scope '${scope}' is not supported`) };
  }

  if (scope === "selected" && !barcodes.length) {
    return { error: jsonError(400, "No barcodes provided", "Provide at least one barcode for selected scope") };
  }

  const invalidBarcode = barcodes.find((value) => value.length > 120);
  if (invalidBarcode) {
    return { error: jsonError(400, "Invalid barcode value", `Barcode '${invalidBarcode}' is too long`) };
  }

  return { scope, barcodes } as const;
}

function normalizeRow(row: LabelRow) {
  const systemBarcodeId = String(row.system_barcode_id ?? "").trim();
  const urn = String(row.urn ?? "").trim();

  if (!systemBarcodeId || !urn) {
    return null;
  }

  const normalized: NormalizedLabelRow = {
    system_barcode_id: systemBarcodeId,
    urn,
    client_reference: row.client_reference ?? "",
    package_number: row.package_number ?? "",
    item_name: row.item_name ?? "",
    title: row.title ?? "",
  };

  return normalized;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError(401, "Unauthorized");
    }

    const parsed = parseRequest(request);
    if ("error" in parsed) {
      return parsed.error;
    }

    const { scope, barcodes } = parsed;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !project) {
      return jsonError(404, "Project not found", projectError?.message);
    }

    let query = supabase
      .from("items")
      .select("system_barcode_id, client_reference, package_number, urn, item_name, title, status")
      .eq("project_id", projectId)
      .order("client_reference", { ascending: true });

    if (scope === "missing") {
      query = query.eq("status", "not_scanned");
    }

    if (scope === "scanned") {
      query = query.eq("status", "scanned");
    }

    if (scope === "selected") {
      query = query.in("urn", barcodes);
    }

    const { data: items, error } = await query.limit(10000);

    if (error) {
      return jsonError(500, "Failed to fetch labels", error.message);
    }

    const rows = ((items ?? []) as LabelRow[])
      .filter((item) => item.urn)
      .map(normalizeRow)
      .filter((row) => row !== null);

    console.info("[labels] request", {
      projectId,
      scope,
      selectedBarcodeCount: barcodes.length,
      labelsFound: rows.length,
    });

    if (!rows.length) {
      return new Response("No labels with URN found", { status: 400 });
    }

    const doc = new PDFDocument({ size: "A4", margin: pageLayout.margin });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

    const pageWidth = doc.page.width - pageLayout.margin * 2;
    const pageHeight = doc.page.height - pageLayout.margin * 2;
    const labelWidth = (pageWidth - pageLayout.horizontalGap * (pageLayout.columns - 1)) / pageLayout.columns;
    const labelHeight = (pageHeight - pageLayout.verticalGap * (pageLayout.rows - 1)) / pageLayout.rows;
    const labelsPerPage = pageLayout.columns * pageLayout.rows;

    for (let index = 0; index < rows.length; index += 1) {
      if (index > 0 && index % labelsPerPage === 0) {
        doc.addPage();
      }

      const localIndex = index % labelsPerPage;
      const row = Math.floor(localIndex / pageLayout.columns);
      const column = localIndex % pageLayout.columns;

      const x = pageLayout.margin + column * (labelWidth + pageLayout.horizontalGap);
      const y = pageLayout.margin + row * (labelHeight + pageLayout.verticalGap);

      const item = rows[index];
      const barcodeValue = item.urn ?? item.system_barcode_id;

      const barcodePng = await bwipjs.toBuffer({
        bcid: "code128",
        text: barcodeValue,
        scale: 2,
        height: 12,
        includetext: false,
        backgroundcolor: "FFFFFF",
      });

      doc.roundedRect(x, y, labelWidth, labelHeight, 4).lineWidth(0.5).stroke("#d4d4d8");
      doc.image(barcodePng, x + 8, y + 8, { fit: [labelWidth - 16, 34], align: "center" });

      doc.fontSize(11).font("Helvetica-Bold").text(item.urn ?? "", x + 8, y + 44, {
        width: labelWidth - 16,
        lineBreak: false,
      });

      doc.fontSize(9).font("Helvetica").text(item.client_reference ?? "", x + 8, y + 58, {
        width: labelWidth - 16,
        lineBreak: false,
      });

      if (item.package_number) {
        doc.fontSize(8).font("Helvetica").text(`Pkg ${item.package_number}`, x + 8, y + 70, {
          width: labelWidth - 16,
          lineBreak: false,
        });
      }

      doc.fontSize(7).font("Helvetica-Bold").text(item.urn ?? item.system_barcode_id, x + 8, y + 81, {
        width: labelWidth - 16,
        align: "left",
      });

      if (item.item_name) {
        doc.fontSize(8).font("Helvetica").text(item.item_name ?? "", x + 8, y + 91, {
          width: labelWidth - 16,
          lineBreak: false,
        });
      }

      if (item.title) {
        doc.fontSize(8).font("Helvetica").text(item.title ?? "", x + 8, y + 101, {
          width: labelWidth - 16,
          lineBreak: false,
        });
      }
    }

    doc.end();

    await new Promise<void>((resolve) => {
      doc.on("end", () => resolve());
    });

    const body = Buffer.concat(chunks);

    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="labels-${projectId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("[labels] PDF generation failed", {
      projectId,
      details,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return jsonError(500, "Label PDF generation failed", error instanceof Error ? error.message : String(error));
  }
}
