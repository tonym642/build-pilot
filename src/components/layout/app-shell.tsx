"use client";

import { Suspense, useState, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { SidebarContext } from "./sidebar-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isProjectPage = pathname.startsWith("/projects/");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(() => setMobileNavOpen((v) => !v), []);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);

  const sidebarCtx = useMemo(() => ({ openMainSidebar: openMobileNav }), [openMobileNav]);

  // Login page renders without shell chrome
  if (isLoginPage) return <>{children}</>;

  return (
    <SidebarContext.Provider value={sidebarCtx}>
      <div className="flex min-h-screen">
        {/* Desktop sidebar — only on non-project pages */}
        {!isProjectPage && (
          <div className="mobile-hidden">
            <Suspense>
              <Sidebar onNavigate={closeMobileNav} />
            </Suspense>
          </div>
        )}

        {/* Sidebar overlay — mobile on home, hamburger-triggered on project pages */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-[90]"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={closeMobileNav}
          >
            <div style={{ width: "fit-content", height: "100%" }} onClick={(e) => e.stopPropagation()}>
              <Suspense>
                <Sidebar onNavigate={closeMobileNav} />
              </Suspense>
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col" style={{ minWidth: 0 }}>
          {!isProjectPage && <Topbar onMenuToggle={toggleMobileNav} />}
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
