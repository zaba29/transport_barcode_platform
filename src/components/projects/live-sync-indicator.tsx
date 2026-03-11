"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

type Props = {
  projectId: string;
};

export function LiveSyncIndicator({ projectId }: Props) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`project-${projectId}-live`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "items",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scan_logs",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, router]);

  return (
    <p className="text-xs font-medium text-teal-700">
      Live sync enabled. Dashboard refreshes when scans are recorded.
    </p>
  );
}
