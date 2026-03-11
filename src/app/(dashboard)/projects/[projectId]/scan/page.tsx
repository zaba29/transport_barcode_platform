import { notFound } from "next/navigation";

import { ProjectNav } from "@/components/projects/project-nav";
import { MobileScanner } from "@/components/scanner/mobile-scanner";
import { getProjectById } from "@/lib/domain/queries";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ScanPage({ params }: PageProps) {
  const { projectId } = await params;
  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  const modeLabel = project.project_type === "stock_check" ? "Stock Check" : "Loading Check";
  const isLoadingMode = project.project_type === "loading_check";

  return (
    <div>
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Mobile Scanner</p>
        <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
      </div>

      <ProjectNav projectId={projectId} currentPath={`/projects/${projectId}/scan`} />

      <MobileScanner
        projectId={projectId}
        modeLabel={modeLabel}
        isLoadingMode={isLoadingMode}
        initialScanned={project.progress?.scanned_items ?? 0}
        initialMissing={project.progress?.missing_items ?? 0}
      />
    </div>
  );
}
