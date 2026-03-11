import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const filter = (url.searchParams.get("filter") ?? "missing").trim();
  const sort = (url.searchParams.get("sort") ?? "reference").trim();

  let query = supabase
    .from("items")
    .select(
      "id, client_reference, urn, package_number, item_name, title, length, width, height, dimensions_raw, weight, quantity, packages, volume_cbm, location, italy_location, uk_location, notes, status, scanned_at, system_barcode_id",
    )
    .eq("project_id", projectId)
    .limit(300);

  if (filter === "missing") {
    query = query.eq("status", "not_scanned");
  }

  if (filter === "scanned") {
    query = query.eq("status", "scanned");
  }

  if (q) {
    query = query.or(
      [
        `client_reference.ilike.%${q}%`,
        `urn.ilike.%${q}%`,
        `package_number.ilike.%${q}%`,
        `system_barcode_id.ilike.%${q}%`,
        `item_name.ilike.%${q}%`,
        `title.ilike.%${q}%`,
        `location.ilike.%${q}%`,
        `italy_location.ilike.%${q}%`,
        `uk_location.ilike.%${q}%`,
      ].join(","),
    );
  }

  if (sort === "location") {
    query = query.order("location", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("client_reference", { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] }, { status: 200 });
}
