import bwipjs from "bwip-js";
import PDFDocument from "pdfkit";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const pageLayout = {
  margin: 24,
  columns: 3,
  rows: 8,
  horizontalGap: 8,
  verticalGap: 8,
};

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const barcodes = (url.searchParams.get("barcodes") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  let query = supabase
    .from("items")
    .select("system_barcode_id, client_reference, item_name, title, status")
    .eq("project_id", projectId)
    .order("row_number", { ascending: true });

  if (scope === "missing") {
    query = query.eq("status", "not_scanned");
  }

  if (scope === "scanned") {
    query = query.eq("status", "scanned");
  }

  if (scope === "selected" && barcodes.length) {
    query = query.in("system_barcode_id", barcodes);
  }

  const { data: items, error } = await query.limit(10000);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const rows = items ?? [];
  if (!rows.length) {
    return new Response("No labels to print", { status: 400 });
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

    const barcodePng = await bwipjs.toBuffer({
      bcid: "code128",
      text: item.system_barcode_id,
      scale: 2,
      height: 12,
      includetext: false,
      backgroundcolor: "FFFFFF",
    });

    doc.roundedRect(x, y, labelWidth, labelHeight, 4).lineWidth(0.5).stroke("#d4d4d8");
    doc.image(barcodePng, x + 8, y + 8, { fit: [labelWidth - 16, 34], align: "center" });

    doc.fontSize(8).font("Helvetica-Bold").text(item.system_barcode_id, x + 8, y + 44, {
      width: labelWidth - 16,
      align: "left",
    });

    doc.fontSize(9).font("Helvetica").text(item.client_reference ?? "", x + 8, y + 57, {
      width: labelWidth - 16,
      lineBreak: false,
    });

    if (item.item_name) {
      doc.fontSize(8).text(item.item_name, x + 8, y + 69, {
        width: labelWidth - 16,
        lineBreak: false,
      });
    }

    if (item.title) {
      doc.fontSize(8).text(item.title, x + 8, y + 79, {
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
}
