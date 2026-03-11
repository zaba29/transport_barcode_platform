# Transport and Warehouse Barcode Verification Platform (v1.1)

Cloud web platform for stock checks and vehicle loading checks.

Built with one codebase:
- `Next.js` app router (admin + mobile web scanner)
- `Supabase` (PostgreSQL, Auth, Storage, Realtime)
- `SheetJS` for dynamic Excel import
- `bwip-js` + `PDFKit` for Code 128 labels and reports

## Implemented v1 Scope

- Authentication with Supabase Auth (email/password + magic link)
- Multi-tenant org/project isolation via RLS
- Project modes: `stock_check`, `loading_check`
- Dynamic Excel import flow:
  - upload `.xlsx`
  - choose sheet
  - auto-detect headers
  - map required + optional columns
  - preview rows before import
  - optional logistics mappings: `length`, `width`, `height`, `dimensions_raw`, `weight`, `quantity`, `packages`, `volume_cbm`
- Item identifiers:
  - `client_reference` from mapped column
  - generated unique `system_barcode_id` per project row
- Label generation:
  - Code 128 barcode
  - A4 printable PDF
  - all/missing/scanned scopes
  - selected ID reprint
  - duplicate reference warnings
- Scanner workflow (iPhone Safari/PWA friendly):
  - camera scanning
  - matched/already-scanned/not-found results
  - manual search fallback
  - manual mark with audit trail
  - unmark (UR) with confirmation and audit trail
  - missing/scanned/all filters (default missing)
- Dashboard and reconciliation:
  - progress cards
  - item status table
  - optional dimensions/weight/package/volume columns
  - duplicate and unknown scan visibility
  - realtime refresh (Supabase Realtime)
- Exports:
  - scanned list / loaded list
  - missing list / not loaded list
  - loading list with quantity/packages/dimensions/weight/location/timestamp when available
  - full reconciliation
  - action history included in reconciliation exports
  - PDF, CSV, XLSX

## Project Structure

- `src/app/(auth)/login` login UI
- `src/app/(dashboard)` protected app shell + pages
- `src/app/api/projects/...` import, scan, labels, reports API routes
- `src/components/projects` import, labels, tables, nav, realtime
- `src/components/scanner` mobile scanner UI
- `src/lib/supabase` browser/server/admin Supabase clients
- `src/lib/domain` shared domain queries/types
- `supabase/migrations/202603111040_init_transport_platform.sql` DB schema + RLS + scan RPC
- `supabase/migrations/202603111230_v1_1_dimensions_unmark.sql` v1.1 logistics + unmark extension
- `scripts/seed-demo.mjs` demo seed from `.xlsx`

## Database / Migration Setup

1. Create a Supabase project.
2. Run SQL migration from:
   - `supabase/migrations/202603111040_init_transport_platform.sql`
   - `supabase/migrations/202603111230_v1_1_dimensions_unmark.sql`
3. Confirm bucket exists:
   - `excel-files` (private)
4. In Supabase Auth, ensure email/password provider is enabled.
5. In Supabase Realtime, enable Postgres changes for:
   - `public.items`
   - `public.scan_logs`

Notes:
- RLS policies scope data to organization membership.
- New users automatically get:
  - `profiles` row
  - default organization
  - owner membership
- Scan processing is centralized in PostgreSQL function `public.process_scan(...)`.
- Unmark/UR is handled by PostgreSQL function `public.process_unmark(...)`.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Optional for demo seed:
DEMO_USER_ID=...
```

4. Start app:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Deployment (Vercel + Supabase)

1. Push this folder to your Git repository.
2. Create a Vercel project from that repository.
3. Add environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (production URL)
4. Deploy.
5. In Supabase Auth URL settings, add:
   - Site URL (production)
   - Redirect URL: `https://YOUR_DOMAIN/auth/callback`

## Demo Seed Workflow (Sample Excel)

Supports your provided sample file path by default:
- `/Users/lukaszjarocki/Downloads/Nicola L._work list_restitution_2026.xlsx`

Run:

```bash
npm run seed:demo
```

Optional custom file:

```bash
npm run seed:demo -- "/absolute/path/to/sample.xlsx"
```

What it does:
- creates demo loading project
- imports first sheet
- auto-maps likely columns
- imports up to 1000 rows
- flags duplicates
- outputs created `Project ID`

## Operational Workflow

1. Create project
2. Import Excel
3. Map reference column (`client_reference`) and optional columns
4. Generate labels PDF
5. Open mobile scanner
6. Scan items during stock check/loading
7. Export scanned/missing/loading/reconciliation reports (or loaded/not-loaded for loading mode)

## Notes and Next Iterations

Planned later (not in current v1):
- offline scan queue/sync
- signature/photo proof
- route planning
- vehicle assignment
- client portal
