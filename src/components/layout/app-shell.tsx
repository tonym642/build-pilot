"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProjectPage = pathname.startsWith("/projects/");

  return (
    <div className="flex min-h-screen">
      {!isProjectPage && (
        <Suspense>
          <Sidebar />
        </Suspense>
      )}
      <div className="flex flex-1 flex-col" style={{ minWidth: 0 }}>
        {!isProjectPage && <Topbar />}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
