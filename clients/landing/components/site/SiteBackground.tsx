'use client';

import dynamic from 'next/dynamic';

/* Site-wide animated dot field (WebGL) — client-only. Kept subtle and fixed
   behind all content in both themes. `ssr: false` requires a Client Component
   in Next 16, so the dynamic import is isolated here. */
const DottedSurface = dynamic(
  () => import('@/components/ui/dotted-surface').then((m) => m.DottedSurface),
  { ssr: false },
);

export default function SiteBackground() {
  return <DottedSurface className="opacity-40" />;
}
