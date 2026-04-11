"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV_ITEMS = [
  {
    label: "All",
    filter: "All",
    color: "#5a9af5",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 5.5L7 2l5 3.5" />
        <path d="M3 6.5V11a1 1 0 001 1h6a1 1 0 001-1V6.5" />
      </svg>
    ),
  },
  {
    label: "Apps",
    filter: "Apps",
    color: "#8b7cf5",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="4" height="4" rx="1" />
        <rect x="8" y="2" width="4" height="4" rx="1" />
        <rect x="2" y="8" width="4" height="4" rx="1" />
        <rect x="8" y="8" width="4" height="4" rx="1" />
      </svg>
    ),
  },
  {
    label: "Books",
    filter: "Books",
    color: "#4ade80",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2.5A1.5 1.5 0 013.5 1H5a1 1 0 011 1v10a1 1 0 01-1 1H3.5A1.5 1.5 0 012 11.5V2.5z" />
        <path d="M6 2h4.5A1.5 1.5 0 0112 3.5v8a1.5 1.5 0 01-1.5 1.5H6V2z" />
      </svg>
    ),
  },
  {
    label: "Businesses",
    filter: "Businesses",
    color: "#fbbf24",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="7,1.5 8.5,5 12.5,5.3 9.5,7.8 10.4,11.8 7,9.6 3.6,11.8 4.5,7.8 1.5,5.3 5.5,5" />
      </svg>
    ),
  },
  {
    label: "Music",
    filter: "Music",
    color: "#5a9af5",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="4.5" cy="10.5" r="2" />
        <path d="M6.5 10.5V3l5-1.5v8" />
        <circle cx="9.5" cy="9.5" r="2" />
      </svg>
    ),
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHome = pathname === "/";
  const activeFilter = searchParams.get("filter") ?? "All";

  return (
    <aside
      className="flex w-[200px] shrink-0 flex-col"
      style={{
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-subtle)",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Brand */}
      <div style={{ padding: "14px 12px 18px" }}>
        <Link href="/" onClick={onNavigate}>
          <img
            src="/logo-light.png"
            alt="Build Pilot"
            style={{ height: 52, width: "auto" }}
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col" style={{ gap: 2, padding: "0 8px" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = isHome && activeFilter === item.filter;
          return (
            <Link
              key={item.filter}
              href={item.filter === "All" ? "/" : `/?filter=${item.filter}`}
              onClick={onNavigate}
              className="flex items-center"
              style={{
                gap: 10,
                padding: "7px 10px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                background: isActive ? "var(--overlay-active)" : "transparent",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--overlay-hover)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-tertiary)";
                }
              }}
            >
              <span
                className="flex shrink-0 items-center justify-center"
                style={{ width: 18, color: item.color, opacity: isActive ? 1 : 0.7 }}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
