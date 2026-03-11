import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserContext } from "@/lib/domain/queries";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(2),
  projectType: z.enum(["stock_check", "loading_check"]),
  description: z.string().trim().optional(),
});

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await getUserContext();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, project_type, description, created_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projects: data ?? [] }, { status: 200 });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const context = await getUserContext();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: context.organizationId,
      name: parsed.data.name,
      project_type: parsed.data.projectType,
      description: parsed.data.description || null,
      created_by: context.userId,
    })
    .select("id, name, project_type, description, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
