"use client";

import type { Html5Qrcode } from "html5-qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

type ScanResponse = {
  result_type: "matched" | "already_scanned" | "not_found" | "manual_mark" | "unmark";
  message?: string;
  item_id?: string;
  client_reference?: string;
  urn?: string;
  package_number?: string;
  location?: string | null;
  item_name?: string;
  title?: string;
  scanned_at?: string | null;
};

type ListItem = {
  id: string;
  client_reference: string;
  urn: string | null;
  package_number: string | null;
  item_name: string | null;
  title: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimensions_raw: string | null;
  weight: number | null;
  quantity: number | null;
  packages: number | null;
  volume_cbm: number | null;
  location: string | null;
  italy_location: string | null;
  uk_location: string | null;
  notes: string | null;
  status: "not_scanned" | "scanned";
  scanned_at: string | null;
  system_barcode_id: string;
};

type Props = {
  projectId: string;
  modeLabel: string;
  isLoadingMode: boolean;
  initialScanned: number;
  initialMissing: number;
};

function formatDimensions(item: Pick<ListItem, "dimensions_raw" | "length" | "width" | "height">) {
  if (item.dimensions_raw) {
    return item.dimensions_raw;
  }

  if (item.length != null || item.width != null || item.height != null) {
    return `${item.length ?? "-"} x ${item.width ?? "-"} x ${item.height ?? "-"}`;
  }

  return null;
}

export function MobileScanner({
  projectId,
  modeLabel,
  isLoadingMode,
  initialScanned,
  initialMissing,
}: Props) {
  const scannedLabel = isLoadingMode ? "Loaded" : "Scanned";
  const missingLabel = isLoadingMode ? "Not loaded" : "Missing";

  const [isScannerActive, setIsScannerActive] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResponse | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState("");
  const [scannedCount, setScannedCount] = useState(initialScanned);
  const [missingCount, setMissingCount] = useState(initialMissing);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [list, setList] = useState<ListItem[]>([]);
  const [filter, setFilter] = useState<"missing" | "scanned" | "all">("missing");
  const [sort, setSort] = useState<"reference" | "location">("reference");
  const [searchResults, setSearchResults] = useState<ListItem[]>([]);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);

  const resultColor = useMemo(() => {
    if (!lastResult) {
      return "border-zinc-200 bg-white text-zinc-700";
    }

    if (lastResult.result_type === "matched" || lastResult.result_type === "manual_mark") {
      return "border-emerald-400 bg-emerald-50 text-emerald-800";
    }

    if (lastResult.result_type === "already_scanned") {
      return "border-amber-400 bg-amber-50 text-amber-800";
    }

    if (lastResult.result_type === "unmark") {
      return "border-blue-400 bg-blue-50 text-blue-800";
    }

    return "border-red-400 bg-red-50 text-red-800";
  }, [lastResult]);

  async function fetchList(nextFilter = filter, nextSort = sort) {
    setLoadingList(true);

    const params = new URLSearchParams({
      filter: nextFilter,
      sort: nextSort,
    });

    const response = await fetch(`/api/projects/${projectId}/search?${params.toString()}`);
    const payload = (await response.json()) as { items: ListItem[] };

    setList(payload.items ?? []);
    setLoadingList(false);
  }

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSearchResults = useCallback(async (term: string) => {
    const params = new URLSearchParams({ q: term, filter: "all", sort: "reference" });
    const response = await fetch(`/api/projects/${projectId}/search?${params.toString()}`);
    const payload = (await response.json()) as { items: ListItem[] };
    setSearchResults(payload.items ?? []);
  }, [projectId]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(() => {
      void fetchSearchResults(search);
    }, 250);

    return () => clearTimeout(timeout);
  }, [fetchSearchResults, search]);

  async function processBarcode(barcode: string) {
    if (lockRef.current) {
      return;
    }

    lockRef.current = true;

    try {
      const response = await fetch(`/api/projects/${projectId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", barcode }),
      });

      const payload = (await response.json()) as ScanResponse;
      setLastResult(payload);
      setLastScannedCode(barcode);

      if (payload.result_type === "matched" || payload.result_type === "manual_mark") {
        setScannedCount((value) => value + 1);
        setMissingCount((value) => Math.max(0, value - 1));
        if (typeof window !== "undefined") {
          window.navigator.vibrate?.(80);
        }
      }

      if (payload.result_type === "not_found" && typeof window !== "undefined") {
        window.navigator.vibrate?.([100, 60, 100]);
      }

      await fetchList();
      if (search.trim()) {
        await fetchSearchResults(search);
      }
    } finally {
      setTimeout(() => {
        lockRef.current = false;
      }, 500);
    }
  }

  async function toggleScanner() {
    if (isScannerActive) {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
      setIsScannerActive(false);
      return;
    }

    const { Html5Qrcode } = await import("html5-qrcode");

    const scanner = new Html5Qrcode("reader");
    scannerRef.current = scanner;

    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 6,
        qrbox: { width: 260, height: 110 },
        aspectRatio: 1.8,
      },
      (decodedText) => {
        void processBarcode(decodedText);
      },
      () => {
        // Ignore decode errors while scanning.
      },
    );

    setIsScannerActive(true);
  }

  async function manualMark(item: ListItem) {
    const response = await fetch(`/api/projects/${projectId}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "scan",
        barcode: item.system_barcode_id,
        manualItemId: item.id,
      }),
    });

    const payload = (await response.json()) as ScanResponse;
    setLastResult(payload);
    setLastScannedCode(item.system_barcode_id);

    if (payload.result_type === "manual_mark") {
      setScannedCount((value) => value + 1);
      setMissingCount((value) => Math.max(0, value - 1));
    }

    await fetchList();
    if (search.trim()) {
      await fetchSearchResults(search);
    }
  }

  async function unmarkItem(item: ListItem) {
    const confirmed = window.confirm(
      isLoadingMode
        ? "Unmark this item as loaded?"
        : "Unmark this item as scanned?",
    );

    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/projects/${projectId}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unmark", itemId: item.id }),
    });

    const payload = (await response.json()) as ScanResponse;
    setLastResult(payload);
    setLastScannedCode(item.system_barcode_id);

    if (payload.result_type === "unmark") {
      setScannedCount((value) => Math.max(0, value - 1));
      setMissingCount((value) => value + 1);
    }

    await fetchList();
    if (search.trim()) {
      await fetchSearchResults(search);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{modeLabel} Scanner</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MetricCard label={scannedLabel} value={scannedCount} tone="good" />
          <MetricCard label={missingLabel} value={missingCount} tone="warn" />
        </div>

        <button
          type="button"
          onClick={toggleScanner}
          className={cn(
            "mt-4 w-full rounded-xl px-4 py-4 text-base font-semibold text-white",
            isScannerActive ? "bg-red-600 hover:bg-red-700" : "bg-teal-700 hover:bg-teal-800",
          )}
        >
          {isScannerActive ? "Stop Scanner" : "Start Camera Scanner"}
        </button>

        <div id="reader" className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50" />
      </div>

      <div className={cn("rounded-2xl border p-4", resultColor)}>
        <p className="text-xs uppercase tracking-[0.18em]">Last result</p>
        <p className="mt-1 text-lg font-semibold">
          {lastResult
            ? lastResult.result_type === "matched"
              ? isLoadingMode
                ? "Loaded"
                : "Match found"
              : lastResult.result_type === "already_scanned"
                ? isLoadingMode
                  ? "Already loaded"
                  : "Already scanned"
                : lastResult.result_type === "manual_mark"
                  ? isLoadingMode
                    ? "Marked as loaded manually"
                    : "Marked as scanned manually"
                  : lastResult.result_type === "unmark"
                    ? isLoadingMode
                      ? "Unmarked from load"
                      : "Unmarked"
                    : "Unknown scan"
            : "No scans yet"}
        </p>
        <p className="mt-2 text-sm font-mono">{lastScannedCode || "-"}</p>
        {lastResult?.client_reference ? (
          <div className="mt-2 space-y-1 text-sm">
            {lastResult.urn ? <p className="font-mono text-base font-semibold">URN: {lastResult.urn}</p> : null}
            <p>
              {lastResult.client_reference}
              {lastResult.package_number ? ` | Pkg: ${lastResult.package_number}` : ""}
              {lastResult.location ? ` | Loc: ${lastResult.location}` : ""}
            </p>
            <p>
              {lastResult.item_name ? `${lastResult.item_name}` : "-"}
              {lastResult.title ? ` | ${lastResult.title}` : ""}
            </p>
          </div>
        ) : null}
        {lastResult?.scanned_at ? (
          <p className="mt-1 text-xs">Original timestamp: {new Date(lastResult.scanned_at).toLocaleString()}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">
          {isLoadingMode ? "Not Loaded Items Mode" : "Missing Items Mode"}
        </h2>

        <div className="mt-3 flex flex-wrap gap-2">
          <ToggleButton
            label={isLoadingMode ? "Not loaded" : "Missing"}
            active={filter === "missing"}
            onClick={() => {
              setFilter("missing");
              void fetchList("missing", sort);
            }}
          />
          <ToggleButton
            label={isLoadingMode ? "Loaded" : "Scanned"}
            active={filter === "scanned"}
            onClick={() => {
              setFilter("scanned");
              void fetchList("scanned", sort);
            }}
          />
          <ToggleButton
            label="All"
            active={filter === "all"}
            onClick={() => {
              setFilter("all");
              void fetchList("all", sort);
            }}
          />

          <select
            value={sort}
            onChange={(event) => {
              const nextSort = event.target.value as "reference" | "location";
              setSort(nextSort);
              void fetchList(filter, nextSort);
            }}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          >
            <option value="reference">Sort by reference</option>
            <option value="location">Sort by location</option>
          </select>
        </div>

        <div className="mt-3 max-h-72 space-y-2 overflow-auto">
          {loadingList ? <p className="text-sm text-zinc-500">Loading list...</p> : null}
          {!loadingList && !list.length ? <p className="text-sm text-zinc-500">No items for this filter.</p> : null}

          {list.map((item) => {
            const dimensions = formatDimensions(item);
            return (
              <div key={item.id} className="rounded-lg border border-zinc-200 p-3">
                <p className="font-mono text-xs text-zinc-700">URN: {item.urn ?? "-"}</p>
                <p className="font-mono text-xs text-zinc-700">{item.client_reference}</p>
                <p className="text-sm text-zinc-900">
                  {item.item_name ?? "-"}
                  {item.title ? ` | ${item.title}` : ""}
                </p>
                <p className="text-xs text-zinc-500">
                  {(item.location ?? item.italy_location ?? item.uk_location) ? `Loc: ${item.location ?? item.italy_location ?? item.uk_location}` : "No location"}
                  {item.notes ? ` | ${item.notes}` : ""}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {item.quantity != null ? `Qty: ${item.quantity}` : "Qty: -"}
                  {item.packages != null ? ` | Packages: ${item.packages}` : ""}
                  {dimensions ? ` | Dim: ${dimensions}` : ""}
                  {item.weight != null ? ` | W: ${item.weight}` : ""}
                  {item.volume_cbm != null ? ` | CBM: ${item.volume_cbm}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.status !== "scanned" ? (
                    <button
                      type="button"
                      onClick={() => manualMark(item)}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      {isLoadingMode ? "Manual mark as loaded" : "Manual mark as scanned"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => unmarkItem(item)}
                      className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      {isLoadingMode ? "Unmark loaded (UR)" : "Unmark scanned (UR)"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Manual Search</h2>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search URN, reference, location, title"
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <div className="mt-3 max-h-56 space-y-2 overflow-auto">
          {searchResults.map((item) => (
            <div key={item.id} className="rounded-lg border border-zinc-200 p-3">
              <p className="font-mono text-xs text-zinc-700">URN: {item.urn ?? "-"}</p>
                <p className="font-mono text-xs text-zinc-700">{item.client_reference}</p>
              <p className="text-sm text-zinc-900">
                {item.item_name ?? "-"}
                {item.title ? ` | ${item.title}` : ""}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-500">
                  {item.status === "scanned"
                    ? `${isLoadingMode ? "Loaded" : "Scanned"} at ${
                        item.scanned_at ? new Date(item.scanned_at).toLocaleString() : "-"
                      }`
                    : isLoadingMode
                      ? "Not loaded"
                      : "Not scanned"}
                </span>
                {item.status !== "scanned" ? (
                  <button
                    type="button"
                    onClick={() => manualMark(item)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    {isLoadingMode ? "Mark loaded" : "Mark scanned"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => unmarkItem(item)}
                    className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    {isLoadingMode ? "Unmark loaded (UR)" : "Unmark scanned (UR)"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {search && !searchResults.length ? (
            <p className="text-sm text-zinc-500">No items match this search.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "warn";
}) {
  return (
    <div className={cn("rounded-xl p-3", tone === "good" ? "bg-emerald-50" : "bg-amber-50")}>
      <p className="text-xs uppercase tracking-[0.15em] text-zinc-600">{label}</p>
      <p className="text-xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium",
        active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700",
      )}
    >
      {label}
    </button>
  );
}
