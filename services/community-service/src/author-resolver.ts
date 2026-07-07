import jwt from 'jsonwebtoken';
import { createLogger } from '@nightfuel/config';

const logger = createLogger('community.author-resolver');

// ── Public author shape attached to posts/comments ─────────────────────────────
export interface Author {
    id: string;
    name: string;
    avatarUrl: string | null;
    // Privacy flag composed from the user-service public profile. Additive:
    // defaults to `false` when the upstream field is absent (pre-item-4).
    isPrivate: boolean;
}

// Shape returned by user-service GET /v1/users/public/:userId.
// `isPrivate` is additive (item 4) — treated as `false` when missing.
interface PublicProfileResponse {
    id: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    timezone?: string | null;
    isPrivate?: boolean | null;
}

interface CacheEntry {
    author: Author;
    expiresAt: number;
}

const DEFAULT_USER_SERVICE_URL = 'http://user-service:3009';
const CACHE_TTL_MS = 60_000; // ~60s in-memory TTL
const REQUEST_TIMEOUT_MS = 3_000;
// MEDIUM #15: bound the in-memory cache. Without a cap + expiry sweep the Map
// grew unbounded (one entry per ever-seen author, never evicted). We cap the
// live size and lazily sweep expired entries; once at the cap we drop the
// oldest entries (insertion order) to make room.
const CACHE_MAX_ENTRIES = 10_000;
// Hard cap on ids resolved in a single batch round-trip — mirrors the
// user-service POST /v1/users/public/batch bound so a huge feed page is split
// into bounded chunks instead of being rejected.
const BATCH_MAX_IDS = 100;

/**
 * Resolves community author identities (displayName + avatarUrl) from the
 * user-service. Adds a short-lived in-memory cache so repeated feed loads do
 * not refetch the same authors. All resolution failures degrade gracefully:
 * a missing author is simply omitted, never thrown.
 */
export class AuthorResolver {
    private cache = new Map<string, CacheEntry>();
    private readonly baseUrl: string;

    constructor(private readonly jwtSecret: string, baseUrl?: string) {
        this.baseUrl = (baseUrl ?? DEFAULT_USER_SERVICE_URL).replace(/\/+$/, '');
    }

    /**
     * Resolve a unique set of author ids to Author objects.
     * Returns a Map keyed by id; ids that fail to resolve are absent from the map.
     */
    async resolveMany(ids: Array<string | null | undefined>): Promise<Map<string, Author>> {
        const result = new Map<string, Author>();

        // Dedupe + drop falsy ids.
        const uniqueIds = [...new Set(ids.filter((id): id is string => !!id))];
        if (uniqueIds.length === 0) return result;

        const now = Date.now();

        // MEDIUM #15: opportunistically sweep expired entries on each resolve so
        // the cache doesn't accumulate dead entries between reads.
        this.sweepExpired(now);

        const toFetch: string[] = [];

        // Serve from cache where possible.
        for (const id of uniqueIds) {
            const cached = this.cache.get(id);
            if (cached && cached.expiresAt > now) {
                result.set(id, cached.author);
            } else {
                toFetch.push(id);
            }
        }

        if (toFetch.length > 0) {
            // Mint a single short-lived token for this batch of internal calls.
            const token = this.mintInternalToken();

            // HIGH #4: resolve ALL uncached ids via the batch endpoint in ONE
            // round-trip (chunked to the endpoint's bound) instead of N separate
            // GET /public/:id calls. On any batch failure we fall back to the
            // per-id single-fetch path for the ids that chunk still owes, so a
            // batch-endpoint outage degrades to the old behaviour, never to an
            // empty feed.
            for (let i = 0; i < toFetch.length; i += BATCH_MAX_IDS) {
                const chunk = toFetch.slice(i, i + BATCH_MAX_IDS);
                const fetched = await this.fetchAuthorsBatch(chunk, token);

                if (fetched) {
                    for (const author of fetched) {
                        this.setCache(author);
                        result.set(author.id, author);
                    }
                } else {
                    // Fallback: per-id single-fetch (the original path).
                    const singles = await Promise.all(
                        chunk.map((id) => this.fetchAuthor(id, token))
                    );
                    for (const author of singles) {
                        if (author) {
                            this.setCache(author);
                            result.set(author.id, author);
                        }
                    }
                }
            }
        }

        return result;
    }

    // ── Cache management (MEDIUM #15) ────────────────────────────────────────────

    /** Insert/refresh a cache entry, enforcing the size cap (drop-oldest). */
    private setCache(author: Author): void {
        // Re-insert moves the key to the end (newest) of the Map's order.
        this.cache.delete(author.id);
        this.cache.set(author.id, { author, expiresAt: Date.now() + CACHE_TTL_MS });

        // Enforce the hard cap: evict oldest (insertion-order) entries first.
        while (this.cache.size > CACHE_MAX_ENTRIES) {
            const oldest = this.cache.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            this.cache.delete(oldest);
        }
    }

    /** Remove every entry whose TTL has elapsed. O(n) but bounded by the cap. */
    private sweepExpired(now: number = Date.now()): void {
        for (const [id, entry] of this.cache) {
            if (entry.expiresAt <= now) this.cache.delete(id);
        }
    }

    /**
     * Attach `author: { id, name, avatarUrl }` to each item that has an
     * `authorId`. Additive and backward-compatible: all existing fields are
     * preserved, and items whose author cannot be resolved are returned
     * unchanged (no `author` key).
     */
    async attachAuthors<T extends { authorId?: string | null }>(
        items: T[]
    ): Promise<Array<T & { author?: Author }>> {
        if (!items || items.length === 0) return items as Array<T & { author?: Author }>;

        const authors = await this.resolveMany(items.map((i) => i.authorId));

        return items.map((item) => {
            const author = item.authorId ? authors.get(item.authorId) : undefined;
            return author ? { ...item, author } : item;
        });
    }

    /** Attach an author to a single item (e.g. a post detail). */
    async attachAuthor<T extends { authorId?: string | null }>(
        item: T
    ): Promise<T & { author?: Author }> {
        if (!item) return item;
        const [enriched] = await this.attachAuthors([item]);
        return enriched;
    }

    /**
     * Resolve a single user id to its Author (id + name + avatar + isPrivate).
     * Returns `null` when the id is falsy or the profile cannot be resolved —
     * the caller decides how to degrade. Used by the privacy composition where
     * the target user may not appear in any feed batch.
     */
    async resolveOne(id: string | null | undefined): Promise<Author | null> {
        if (!id) return null;
        const resolved = await this.resolveMany([id]);
        return resolved.get(id) ?? null;
    }

    // ── Internals ──────────────────────────────────────────────────────────────

    private mintInternalToken(): string {
        // Mirror the auth-service payload shape ({ userId, role }) so the
        // user-service JWT verification + payload extraction both succeed.
        return jwt.sign(
            { userId: 'community-service', role: 'SYSTEM' },
            this.jwtSecret,
            { expiresIn: '60s' }
        );
    }

    /**
     * Resolve a chunk of ids in ONE round-trip via the user-service batch
     * endpoint POST /v1/users/public/batch (HIGH #4). Returns the resolved
     * authors (ids with no profile are simply absent), or `null` on ANY failure
     * (non-2xx, network/timeout, bad JSON) so the caller can fall back to the
     * per-id path. Never throws.
     */
    private async fetchAuthorsBatch(ids: string[], token: string): Promise<Author[] | null> {
        if (ids.length === 0) return [];
        const url = `${this.baseUrl}/v1/users/public/batch`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${token}`,
                    accept: 'application/json',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ ids }),
                signal: controller.signal,
            });

            if (!res.ok) {
                logger.debug({ status: res.status, count: ids.length }, 'Batch author lookup non-OK; falling back to per-id');
                return null;
            }

            const body = (await res.json()) as { users?: PublicProfileResponse[] };
            const profiles = body?.users;
            if (!Array.isArray(profiles)) return null;

            return profiles.map((profile) => ({
                id: profile.id,
                name: profile.displayName?.trim() || 'User',
                avatarUrl: profile.avatarUrl ?? null,
                isPrivate: profile.isPrivate ?? false,
            }));
        } catch (err) {
            logger.warn({ err, count: ids.length }, 'Batch author lookup failed; falling back to per-id');
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    private async fetchAuthor(id: string, token: string): Promise<Author | null> {
        const url = `${this.baseUrl}/v1/users/public/${encodeURIComponent(id)}`;

        // Bound each call so a slow/unreachable user-service cannot stall a feed.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    authorization: `Bearer ${token}`,
                    accept: 'application/json',
                },
                signal: controller.signal,
            });

            if (!res.ok) {
                // 404 (no profile) and any other non-2xx degrade to "no author".
                logger.debug({ id, status: res.status }, 'Author lookup non-OK; omitting author');
                return null;
            }

            const profile = (await res.json()) as PublicProfileResponse;

            return {
                id: profile.id ?? id,
                name: profile.displayName?.trim() || 'User',
                avatarUrl: profile.avatarUrl ?? null,
                isPrivate: profile.isPrivate ?? false,
            };
        } catch (err) {
            // Network error, timeout/abort, bad JSON — never throw to the caller.
            logger.warn({ err, id }, 'Failed to resolve author; omitting author');
            return null;
        } finally {
            clearTimeout(timer);
        }
    }
}
