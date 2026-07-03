'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';

/* Site-wide animated dot field (WebGL) — client-only. Kept subtle and fixed
   behind all content in both themes. `ssr: false` requires a Client Component
   in Next 16, so the dynamic import is isolated here.

   LIGHT is the primary experience: on a near-white base a dense dot field reads
   as visual noise, so we drop it to a faint texture (opacity-[0.12]). DARK keeps
   a stronger presence (opacity-40) where the dots glow against the dark canvas. */
const DottedSurface = dynamic(
  () => import('@/components/ui/dotted-surface').then((m) => m.DottedSurface),
  { ssr: false },
);

export default function SiteBackground() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <DottedSurface
      className={
        isDark
          ? 'opacity-40 transition-opacity duration-500'
          : 'opacity-[0.12] transition-opacity duration-500'
      }
    />
  );
}
