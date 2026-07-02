import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { AppBadges } from '@/components/ui/app-badges';
import { getAllSlugs, getPost } from '@/components/site/blog';

/** Static export: every post is prerendered at build time. */
export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url: `https://zeitra.app/blog/${slug}`,
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    image: 'https://zeitra.app/og.png',
    mainEntityOfPage: `https://zeitra.app/blog/${slug}`,
    author: { '@type': 'Organization', name: 'Zeitra', url: 'https://zeitra.app' },
    publisher: {
      '@type': 'Organization',
      name: 'Zeitra',
      logo: { '@type': 'ImageObject', url: 'https://zeitra.app/icon-192.png' },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <Nav active="blog" />
      <main id="main" className="overflow-x-hidden pt-24 md:pt-28">
        <article className="section">
          <div className="container-x !max-w-[780px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              <a href="/blog" className="hover:text-[var(--color-lime-dark)]">Blog</a>
              {' '}· {post.date} · {post.minutes} min read
            </p>
            <h1 className="mt-3 [font-family:var(--font-display)] text-3xl font-bold leading-[1.1] tracking-[-0.02em] md:text-[2.6rem]">
              {post.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-[var(--color-muted-foreground)]">
              {post.description}
            </p>

            <div
              className="legal-prose mt-10"
              dangerouslySetInnerHTML={{ __html: post.html }}
            />

            {/* CTA */}
            <aside className="mt-14 rounded-2xl border border-[var(--color-lime)]/40 bg-[var(--color-lime)]/[0.07] p-7 text-center">
              <h2 className="[font-family:var(--font-display)] text-2xl font-bold tracking-[-0.01em]">
                Put this on autopilot
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
                Zeitra times your meals, caffeine and sleep around your real
                rota — automatically. 7-day free trial.
              </p>
              <div className="mt-5 flex justify-center">
                <AppBadges className="justify-center" />
              </div>
            </aside>

            <p className="mt-10 text-sm">
              <a href="/blog" className="font-semibold text-[var(--color-lime-dark)] underline-offset-4 hover:underline">
                ← All guides
              </a>
            </p>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
