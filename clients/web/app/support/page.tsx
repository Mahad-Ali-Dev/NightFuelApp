import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Support — Zeitra',
    description: 'Get help with Zeitra — contact support, report a bug, or manage your subscription.',
};

const FAQ = [
    {
        q: 'How do I cancel my subscription?',
        a: 'On iOS, manage your subscription in Settings → Apple ID → Subscriptions. On Android, open the Play Store → Subscriptions. Web subscriptions can be managed from Settings → Subscription inside the app.',
    },
    {
        q: 'The AI coach is slow or not responding.',
        a: 'Plan generation can take several seconds while it reads your circadian profile. If it consistently fails, check your connection and try again — your last plan is cached and still available offline.',
    },
    {
        q: 'How do I delete my account and data?',
        a: 'Go to Settings → Account → Delete Account, or email privacy@zeitra.app and we will remove your data within 30 days.',
    },
    {
        q: 'Is Zeitra medical advice?',
        a: 'No. Zeitra provides general chrono-nutrition and fitness guidance and is not a substitute for professional medical advice. Consult a healthcare provider before making significant dietary or training changes.',
    },
];

export default function SupportPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
                <Link
                    href="/"
                    className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    ← Back to Zeitra
                </Link>

                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-400">Support</p>
                <h1 className="mb-4 text-3xl font-bold text-white sm:text-4xl">How can we help?</h1>
                <p className="mb-10 text-neutral-300">
                    We&apos;re a small team and read every message. For the fastest help, email us directly —
                    we typically reply within one business day.
                </p>

                <div className="mb-12 grid gap-4 sm:grid-cols-2">
                    <a
                        href="mailto:support@zeitra.app"
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-brand-500/50"
                    >
                        <p className="text-sm font-semibold text-white">General support</p>
                        <p className="mt-1 text-sm text-brand-400">support@zeitra.app</p>
                    </a>
                    <a
                        href="mailto:billing@zeitra.app"
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-brand-500/50"
                    >
                        <p className="text-sm font-semibold text-white">Billing &amp; subscriptions</p>
                        <p className="mt-1 text-sm text-brand-400">billing@zeitra.app</p>
                    </a>
                    <a
                        href="mailto:privacy@zeitra.app"
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-brand-500/50"
                    >
                        <p className="text-sm font-semibold text-white">Privacy &amp; data requests</p>
                        <p className="mt-1 text-sm text-brand-400">privacy@zeitra.app</p>
                    </a>
                    <a
                        href="mailto:legal@zeitra.app"
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-brand-500/50"
                    >
                        <p className="text-sm font-semibold text-white">Legal</p>
                        <p className="mt-1 text-sm text-brand-400">legal@zeitra.app</p>
                    </a>
                </div>

                <h2 className="mb-4 border-b border-white/10 pb-2 text-2xl font-semibold text-white">
                    Frequently asked
                </h2>
                <div className="space-y-6">
                    {FAQ.map((item) => (
                        <div key={item.q}>
                            <p className="font-semibold text-white">{item.q}</p>
                            <p className="mt-1 text-sm text-neutral-300">{item.a}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-12 flex gap-4 border-t border-white/10 pt-6 text-sm text-muted-foreground">
                    <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
                    <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
                </div>
            </div>
        </div>
    );
}
