"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export function AvatarMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdminOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Reset admin submenu when dropdown closes
  useEffect(() => {
    if (!open) setAdminOpen(false);
  }, [open]);

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center"
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          background: "linear-gradient(135deg, #5a9af5, #8b7cf5)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1,
        }}
        title="Account menu"
      >
        T
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 200,
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            zIndex: 200,
            overflow: "hidden",
            padding: "4px 0",
          }}
        >
          {/* Profile header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
            <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Tony Medina
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)", marginTop: 1 }}>
              Owner
            </p>
          </div>

          {/* Menu items */}
          <div style={{ padding: "4px 0" }}>
            <MenuButton
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
              label="Profile"
              onClick={() => {
                setOpen(false);
              }}
            />

            {/* Admin submenu */}
            <div>
              <MenuButton
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                }
                label="Admin"
                chevron
                onClick={() => setAdminOpen((v) => !v)}
              />

              {/* Admin sub-items */}
              {adminOpen && (
                <div style={{ paddingLeft: 14 }}>
                  <MenuButton
                    icon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001.08 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1.08z" />
                      </svg>
                    }
                    label="Modes"
                    sub
                    onClick={() => {
                      setOpen(false);
                      router.push("/settings");
                    }}
                  />
                  <MenuButton
                    icon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a4 4 0 014 4v1a1 1 0 001 1h1a4 4 0 010 8h-1a1 1 0 00-1 1v1a4 4 0 01-8 0v-1a1 1 0 00-1-1H5a4 4 0 010-8h1a1 1 0 001-1V6a4 4 0 014-4z" />
                        <circle cx="12" cy="12" r="2" />
                      </svg>
                    }
                    label="AI Engine"
                    sub
                    onClick={() => {
                      setOpen(false);
                      router.push("/settings/ai-engine");
                    }}
                  />
                  <MenuButton
                    icon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                      </svg>
                    }
                    label="Checklist"
                    sub
                    onClick={() => {
                      setOpen(false);
                      router.push("/settings/checklist");
                    }}
                  />
                  <MenuButton
                    icon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    }
                    label="Permissions"
                    sub
                    disabled
                    onClick={() => {}}
                  />
                </div>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "4px 0" }}>
            <MenuButton
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              }
              label="Log out"
              danger
              onClick={async () => {
                setOpen(false);
                const { createBrowserClient } = await import("@supabase/ssr");
                const supabase = createBrowserClient(
                  process.env.NEXT_PUBLIC_SUPABASE_URL!,
                  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  danger,
  chevron,
  sub,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  chevron?: boolean;
  sub?: boolean;
  disabled?: boolean;
}) {
  const baseColor = disabled
    ? "var(--text-muted)"
    : danger
    ? "#f87171"
    : "var(--text-secondary)";
  const hoverColor = disabled
    ? "var(--text-muted)"
    : danger
    ? "#fca5a5"
    : "var(--text-primary)";

  return (
    <button
      onClick={disabled ? undefined : onClick}
      className="flex w-full items-center gap-2.5 text-left text-[13px]"
      style={{
        padding: sub ? "6px 14px" : "7px 14px",
        fontSize: sub ? 12 : 13,
        background: "transparent",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        color: baseColor,
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = "var(--overlay-hover)";
          e.currentTarget.style.color = hoverColor;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = baseColor;
        }
      }}
    >
      <span className="flex shrink-0 items-center justify-center" style={{ width: 16 }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {disabled && (
        <span className="text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
          Soon
        </span>
      )}
      {chevron && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <polyline points="3,2 7,5 3,8" />
        </svg>
      )}
    </button>
  );
}
