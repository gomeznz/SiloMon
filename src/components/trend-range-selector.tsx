import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { TREND_RANGES, type TrendRangeKey } from "@/lib/trend-range";

// Plain links rather than client state: the range is a ?range= URL param
// read by the server page, so a chosen range survives a refresh and can be
// bookmarked or shared. scroll={false} keeps the viewport where it is
// instead of jumping to the top on every click.
export function TrendRangeSelector({ slug, active }: { slug: string; active: TrendRangeKey | null }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(TREND_RANGES) as TrendRangeKey[]).map((key) => (
        <Link
          key={key}
          href={`/${slug}?range=${key}`}
          scroll={false}
          className={buttonVariants({ variant: key === active ? "default" : "outline", size: "sm" })}
        >
          {TREND_RANGES[key].label}
        </Link>
      ))}
    </div>
  );
}
