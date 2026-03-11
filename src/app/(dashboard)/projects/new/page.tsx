import { createProjectAction } from "@/app/(dashboard)/projects/new/actions";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Create Project</p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">New stock or loading check</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Start a project, import Excel, generate labels, then scan and reconcile.
      </p>

      <form action={createProjectAction} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Project name</span>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-teal-600 focus:ring"
            placeholder="Milan Warehouse Q2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Project type</span>
          <select
            name="projectType"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-teal-600 focus:ring"
            defaultValue="stock_check"
          >
            <option value="stock_check">Stock Check</option>
            <option value="loading_check">Loading Check</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Description</span>
          <textarea
            name="description"
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-teal-600 focus:ring"
            placeholder="Optional context for warehouse or vehicle loading operation"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Create project
        </button>
      </form>
    </div>
  );
}
