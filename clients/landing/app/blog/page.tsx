import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { SectionShell } from '@/components/ui/section-shell';
import { GradientText } from '@/components/ui/gradient-text';
import { getAllPosts } from '@/components/site/blog';

export const metadata: Metadata = {
  title: 'Blog — Nutrition & Training for Shift Workers',
  description:
    'Practical, science-backed guides on chrono-nutrition, night-shift meal timing, caffeine cut-offs, day-sleep and training on a rota.',
  alternates: { canonical: '/blog' },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <>
      <Nav active="blog" />
      <main id="main" className="overflow-x-hidden pt-24 md:pt-28">
        <SectionShell
          align="left"
          eyebrow="The Zeitra blog"
          title={
            <>
              Fuel for the people the <GradientText>9-to-5 forgets</GradientText>
            </>
          }
          subtitle="Practical, science-backed guides on eating, training and sleeping around a real rota."
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:gap-5">
            {posts.map((post) => (
              <li key={post.slug}>
                <a
                  href={`/blog/${post.slug}`}
                  className="flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--color-lime)]/45 hover:shadow-[0_18px_40px_-24px_rgba(15,23,20,0.18)] md:p-7"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
                    {post.date} · {post.minutes} min read
                  </p>
                  <h2 className="mt-2 [font-family:var(--font-display)] text-xl font-bold leading-snug tracking-[-0.01em]">
                    {post.title}
                  </h2>
                  <p className="mt-3 flex-1 text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
                    {post.description}
                  </p>
                  <span className="mt-4 text-sm font-semibold text-[var(--color-lime-dark)]">
                    Read the guide →
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </SectionShell>
      </main>
      <Footer />
    </>
  );
}
