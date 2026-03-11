import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemsTable } from "@/components/projects/items-table";
import { LiveSyncIndicator } from "@/components/projects/live-sync-indicator";
import { ProjectNav } from "@/components/projects/project-nav";
import { getProjectById, getProjectItems, getUnknownScans } from "@/lib/domain/queries";

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ filter?: string }>;
};

export default async function ProjectDetailPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { filter = "all" } = await searchParams;

  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  const isUnknown = filter === "unknown";
  const items = isUnknown ? [] : await getProjectItems(projectId, filter);
  const unknownScans = isUnknown ? await getUnknownScans(projectId) : [];
  const isLoadingMode = project.project_type === "loading_check";
  const filters = [
    { key: "all", label: "All" },
    { key: "missing", label: isLoadingMode ? "Not Loaded Only" : "Missing Only" },
    { key: "scanned", label: isLoadingMode ? "Loaded Only" : "Scanned Only" },
    { key: "duplicates", label: "Duplicates" },
    { key: "unknown", label: "Unknown Scans" },
  ] as const;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
            {project.project_type === "stock_check" ? "Stock Check" : "Loading Check"}
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/projects/${projectId}/scan`}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Open scanner
          </Link>
          <Link
            href={`/projects/${projectId}/reports`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Export reports
          </Link>
        </div>
      </div>

      <ProjectNav projectId={projectId} currentPath={`/projects/${projectId}`} />
      <div className="mb-4">
        <LiveSyncIndicator projectId={projectId} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Expected" value={project.progress?.total_items ?? 0} />
        <Metric
          label={project.project_type === "stock_check" ? "Found" : "Loaded"}
          value={project.progress?.scanned_items ?? 0}
        />
        <Metric
          label={project.project_type === "stock_check" ? "Missing" : "Not Loaded"}
          value={project.progress?.missing_items ?? 0}
        />
        <Metric label="Duplicates" value={project.progress?.duplicate_items ?? 0} />
        <Metric label="Unknown Scans" value={project.progress?.unknown_scans ?? 0} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((currentFilter) => (
          <Link
            key={currentFilter.key}
            href={`/projects/${projectId}?filter=${currentFilter.key}`}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === currentFilter.key
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {currentFilter.label}
          </Link>
        ))}
      </div>

      {isUnknown ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Scanned Barcode</th>
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Device</th>
              </tr>
            </thead>
            <tbody>
              {unknownScans.map((scan) => (
                <tr key={scan.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-mono text-xs">{scan.scanned_barcode}</td>
                  <td className="px-3 py-2 text-xs">{new Date(scan.scanned_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs">{scan.scanned_by ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">{scan.device_info ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!unknownScans.length ? (
            <p className="p-6 text-sm text-zinc-600">No unknown scans recorded.</p>
          ) : null}
        </div>
      ) : (
        <ItemsTable
          projectId={projectId}
          projectType={project.project_type}
          items={items}
          emptyLabel="No items for current filter. Import an Excel file to load expected items."
        />
      )}
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
