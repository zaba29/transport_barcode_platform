import Link from "next/link";

import { cn } from "@/lib/utils/cn";

type ProjectNavProps = {
  projectId: string;
  currentPath: string;
};

const links = [
  { href: "", label: "Dashboard" },
  { href: "/import", label: "Import Excel" },
  { href: "/labels", label: "Labels" },
  { href: "/scan", label: "Scanner" },
  { href: "/reports", label: "Reports" },
  { href: "/reconciliation", label: "Reconciliation" },
];

export function ProjectNav({ projectId, currentPath }: ProjectNavProps) {
  return (
    <nav className="mb-5 flex flex-wrap gap-2">
      {links.map((link) => {
        const target = `/projects/${projectId}${link.href}`;
        const active = currentPath === target;

        return (
          <Link
            key={link.href || "dashboard"}
            href={target}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition",
              active ? "bg-teal-700 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
