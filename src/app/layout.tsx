import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiloMon",
  description: "Silo level monitoring over Modbus-TCP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Header />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-slate-200 px-8 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Developed by Advanced Systems Integration 2022 - Software and Compliance Division
          <span className="text-slate-400 dark:text-slate-600"> · v{process.env.APP_VERSION ?? "dev"}</span>
        </footer>
      </body>
    </html>
  );
}
