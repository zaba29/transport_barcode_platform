"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Item, ProjectType } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

type ItemsTableProps = {
  projectId: string;
  projectType: ProjectType;
  items: Item[];
  emptyLabel: string;
};

function formatDimensions(item: Item) {
  if (item.dimensions_raw) {
    return item.dimensions_raw;
  }

  if (item.length != null || item.width != null || item.height != null) {
    return `${item.length ?? "-"} x ${item.width ?? "-"} x ${item.height ?? "-"}`;
  }

  return "-";
}

export function ItemsTable({ projectId, projectType, items, emptyLabel }: ItemsTableProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const isLoadingMode = projectType === "loading_check";
  const scannedLabel = isLoadingMode ? "Loaded" : "Scanned";
  const missingLabel = isLoadingMode ? "Not loaded" : "Missing";

  async function unmark(item: Item) {
    const confirmed = window.confirm(
      isLoadingMode ? "Unmark this item as loaded?" : "Unmark this item as scanned?",
    );

    if (!confirmed) {
      return;
    }

    setPendingId(item.id);

    try {
      const response = await fetch(`/api/projects/${projectId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unmark", itemId: item.id }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to unmark item");
      }

      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to unmark item");
    } finally {
      setPendingId(null);
    }
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Client Reference</th>
            <th className="px-3 py-2">Barcode ID</th>
            <th className="px-3 py-2">Item / Artist</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Packages</th>
            <th className="px-3 py-2">Dimensions</th>
            <th className="px-3 py-2">Weight</th>
            <th className="px-3 py-2">Volume (CBM)</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Scanned / Loaded At</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className={cn(
                "border-t border-zinc-100",
                item.status === "scanned" ? "bg-emerald-50/60" : "bg-white",
              )}
            >
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-xs font-semibold",
                    item.status === "scanned"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700",
                  )}
                >
                  {item.status === "scanned" ? scannedLabel : missingLabel}
                </span>
                {item.is_duplicate_reference ? (
                  <p className="mt-1 text-xs font-medium text-red-600">Duplicate reference</p>
                ) : null}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{item.client_reference}</td>
              <td className="px-3 py-2 font-mono text-xs">{item.system_barcode_id}</td>
              <td className="px-3 py-2">{item.item_name ?? "-"}</td>
              <td className="px-3 py-2">{item.title ?? "-"}</td>
              <td className="px-3 py-2">{item.quantity ?? "-"}</td>
              <td className="px-3 py-2">{item.packages ?? "-"}</td>
              <td className="px-3 py-2 text-xs">{formatDimensions(item)}</td>
              <td className="px-3 py-2">{item.weight ?? "-"}</td>
              <td className="px-3 py-2">{item.volume_cbm ?? "-"}</td>
              <td className="px-3 py-2">{item.location ?? "-"}</td>
              <td className="px-3 py-2 text-xs text-zinc-600">
                {item.scanned_at ? new Date(item.scanned_at).toLocaleString() : "-"}
              </td>
              <td className="px-3 py-2">
                {item.status === "scanned" ? (
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void unmark(item)}
                    className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                  >
                    {pendingId === item.id
                      ? "Processing..."
                      : isLoadingMode
                        ? "Unmark loaded (UR)"
                        : "Unmark scanned (UR)"}
                  </button>
                ) : (
                  <span className="text-xs text-zinc-400">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
