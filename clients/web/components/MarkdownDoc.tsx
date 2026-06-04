'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

interface MarkdownDocProps {
    /** Raw markdown source to render. */
    content: string;
    /** Optional kicker shown above the document (e.g. "Legal"). */
    kicker?: string;
}

/**
 * Renders a long-form legal/markdown document with the NightFuel dark theme.
 * Styling is applied via an explicit component map so we don't depend on the
 * Tailwind typography plugin.
 */
export function MarkdownDoc({ content, kicker }: MarkdownDocProps) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
                <Link
                    href="/"
                    className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    ← Back to NightFuel
                </Link>
                {kicker && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-400">
                        {kicker}
                    </p>
                )}
                <article className="space-y-4 leading-relaxed text-neutral-300">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h1: ({ children }) => (
                                <h1 className="mb-4 mt-2 text-3xl font-bold text-white sm:text-4xl">{children}</h1>
                            ),
                            h2: ({ children }) => (
                                <h2 className="mb-3 mt-10 border-b border-white/10 pb-2 text-2xl font-semibold text-white">{children}</h2>
                            ),
                            h3: ({ children }) => (
                                <h3 className="mb-2 mt-6 text-lg font-semibold text-white">{children}</h3>
                            ),
                            p: ({ children }) => <p className="text-sm sm:text-base">{children}</p>,
                            ul: ({ children }) => <ul className="ml-5 list-disc space-y-1.5 text-sm sm:text-base">{children}</ul>,
                            ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1.5 text-sm sm:text-base">{children}</ol>,
                            li: ({ children }) => <li className="pl-1">{children}</li>,
                            a: ({ href, children }) => (
                                <a href={href} className="text-brand-400 underline underline-offset-2 hover:text-brand-300">{children}</a>
                            ),
                            strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                            blockquote: ({ children }) => (
                                <blockquote className="border-l-2 border-brand-500/50 bg-white/[0.03] py-1 pl-4 text-sm italic text-neutral-400">{children}</blockquote>
                            ),
                            code: ({ children }) => (
                                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-brand-300">{children}</code>
                            ),
                            hr: () => <hr className="my-8 border-white/10" />,
                            table: ({ children }) => (
                                <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>
                            ),
                            th: ({ children }) => <th className="border border-white/10 bg-white/5 px-3 py-2 text-left font-semibold text-white">{children}</th>,
                            td: ({ children }) => <td className="border border-white/10 px-3 py-2">{children}</td>,
                        }}
                    >
                        {content}
                    </ReactMarkdown>
                </article>
            </div>
        </div>
    );
}
