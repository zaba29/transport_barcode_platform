import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectNav } from "@/components/projects/project-nav";
import { getProjectById } from "@/lib/domain/queries";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ReportsPage({ params }: PageProps) {
  const { projectId } = await params;
  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  const reportCards =
    project.project_type === "loading_check"
      ? ([
          {
            title: "Loading List (Loaded Only)",
            key: "loaded",
            description: "Items loaded to vehicle with timestamps and logistics details.",
          },
          {
            title: "Missing From Load List",
            key: "not_loaded",
            description: "Expected items not loaded before departure.",
          },
          {
            title: "Full Reconciliation",
            key: "reconciliation",
            description: "Expected + loaded status + unknown scans + duplicate warnings + action history.",
          },
        ] as const)
      : ([
          {
            title: "Scanned Items Report",
            key: "scanned",
            description: "All matched or manually marked scanned items.",
          },
          {
            title: "Missing Items Report",
            key: "missing",
            description: "Expected items not yet scanned.",
          },
          {
            title: "Full Reconciliation",
            key: "reconciliation",
            description: "Expected + scanned status + unknown scans + duplicate warnings + action history.",
          },
        ] as const);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Reports</p>
        <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
      </div>

      <ProjectNav projectId={projectId} currentPath={`/projects/${projectId}/reports`} />

      <div className="grid gap-4 md:grid-cols-2">
        {reportCards.map((report) => (
          <div key={report.key} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">{report.title}</h2>
            <p className="mt-1 text-sm text-zinc-600">{report.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/api/projects/${projectId}/reports?type=${report.key}&format=pdf`}
                target="_blank"
                className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                PDF
              </Link>
              <Link
                href={`/api/projects/${projectId}/reports?type=${report.key}&format=xlsx`}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Excel
              </Link>
              <Link
                href={`/api/projects/${projectId}/reports?type=${report.key}&format=csv`}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              >
                CSV
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Barcode labels</h2>
        <p className="mt-1 text-sm text-zinc-600">Generate printable Code 128 labels from the Labels section.</p>
        <Link
          href={`/projects/${projectId}/labels`}
          className="mt-3 inline-block rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Go to labels
        </Link>
      </div>
    </div>
  );
}
