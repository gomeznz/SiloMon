import Link from "next/link";
import { SiloMonMark, SiloMonWordmark } from "@/components/logo";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-8 py-3">
        <Link href="/" className="flex items-center gap-3">
          <SiloMonMark className="h-9 w-9 shrink-0" />
          <div className="leading-tight">
            <SiloMonWordmark className="text-lg font-bold tracking-tight text-slate-900 dark:text-white" />
            <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              Silo level monitoring
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}
