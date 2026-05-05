import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  critical: "bg-severity-critical/15 text-severity-critical border-severity-critical/40",
  high: "bg-severity-high/15 text-severity-high border-severity-high/40",
  medium: "bg-severity-medium/15 text-severity-medium border-severity-medium/40",
  low: "bg-severity-low/15 text-severity-low border-severity-low/40",
  unknown: "bg-severity-unknown/15 text-muted-foreground border-severity-unknown/40",
};

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider font-mono",
        styles[severity] ?? styles.unknown,
        className
      )}
    >
      {severity}
    </span>
  );
}
