import { DocumentIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * A small, decorative stack of "document" cards — a gentle motif for the
 * empty states (chat welcome hero, empty corpus). Built entirely from design
 * tokens (zinc cards, the single blue accent on the front card, soft token
 * shadows) so it stays consistent with the rest of the chrome. Purely visual.
 */
export function DocumentStack({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative h-[104px] w-[188px] select-none", className)}
    >
      {/* Back card — furthest, faintest, tilted left. */}
      <Card className="absolute left-1 top-3 -rotate-[7deg] opacity-90 shadow-sm" />
      {/* Middle card — tilted right. */}
      <Card className="absolute right-1 top-6 rotate-[6deg] shadow-sm" />
      {/* Front card — centered, upright, accented and lifted. */}
      <Card
        accent
        className="absolute left-1/2 top-9 -translate-x-1/2 -rotate-[1deg] shadow-md"
      />
    </div>
  );
}

function Card({
  accent = false,
  className,
}: {
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-[132px] items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          accent
            ? "bg-accent-subtle text-accent"
            : "bg-surface-2 text-faint",
        )}
      >
        <DocumentIcon width={15} height={15} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-1.5 w-full rounded-full bg-surface-3" />
        <span className="h-1.5 w-2/3 rounded-full bg-surface-2" />
      </span>
    </div>
  );
}
