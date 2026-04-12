import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/layout/theme-context";
import { ModesProvider } from "@/components/layout/modes-context";
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
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <ThemeProvider>
          <ModesProvider>
            <AppShell>{children}</AppShell>
          </ModesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
