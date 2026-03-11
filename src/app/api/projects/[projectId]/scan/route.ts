import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type RequestPayload = {
  action?: "scan" | "unmark";
  barcode?: string;
  manualItemId?: string;
  itemId?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const payload = (await request.json()) as RequestPayload;
    const action = payload.action ?? "scan";
    const barcode = payload.barcode?.trim();

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userAgent = request.headers.get("user-agent") ?? "unknown-device";

    if (action === "unmark") {
      if (!payload.itemId) {
        return NextResponse.json({ error: "Missing item id for unmark action" }, { status: 400 });
      }

      const { data, error } = await supabase.rpc("process_unmark", {
        p_project_id: projectId,
        p_item_id: payload.itemId,
        p_user_id: user.id,
        p_device_info: userAgent,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data, { status: 200 });
    }

    if (!barcode && !payload.manualItemId) {
      return NextResponse.json({ error: "Missing barcode or manual item id" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("process_scan", {
      p_project_id: projectId,
      p_scanned_barcode: barcode ?? `manual-${payload.manualItemId}`,
      p_user_id: user.id,
      p_device_info: userAgent,
      p_manual_item_id: payload.manualItemId ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected scan error" },
      { status: 500 },
    );
  }
}
