import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { MarkdownDoc } from '@/components/MarkdownDoc';

export const metadata: Metadata = {
    title: 'Terms of Service — NightFuel',
    description: 'The terms governing your use of NightFuel.',
};

/** Drop internal author notes (e.g. the "Legal review required" blockquote) from the public render. */
function stripInternalNotes(md: string): string {
    return md
        .split('\n')
        .filter((line) => !/^>\s*\*\*⚠️?\s*Legal review required/i.test(line))
        .join('\n');
}

export default function TermsPage() {
    const raw = fs.readFileSync(path.join(process.cwd(), 'content', 'terms.md'), 'utf8');
    return <MarkdownDoc kicker="Legal" content={stripInternalNotes(raw)} />;
}
