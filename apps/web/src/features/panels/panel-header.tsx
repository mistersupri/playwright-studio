import type { ReactNode } from "react";

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b pr-1.5 pl-3">
      <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</h2>
      {children}
    </div>
  );
}
