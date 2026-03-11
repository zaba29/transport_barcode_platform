import { notFound } from "next/navigation";

import { ProjectNav } from "@/components/projects/project-nav";
import { getProjectById, getProjectItems, getUnknownScans } from "@/lib/domain/queries";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ReconciliationPage({ params }: PageProps) {
  const { projectId } = await params;
  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  const [allItems, scannedItems, missingItems, duplicateItems, unknownScans] = await Promise.all([
    getProjectItems(projectId, "all"),
    getProjectItems(projectId, "scanned"),
    getProjectItems(projectId, "missing"),
    getProjectItems(projectId, "duplicates"),
    getUnknownScans(projectId),
  ]);
  const isLoadingMode = project.project_type === "loading_check";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Reconciliation</p>
        <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
      </div>

      <ProjectNav projectId={projectId} currentPath={`/projects/${projectId}/reconciliation`} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Full List" value={allItems.length} />
        <Metric label={isLoadingMode ? "Loaded List" : "Scanned List"} value={scannedItems.length} />
        <Metric label={isLoadingMode ? "Not Loaded List" : "Missing List"} value={missingItems.length} />
        <Metric label="Duplicate Warnings" value={duplicateItems.length} />
        <Metric label="Unknown Scans" value={unknownScans.length} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Export reconciliation packages</h2>
        <p className="mt-1 text-sm text-zinc-600">Use reports exports for printable and machine-readable outputs.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/api/projects/${projectId}/reports?type=reconciliation&format=pdf`}
            target="_blank"
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Reconciliation PDF
          </a>
          <a
            href={`/api/projects/${projectId}/reports?type=reconciliation&format=xlsx`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Reconciliation Excel
          </a>
          <a
            href={`/api/projects/${projectId}/reports?type=reconciliation&format=csv`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Reconciliation CSV
          </a>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
