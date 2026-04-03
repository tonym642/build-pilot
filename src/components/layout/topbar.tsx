import Link from "next/link";

export function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-white/[0.07] px-8">
      <Link href="/" className="text-sm font-semibold tracking-tight text-white hover:text-white/70 transition-colors">
        Build Pilot
      </Link>
      <div className="h-8 w-8 rounded-full bg-white/10" />
    </header>
  );
}
