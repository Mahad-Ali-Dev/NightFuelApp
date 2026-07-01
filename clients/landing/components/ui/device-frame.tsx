import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * DeviceFrame — a pure CSS/SVG phone shell (rounded bezel + dynamic-island
 * notch) with a lime-tinted gradient placeholder screen. It NEVER fakes app
 * UI: drop a real screenshot in later via `src`/`children`, and pass a short
 * `caption` shown under the frame.
 *
 *   <DeviceFrame caption="Ria plans your day" />
 *   <DeviceFrame src="/images/shot-home.webp" alt="Zeitra home screen" caption="Home" />
 *   <DeviceFrame caption="Timeline"><MyScreenshotNode /></DeviceFrame>
 *
 * Server-safe. Screen aspect is a fixed ~9:19.5 phone ratio.
 */
export interface DeviceFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional screenshot source (plain <img>, static-export safe, unoptimized). */
  src?: string;
  alt?: string;
  /** Caption shown beneath the device. */
  caption?: React.ReactNode;
  /** Custom screen content (overrides src). */
  children?: React.ReactNode;
  /** Frame width in px; height derives from the phone ratio. Default 260. */
  width?: number;
}

export function DeviceFrame({
  src,
  alt = '',
  caption,
  children,
  width = 260,
  className,
  ...rest
}: DeviceFrameProps) {
  return (
    <figure
      className={cn('flex flex-col items-center gap-3', className)}
      style={{ width }}
      {...rest}
    >
      <div
        className="relative w-full rounded-[2.6rem] p-[3px]"
        style={{
          background:
            'linear-gradient(160deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04) 40%, rgba(0,0,0,0.4))',
          boxShadow:
            '0 40px 90px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* bezel */}
        <div className="relative rounded-[2.4rem] bg-[#05060a] p-2.5">
          {/* screen */}
          <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[1.9rem] bg-[var(--color-panel)]">
            {/* dynamic island */}
            <div className="absolute left-1/2 top-2.5 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black/90 ring-1 ring-white/10" />

            {children ? (
              <div className="absolute inset-0">{children}</div>
            ) : src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              /* Intentional placeholder — lime-tinted gradient + grid, so a
                 missing screenshot still looks designed. */
              <div className="absolute inset-0">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(120% 80% at 50% -10%, rgba(168,204,60,0.28), transparent 55%), linear-gradient(180deg, #10131c, #0a0c12)',
                  }}
                />
                <div className="grid-bg absolute inset-0 opacity-60" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-lime)]/70">
                    Screenshot
                  </span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    Coming soon
                  </span>
                </div>
              </div>
            )}

            {/* subtle top glass sheen */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.08), transparent 22%)',
              }}
            />
          </div>
        </div>
      </div>

      {caption && (
        <figcaption className="text-center text-sm text-[var(--color-muted-foreground)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
