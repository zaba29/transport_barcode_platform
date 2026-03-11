import { notFound } from "next/navigation";

import { LabelsPanel } from "@/components/projects/labels-panel";
import { ProjectNav } from "@/components/projects/project-nav";
import { getProjectById } from "@/lib/domain/queries";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function LabelsPage({ params }: PageProps) {
  const { projectId } = await params;
  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  const supabase = await createClient();

  const { data: duplicates } = await supabase
    .from("items")
    .select("id, client_reference, item_name, title")
    .eq("project_id", projectId)
    .eq("is_duplicate_reference", true)
    .order("client_reference", { ascending: true })
    .limit(50);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Labels</p>
        <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
      </div>

      <ProjectNav projectId={projectId} currentPath={`/projects/${projectId}/labels`} />

      {duplicates?.length ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Duplicate client references detected</p>
          <p className="mt-1 text-xs text-red-700">
            Label generation still works, but duplicates are flagged for reconciliation.
          </p>
          <ul className="mt-2 max-h-52 overflow-auto text-xs text-red-800">
            {duplicates.map((item) => (
              <li key={item.id}>
                {item.client_reference} {item.item_name ? `| ${item.item_name}` : ""}
                {item.title ? ` | ${item.title}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <LabelsPanel projectId={projectId} isLoadingMode={project.project_type === "loading_check"} />
    </div>
  );
}
