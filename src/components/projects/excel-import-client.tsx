"use client";

import * as XLSX from "xlsx";
import { useMemo, useState } from "react";

type MappingState = {
  client_reference: string;
  item_name: string;
  title: string;
  length: string;
  width: string;
  height: string;
  dimensions_raw: string;
  weight: string;
  quantity: string;
  packages: string;
  volume_cbm: string;
  location: string;
  notes: string;
  client: string;
  consignee: string;
  vehicle_route_reference: string;
};

type ParsedSheet = {
  headers: string[];
  headerRowIndex: number;
  previewRows: Record<string, string>[];
};

const optionalFields: Array<keyof Omit<MappingState, "client_reference">> = [
  "item_name",
  "title",
  "length",
  "width",
  "height",
  "dimensions_raw",
  "weight",
  "quantity",
  "packages",
  "volume_cbm",
  "location",
  "notes",
  "client",
  "consignee",
  "vehicle_route_reference",
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

const defaultMapping: MappingState = {
  client_reference: "",
  item_name: "",
  title: "",
  length: "",
  width: "",
  height: "",
  dimensions_raw: "",
  weight: "",
  quantity: "",
  packages: "",
  volume_cbm: "",
  location: "",
  notes: "",
  client: "",
  consignee: "",
  vehicle_route_reference: "",
};

export function ExcelImportClient({ projectId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [mapping, setMapping] = useState<MappingState>(defaultMapping);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const parsed = useMemo(() => {
    if (!workbook || !sheetName) {
      return null;
    }

    return parseSheet(workbook, sheetName);
  }, [workbook, sheetName]);

  async function onFileChange(selectedFile: File | null) {
    setFile(selectedFile);
    setWorkbook(null);
    setSheetName("");
    setMapping(defaultMapping);
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

  function inferMapping(headers: string[]) {
    const next: MappingState = { ...defaultMapping };

    const findHeader = (keywords: string[]) =>
      headers.find((header) => keywords.some((keyword) => header.toLowerCase().includes(keyword))) ?? "";

    next.client_reference = findHeader(["reference", "ref", "inventory", "id", "code"]);
    next.item_name = findHeader(["artist", "item", "name"]);
    next.title = findHeader(["title", "description", "artwork"]);
    next.length = findHeader(["length", "len", "lunghezza"]);
    next.width = findHeader(["width", "larghezza", "wide"]);
    next.height = findHeader(["height", "altezza"]);
    next.dimensions_raw = findHeader(["dimension", "size", "misure"]);
    next.weight = findHeader(["weight", "peso", "kg"]);
    next.quantity = findHeader(["qty", "quantity"]);
    next.packages = findHeader(["package", "packages", "colli", "pkg"]);
    next.volume_cbm = findHeader(["volume", "cbm", "m3"]);
    next.location = findHeader(["location", "warehouse", "slot"]);
    next.notes = findHeader(["notes", "remark"]);
    next.client = findHeader(["client", "customer"]);
    next.consignee = findHeader(["consignee"]);
    next.vehicle_route_reference = findHeader(["vehicle", "route", "load"]);

    setMapping(next);
  }

  async function handleImport() {
    if (!file || !workbook || !sheetName || !parsed) {
      return;
    }

    if (!mapping.client_reference) {
      setError("Reference column is required.");
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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Import failed");
      }

      setMessage(
        `Imported ${result.importedCount} items. Duplicates flagged: ${result.duplicateCount}.`,
      );
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
              onClick={() => inferMapping(parsed.headers)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Auto-map best guess
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <MappingSelect
              label="Reference Column (required)"
              value={mapping.client_reference}
              headers={parsed.headers}
              onChange={(value) => setMapping((previous) => ({ ...previous, client_reference: value }))}
            />

            {optionalFields.map((field) => (
              <MappingSelect
                key={field}
                label={field.replaceAll("_", " ")}
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
          <h2 className="text-lg font-semibold text-zinc-900">4. Preview</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Header row detected at spreadsheet row {parsed.headerRowIndex + 1}.
          </p>

          <div className="mt-3 overflow-x-auto border border-zinc-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-50">
                <tr>
                  {parsed.headers.map((header) => (
                    <th key={header} className="px-2 py-2 uppercase tracking-wide text-zinc-500">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.previewRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-zinc-100">
                    {parsed.headers.map((header) => (
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
