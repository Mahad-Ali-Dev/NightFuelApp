import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * PhoneShell — the shared CSS device frame for REAL app screenshots.
 * iPhone (Dynamic-Island pill) or Android (hole-punch camera), with an
 * optional ambient lime glow. Server-safe; the float animation is opt-in
 * via the `float` prop (keyframes defined in globals or locally by callers).
 */
export function PhoneShell({
  src,
  alt,
  os = 'android',
  glow = false,
  float = false,
  video,
  className,
}: {
  src: string;
  alt: string;
  os?: 'ios' | 'android';
  /** Render a soft lime radial glow behind the device. */
  glow?: boolean;
  /** Gentle idle float (requires the zeitra-phone-float keyframes). */
  float?: boolean;
  /** Optional screen-recording — autoplaying muted loop; `src` becomes the poster. */
  video?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      {glow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[92%] w-[110%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
          style={{
            background:
              'radial-gradient(circle, color-mix(in oklab, var(--color-lime) 40%, transparent), transparent 70%)',
          }}
        />
      )}
      <div
        className={cn(
          'relative rounded-[2.6rem] border border-black/20 bg-[#0b0d12] p-[10px] shadow-[0_45px_90px_-30px_rgba(10,14,8,0.5)] dark:border-white/10',
          float && 'phone-float',
        )}
      >
        <div className="relative overflow-hidden rounded-[2rem] bg-black">
          {video ? (
            <video
              className="block w-full select-none"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              poster={src}
              aria-label={alt}
            >
              <source src={video} type="video/mp4" />
            </video>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="block w-full select-none"
              draggable={false}
            />
          )}
          {os === 'ios' ? (
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-2.5 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black ring-1 ring-white/10"
            />
          ) : (
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-3 size-[14px] -translate-x-1/2 rounded-full bg-black ring-2 ring-black/80"
            />
          )}
        </div>
        <div
          aria-hidden="true"
          className="absolute -right-[2px] top-24 h-16 w-[3px] rounded-full bg-black/50 dark:bg-white/15"
        />
      </div>
    </div>
  );
}
