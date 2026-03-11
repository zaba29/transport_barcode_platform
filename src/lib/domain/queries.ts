import { cache } from "react";
import { redirect } from "next/navigation";

import type { Item, Project, ProjectProgress } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";

type UserContext = {
  userId: string;
  email: string | undefined;
  organizationId: string;
  organizationName: string;
  role: string;
};

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    project_type: (row.project_type as Project["project_type"]) ?? "stock_check",
    description: (row.description as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

function mapProgress(row: Record<string, unknown>): ProjectProgress {
  return {
    project_id: String(row.project_id ?? ""),
    total_items: Number(row.total_items ?? 0),
    scanned_items: Number(row.scanned_items ?? 0),
    missing_items: Number(row.missing_items ?? 0),
    completion_percentage: Number(row.completion_percentage ?? 0),
    duplicate_items: Number(row.duplicate_items ?? 0),
    unknown_scans: Number(row.unknown_scans ?? 0),
  };
}

function mapItem(row: Record<string, unknown>): Item {
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    system_barcode_id: String(row.system_barcode_id ?? ""),
    client_reference: String(row.client_reference ?? ""),
    item_name: (row.item_name as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    length: typeof row.length === "number" ? row.length : Number(row.length ?? 0) || null,
    width: typeof row.width === "number" ? row.width : Number(row.width ?? 0) || null,
    height: typeof row.height === "number" ? row.height : Number(row.height ?? 0) || null,
    dimensions_raw: (row.dimensions_raw as string | null) ?? null,
    weight: typeof row.weight === "number" ? row.weight : Number(row.weight ?? 0) || null,
    quantity: typeof row.quantity === "number" ? row.quantity : Number(row.quantity ?? 0) || null,
    packages: typeof row.packages === "number" ? row.packages : Number(row.packages ?? 0) || null,
    volume_cbm:
      typeof row.volume_cbm === "number" ? row.volume_cbm : Number(row.volume_cbm ?? 0) || null,
    location: (row.location as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    status: (row.status as Item["status"]) ?? "not_scanned",
    scanned_at: (row.scanned_at as string | null) ?? null,
    scanned_by: (row.scanned_by as string | null) ?? null,
    is_duplicate_reference: Boolean(row.is_duplicate_reference),
  };
}

export const getUserContext = cache(async (): Promise<UserContext> => {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
    throw new Error("Unauthorized");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, organizations(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("No organization membership found");
  }

  const orgSource = membership.organizations as unknown;
  let organizationName = "Organization";

  if (Array.isArray(orgSource)) {
    const first = orgSource[0] as { name?: string } | undefined;
    organizationName = first?.name ?? organizationName;
  } else if (orgSource && typeof orgSource === "object") {
    const single = orgSource as { name?: string };
    organizationName = single.name ?? organizationName;
  }

  return {
    userId: user.id,
    email: user.email,
    organizationId: membership.organization_id,
    organizationName,
    role: membership.role,
  };
});

export async function getProjectsWithProgress() {
  const supabase = await createClient();
  const { organizationId } = await getUserContext();

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, project_type, description, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (projectsError) {
    throw projectsError;
  }

  const projectRows = ((projects ?? []) as unknown[]).map((row) => mapProject(row as Record<string, unknown>));
  const ids = projectRows.map((project) => project.id);

  if (!ids.length) {
    return [] as Array<Project & { progress: ProjectProgress | null }>;
  }

  const { data: progressRows, error: progressError } = await supabase
    .from("project_progress")
    .select(
      "project_id, total_items, scanned_items, missing_items, completion_percentage, duplicate_items, unknown_scans",
    )
    .in("project_id", ids);

  if (progressError) {
    throw progressError;
  }

  const progressById = new Map<string, ProjectProgress>(
    ((progressRows ?? []) as unknown[]).map((row) => {
      const parsed = mapProgress(row as Record<string, unknown>);
      return [parsed.project_id, parsed];
    }),
  );

  return projectRows.map((project) => ({
    ...project,
    progress: progressById.get(project.id) ?? null,
  }));
}

export async function getProjectById(projectId: string) {
  const supabase = await createClient();
  const { organizationId } = await getUserContext();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, project_type, description, created_at")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (projectError) {
    throw projectError;
  }

  if (!project) {
    return null;
  }

  const { data: progress, error: progressError } = await supabase
    .from("project_progress")
    .select(
      "project_id, total_items, scanned_items, missing_items, completion_percentage, duplicate_items, unknown_scans",
    )
    .eq("project_id", projectId)
    .maybeSingle();

  if (progressError) {
    throw progressError;
  }

  return {
    ...mapProject(project as unknown as Record<string, unknown>),
    progress: progress ? mapProgress(progress as unknown as Record<string, unknown>) : null,
  };
}

export async function getProjectItems(projectId: string, filter: string = "all") {
  const supabase = await createClient();

  let query = supabase
    .from("items")
    .select(
      [
        "id",
        "project_id",
        "system_barcode_id",
        "client_reference",
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
        "notes",
        "status",
        "scanned_at",
        "scanned_by",
        "is_duplicate_reference",
      ].join(","),
    )
    .eq("project_id", projectId)
    .order("row_number", { ascending: true })
    .limit(5000);

  if (filter === "scanned") {
    query = query.eq("status", "scanned");
  }

  if (filter === "missing") {
    query = query.eq("status", "not_scanned");
  }

  if (filter === "duplicates") {
    query = query.eq("is_duplicate_reference", true);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown[]).map((row) => mapItem(row as Record<string, unknown>));
}

export async function getUnknownScans(projectId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scan_logs")
    .select("id, scanned_barcode, scanned_at, scanned_by, device_info")
    .eq("project_id", projectId)
    .eq("result_type", "not_found")
    .order("scanned_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  return data ?? [];
}
