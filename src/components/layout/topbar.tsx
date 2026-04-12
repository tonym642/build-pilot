import { ThemeToggle } from "./theme-context";
import { AvatarMenu } from "./avatar-menu";

export function Topbar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  return (
    <header
      className="flex h-12 items-center justify-between px-6"
      style={{
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-subtle)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        className="desktop-hidden flex items-center justify-center"
        onClick={onMenuToggle}
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: "transparent",
          border: "none",
          color: "var(--text-secondary)",
        }}
        aria-label="Toggle navigation"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M3 5h12M3 9h12M3 13h12" />
        </svg>
      </button>

      {/* Spacer for desktop (keeps items right-aligned) */}
      <div className="mobile-hidden flex-1" />

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <AvatarMenu />
      </div>
    </header>
  );
}
