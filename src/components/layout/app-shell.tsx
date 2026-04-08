"use client";

import { Suspense, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProjectPage = pathname.startsWith("/projects/");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(() => setMobileNavOpen((v) => !v), []);

  return (
    <div className="flex min-h-screen">
      {!isProjectPage && (
        <>
          {/* Desktop sidebar — unchanged */}
          <div className="mobile-hidden">
            <Suspense>
              <Sidebar onNavigate={closeMobileNav} />
            </Suspense>
          </div>

          {/* Mobile sidebar overlay */}
          {mobileNavOpen && (
            <div
              className="desktop-hidden fixed inset-0 z-[90]"
              style={{ background: "rgba(0,0,0,0.5)" }}
              onClick={closeMobileNav}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <Suspense>
                  <Sidebar onNavigate={closeMobileNav} />
                </Suspense>
              </div>
            </div>
          )}
        </>
      )}
      <div className="flex flex-1 flex-col" style={{ minWidth: 0 }}>
        {!isProjectPage && <Topbar onMenuToggle={toggleMobileNav} />}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
