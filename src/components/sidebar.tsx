import Link from "next/link";

import { signOutAction } from "@/app/(dashboard)/actions";

type SidebarProps = {
  orgName: string;
  userEmail?: string;
};

export function Sidebar({ orgName, userEmail }: SidebarProps) {
  return (
    <aside className="flex h-screen w-full max-w-xs flex-col border-r border-zinc-200 bg-white/80 px-4 py-5 backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Warehouse Ops</p>
        <p className="mt-1 text-lg font-semibold text-zinc-900">Transport Barcode Platform</p>
      </div>

      <div className="mt-8 space-y-2 text-sm">
        <Link href="/" className="block rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
          Projects
        </Link>
        <Link
          href="/projects/new"
          className="block rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100"
        >
          New Project
        </Link>
      </div>

      <div className="mt-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
        <p className="font-semibold text-zinc-900">{orgName}</p>
        <p className="mt-1 truncate">{userEmail}</p>
        <form action={signOutAction} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
