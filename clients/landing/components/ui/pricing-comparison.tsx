import { Fragment } from "react";
import { Check, Minus, MoveRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Rows: what separates Zeitra from the free/generic trackers.
const ROWS: { label: string; free: boolean | string; monthly: boolean | string; annual: boolean | string }[] = [
  { label: "Shift / schedule-aware timing", free: false, monthly: true, annual: true },
  { label: "Menstrual-cycle adaptation", free: false, monthly: true, annual: true },
  { label: "AI coach “Ria” (chat + voice)", free: false, monthly: true, annual: true },
  { label: "AI photo meal-logging", free: "Limited", monthly: true, annual: true },
  { label: "8,600+ food database + barcode", free: true, monthly: true, annual: true },
  { label: "Any-wearable Bluetooth sync", free: false, monthly: true, annual: true },
  { label: "Human-coaching marketplace", free: false, monthly: true, annual: true },
  { label: "Community & AI challenges", free: "Partial", monthly: true, annual: true },
];

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <Check className="w-4 h-4 text-[var(--color-lime)]" />;
  if (v === false) return <Minus className="w-4 h-4 text-muted-foreground/60" />;
  return <span className="text-muted-foreground text-xs">{v}</span>;
}

export function PricingComparison() {
  return (
    <div className="w-full">
      <div className="flex text-center justify-center items-center gap-4 flex-col">
        <Badge>Pricing</Badge>
        <div className="flex gap-2 flex-col">
          <h2 className="text-3xl md:text-5xl tracking-tighter max-w-xl text-center font-semibold [font-family:var(--font-display)]">
            One plan. <span className="gradient-text">Every feature.</span>
          </h2>
          <p className="text-lg leading-relaxed tracking-tight text-muted-foreground max-w-xl text-center">
            Start with a 7-day free trial — then everything, for the price of a couple of coffees. Cancel anytime.
          </p>
        </div>

        <div className="grid text-left w-full grid-cols-3 lg:grid-cols-4 divide-x divide-[var(--color-border)] pt-14 border border-[var(--color-border)] rounded-2xl overflow-hidden">
          <div className="col-span-3 lg:col-span-1 p-6 hidden lg:block" />

          {/* Plan-header cells: at phone width each column is ~120px, so the
              CTA buttons and blurbs hide below sm (hero + FinalCta carry the
              CTAs) and the type scales down — they overlapped otherwise. */}
          <div className="px-3 py-5 sm:px-4 md:px-6 gap-2 flex flex-col">
            <p className="text-sm font-semibold sm:text-xl sm:font-normal">Free apps</p>
            <p className="hidden text-sm text-muted-foreground sm:block">MyFitnessPal, Noom &amp; co.</p>
            <p className="flex items-baseline gap-1 text-xl mt-3 sm:mt-6"><span className="text-2xl sm:text-3xl">$0</span></p>
            <Button variant="ghost" className="hidden gap-2 mt-6 sm:inline-flex" disabled>Blind to your clock</Button>
          </div>

          <div className="px-3 py-5 sm:px-4 md:px-6 gap-2 flex flex-col">
            <p className="text-sm font-semibold sm:text-xl sm:font-normal">Zeitra Monthly</p>
            <p className="hidden text-sm text-muted-foreground sm:block">Full access, month to month.</p>
            <p className="flex items-baseline gap-1 text-xl mt-3 sm:mt-6"><span className="text-2xl sm:text-4xl">$9.99</span><span className="text-sm text-muted-foreground">/mo</span></p>
            <Button variant="secondary" className="hidden gap-2 mt-6 sm:inline-flex">Start free trial <MoveRight className="w-4 h-4" /></Button>
          </div>

          <div className="px-3 py-5 sm:px-4 md:px-6 gap-2 flex flex-col relative rounded-xl bg-[var(--color-lime)]/[0.06] ring-1 ring-[var(--color-lime)]/40">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold sm:text-xl sm:font-normal">Zeitra Annual</p>
              <Badge className="text-[10px]">Best value</Badge>
            </div>
            <p className="hidden text-sm text-muted-foreground sm:block">Founding member — save ~60%.</p>
            <p className="flex items-baseline gap-1 text-xl mt-3 sm:mt-6"><span className="text-2xl sm:text-4xl">$59</span><span className="text-sm text-muted-foreground">/yr</span></p>
            <Button className="hidden gap-2 mt-6 sm:inline-flex">Start free trial <MoveRight className="w-4 h-4" /></Button>
          </div>

          {ROWS.map((row) => (
            <Fragment key={row.label}>
              <div className="px-4 lg:px-6 col-span-3 lg:col-span-1 py-3.5 text-sm border-t border-[var(--color-border)]">{row.label}</div>
              <div className="px-4 py-3.5 md:px-6 flex justify-center border-t border-[var(--color-border)]"><Cell v={row.free} /></div>
              <div className="px-4 py-3.5 md:px-6 flex justify-center border-t border-[var(--color-border)]"><Cell v={row.monthly} /></div>
              <div className="px-4 py-3.5 md:px-6 flex justify-center border-t border-[var(--color-border)] bg-[var(--color-lime)]/[0.04]"><Cell v={row.annual} /></div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
