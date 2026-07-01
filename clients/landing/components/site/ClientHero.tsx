'use client';

import dynamic from 'next/dynamic';

/* Three.js / react-three-fiber cannot render on the server — load client-only.
   `ssr: false` is only allowed from a Client Component in Next 16, so the
   dynamic() call lives here rather than in app/page.tsx. A lightweight dark
   fallback fills the viewport while the 3D scene mounts (no white flash / CLS). */
const ExperienceHero = dynamic(
  () => import('@/components/ui/experience-hero').then((m) => m.ExperienceHero),
  {
    ssr: false,
    loading: () => (
      <section className="relative min-h-screen w-full bg-[#050604]">
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-white/40">
            Loading Zeitra…
          </span>
        </div>
      </section>
    ),
  },
);

export default function ClientHero() {
  return <ExperienceHero />;
}
