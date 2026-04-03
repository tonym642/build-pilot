import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Build Pilot",
  description: "Think. Commit. Build.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#1c1f26] text-white antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
