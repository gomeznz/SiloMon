import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiloMon",
  description: "Silo level monitoring over Modbus-TCP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
