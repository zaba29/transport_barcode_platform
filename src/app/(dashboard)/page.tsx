import Link from "next/link";

import { getProjectsWithProgress } from "@/lib/domain/queries";

export default async function ProjectsHomePage() {
  const projects = await getProjectsWithProgress();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Projects</p>
          <h1 className="text-2xl font-semibold text-zinc-900">Warehouse and loading checks</h1>
        </div>
        <Link
          href="/projects/new"
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          New project
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const loadedLabel = project.project_type === "loading_check" ? "Loaded" : "Scanned";
          const missingLabel = project.project_type === "loading_check" ? "Not loaded" : "Missing";

          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-teal-300 hover:shadow"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900">{project.name}</h2>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                  {project.project_type === "stock_check" ? "Stock" : "Loading"}
                </span>
              </div>

              <p className="mt-3 text-sm text-zinc-600 line-clamp-2">
                {project.description ?? "No description provided."}
              </p>

              <div className="mt-4 space-y-1 text-sm text-zinc-700">
                <p>Total: {project.progress?.total_items ?? 0}</p>
                <p>{loadedLabel}: {project.progress?.scanned_items ?? 0}</p>
                <p>{missingLabel}: {project.progress?.missing_items ?? 0}</p>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-teal-600"
                  style={{ width: `${project.progress?.completion_percentage ?? 0}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>

      {!projects.length ? (
        <div className="mt-12 rounded-xl border border-dashed border-zinc-300 bg-white/70 p-10 text-center text-zinc-600">
          No projects yet. Create your first stock check or loading check project.
        </div>
      ) : null}
    </div>
  );
}
