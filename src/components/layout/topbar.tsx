export function Topbar() {
  return (
    <header
      className="flex h-12 items-center justify-end px-6"
      style={{
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-subtle)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        className="h-7 w-7 rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />
    </header>
  );
}
