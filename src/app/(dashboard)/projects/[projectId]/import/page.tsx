import { notFound } from "next/navigation";

import { ExcelImportClient } from "@/components/projects/excel-import-client";
import { ProjectNav } from "@/components/projects/project-nav";
import { getProjectById } from "@/lib/domain/queries";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectImportPage({ params }: PageProps) {
  const { projectId } = await params;

  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  return (
    <div>
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Import Excel</p>
        <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
      </div>

      <ProjectNav projectId={projectId} currentPath={`/projects/${projectId}/import`} />
      <ExcelImportClient projectId={projectId} />
    </div>
  );
}
