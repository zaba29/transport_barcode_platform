"use client";

import { FormEvent, useState } from "react";

type Props = {
  projectId: string;
  isLoadingMode: boolean;
};

export function LabelsPanel({ projectId, isLoadingMode }: Props) {
  const [idsText, setIdsText] = useState("");

  function openPdf(scope: string, selected: string[] = []) {
    const params = new URLSearchParams({ scope });

    if (selected.length) {
      params.set("barcodes", selected.join(","));
    }

    window.open(`/api/projects/${projectId}/labels?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const selected = idsText
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (!selected.length) {
      return;
    }

    openPdf("selected", selected);
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Generate labels PDF</h2>
      <p className="text-sm text-zinc-600">
        Each label always encodes internal <code>system_barcode_id</code>. When available, URN is printed prominently alongside customer ref and package number.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openPdf("all")}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Print all labels
        </button>
        <button
          type="button"
          onClick={() => openPdf("missing")}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Print missing-only labels
        </button>
        <button
          type="button"
          onClick={() => openPdf("scanned")}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          {isLoadingMode ? "Print loaded-only labels" : "Print scanned-only labels"}
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700">Reprint selected barcode IDs</label>
        <textarea
          value={idsText}
          onChange={(event) => setIdsText(event.target.value)}
          rows={4}
          placeholder="PRJ123ABC-000001, PRJ123ABC-000125"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Reprint selected labels
        </button>
      </form>
    </div>
  );
}
