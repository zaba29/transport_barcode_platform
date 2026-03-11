"use client";

import * as XLSX from "xlsx";
import { useMemo, useState } from "react";

import {
  createDefaultMapping,
  inferMapping,
  mappingFieldLabels,
  MAPPING_FIELDS,
  normalizeHeaderName,
  type MappingState,
} from "@/lib/import/header-mapping";

type ParsedSheet = {
  headers: string[];
  headerRowIndex: number;
  previewRows: Record<string, string>[];
};

const previewPriority = [
  "urn",
  "package no",
  "package number",
  "customer ref",
  "client reference",
  "qty",
  "quantity",
  "length",
  "width",
  "height",
  "weight",
  "volume",
  "packing",
  "location",
];

function detectHeaderRow(rows: Array<Array<string | number | boolean | null | undefined>>) {
  let bestIndex = 0;
  let bestScore = -1;

  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const row = rows[index] ?? [];
    const score = row.filter((value) => String(value ?? "").trim().length > 0).length;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function parseSheet(workbook: XLSX.WorkBook, sheetName: string): ParsedSheet {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return { headers: [], headerRowIndex: 0, previewRows: [] };
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  }) as Array<Array<string | number | boolean | null | undefined>>;

  if (!rows.length) {
    return { headers: [], headerRowIndex: 0, previewRows: [] };
  }

  const headerRowIndex = detectHeaderRow(rows);
  const rawHeaders = rows[headerRowIndex] ?? [];
  const headers = rawHeaders.map((header, idx) => {
    const value = String(header ?? "").trim();
    return value.length ? value : `column_${idx + 1}`;
  });

  const previewRows = rows.slice(headerRowIndex + 1, headerRowIndex + 11).map((row) => {
    const record: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      record[header] = String(row[columnIndex] ?? "").trim();
    });

    return record;
  });

  return {
    headers,
    headerRowIndex,
    previewRows,
  };
}

type Props = {
  projectId: string;
};

export function ExcelImportClient({ projectId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [mapping, setMapping] = useState<MappingState>(createDefaultMapping());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAllColumns, setShowAllColumns] = useState(false);

  const parsed = useMemo(() => {
    if (!workbook || !sheetName) {
      return null;
    }

    return parseSheet(workbook, sheetName);
  }, [workbook, sheetName]);

  const visibleHeaders = useMemo(() => {
    if (!parsed) {
      return [];
    }

    const candidates = parsed.headers
      .map((header) => {
        const nonEmptyCount = parsed.previewRows.filter((row) => String(row[header] ?? "").trim().length > 0).length;
        const normalized = normalizeHeaderName(header);
        const priority = previewPriority.findIndex((value) => normalized.includes(value));
        return {
          header,
          nonEmptyCount,
          priority: priority === -1 ? 999 : priority,
        };
      })
      .filter((item) => showAllColumns || item.nonEmptyCount > 0)
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        if (a.nonEmptyCount !== b.nonEmptyCount) {
          return b.nonEmptyCount - a.nonEmptyCount;
        }
        return a.header.localeCompare(b.header);
      });

    return candidates.map((item) => item.header);
  }, [parsed, showAllColumns]);

  async function onFileChange(selectedFile: File | null) {
    setFile(selectedFile);
    setWorkbook(null);
    setSheetName("");
    setMapping(createDefaultMapping());
    setError(null);
    setMessage(null);

    if (!selectedFile) {
      return;
    }

    const buffer = await selectedFile.arrayBuffer();
    const parsedWorkbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = parsedWorkbook.SheetNames[0] ?? "";

    setWorkbook(parsedWorkbook);
    setSheetName(firstSheet);
  }

  async function handleImport() {
    if (!file || !workbook || !sheetName || !parsed) {
      return;
    }

    if (!mapping.client_reference) {
      setError("Customer Ref mapping is required.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const payload = new FormData();
      payload.append("file", file);
      payload.append("sheetName", sheetName);
      payload.append("headerRowIndex", String(parsed.headerRowIndex));
      payload.append("mapping", JSON.stringify(mapping));

      const response = await fetch(`/api/projects/${projectId}/import`, {
        method: "POST",
        body: payload,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const result = isJson
        ? ((await response.json()) as { error?: string; importedCount?: number; duplicateCount?: number })
        : { error: await response.text() };

      if (!response.ok) {
        throw new Error(result.error ?? "Import failed");
      }

      setMessage(`Imported ${result.importedCount ?? 0} items. Duplicates flagged: ${result.duplicateCount ?? 0}.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">1. Upload Excel</h2>
        <input
          type="file"
          accept=".xlsx"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          className="mt-3 block w-full text-sm"
        />
      </div>

      {workbook ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">2. Choose sheet</h2>
          <select
            value={sheetName}
            onChange={(event) => setSheetName(event.target.value)}
            className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {workbook.SheetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {parsed ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">3. Map columns</h2>
            <button
              type="button"
              onClick={() => setMapping(inferMapping(parsed.headers))}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Auto-map warehouse/loading formats
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {MAPPING_FIELDS.map((field) => (
              <MappingSelect
                key={field}
                label={mappingFieldLabels[field]}
                value={mapping[field]}
                headers={parsed.headers}
                onChange={(value) => setMapping((previous) => ({ ...previous, [field]: value }))}
              />
            ))}
          </div>
        </div>
      ) : null}

      {parsed ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">4. Preview</h2>
              <p className="mt-1 text-xs text-zinc-600">Header row detected at spreadsheet row {parsed.headerRowIndex + 1}.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                checked={showAllColumns}
                onChange={(event) => setShowAllColumns(event.target.checked)}
              />
              Show all columns
            </label>
          </div>

          <div className="mt-3 overflow-x-auto border border-zinc-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-50">
                <tr>
                  {visibleHeaders.map((header) => (
                    <th key={header} className="px-2 py-2 uppercase tracking-wide text-zinc-500">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.previewRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-zinc-100">
                    {visibleHeaders.map((header) => (
                      <td key={header} className="px-2 py-2 text-zinc-700">
                        {row[header] || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}

      <button
        type="button"
        onClick={handleImport}
        disabled={!parsed || !mapping.client_reference || loading}
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Importing..." : "5. Import items"}
      </button>
    </div>
  );
}

type MappingSelectProps = {
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
};

function MappingSelect({ label, value, headers, onChange }: MappingSelectProps) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-zinc-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      >
        <option value="">Not mapped</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
}
