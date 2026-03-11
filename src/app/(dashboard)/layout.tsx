import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";
import { getUserContext } from "@/lib/domain/queries";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const context = await getUserContext();

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-100 via-white to-sky-100">
      <div className="mx-auto flex max-w-[1440px]">
        <Sidebar orgName={context.organizationName} userEmail={context.email} />
        <main className="min-h-screen flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
