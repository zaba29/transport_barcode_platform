export type ProjectType = "stock_check" | "loading_check";
export type ItemStatus = "not_scanned" | "scanned";

export type Project = {
  id: string;
  name: string;
  project_type: ProjectType;
  description: string | null;
  created_at: string;
};

export type ProjectProgress = {
  project_id: string;
  total_items: number;
  scanned_items: number;
  missing_items: number;
  completion_percentage: number;
  duplicate_items: number;
  unknown_scans: number;
};

export type Item = {
  id: string;
  project_id: string;
  system_barcode_id: string;
  client_reference: string;
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
  notes: string | null;
  status: ItemStatus;
  scanned_at: string | null;
  scanned_by: string | null;
  is_duplicate_reference: boolean;
};

export type ScanResultType = "matched" | "already_scanned" | "not_found" | "manual_mark" | "unmark";

export type ScanResult = {
  result_type: ScanResultType;
  message?: string;
  item_id?: string;
  client_reference?: string;
  item_name?: string;
  title?: string;
  scanned_at?: string;
};
