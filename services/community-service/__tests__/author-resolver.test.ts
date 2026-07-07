/**
 * AuthorResolver — community feed author resolution (src/author-resolver.ts).
 *
 * Covers:
 *   HIGH   #4  resolveMany resolves ALL uncached ids in ONE round-trip via the
 *              batch endpoint POST /v1/users/public/batch (not N GET /public/:id).
 *              The per-id cache + the single-id GET fallback are preserved.
 *   MEDIUM #15 the in-memory cache evicts expired entries (lazy sweep) and is
 *              size-capped (drop-oldest) so it never grows unbounded.
 *
 * We mock global.fetch and assert on the request shape (URL + method + body).
 */
import { AuthorResolver } from '../src/author-resolver';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const BASE = 'http://user-service:3009';

function publicProfile(id: string, name = `name-${id}`) {
    return { id, displayName: name, avatarUrl: null, timezone: 'UTC', isPrivate: false };
}

// A fetch stub that routes batch vs single requests.
function makeFetch(opts: {
    batch?: (ids: string[]) => any; // return profiles array, or throw to simulate failure
    single?: (id: string) => any | null; // return profile or null (=> 404)
    batchStatus?: number; // override status for batch
}) {
    return jest.fn(async (input: any, init: any) => {
        const url = String(input);
        if (url.endsWith('/v1/users/public/batch')) {
            const ids = JSON.parse(init.body).ids as string[];
            if (opts.batchStatus && opts.batchStatus >= 400) {
                return { ok: false, status: opts.batchStatus, json: async () => ({}) } as any;
            }
            const users = opts.batch ? opts.batch(ids) : ids.map((id) => publicProfile(id));
            return { ok: true, status: 200, json: async () => ({ users }) } as any;
        }
        // single GET /v1/users/public/:id
        const id = decodeURIComponent(url.split('/').pop()!);
        const profile = opts.single ? opts.single(id) : publicProfile(id);
        if (!profile) return { ok: false, status: 404, json: async () => ({}) } as any;
        return { ok: true, status: 200, json: async () => profile } as any;
    });
}

describe('AuthorResolver.resolveMany — HIGH #4 single batch round-trip', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
    });

    it('resolves all uncached ids in ONE batch call (no per-id GETs)', async () => {
        const fetchStub = makeFetch({});
        global.fetch = fetchStub as any;

        const resolver = new AuthorResolver(JWT_SECRET, BASE);
        const out = await resolver.resolveMany(['a', 'b', 'c']);

        expect(out.size).toBe(3);
        expect(out.get('a')?.name).toBe('name-a');

        // Exactly ONE fetch, to the batch endpoint, POST with all ids.
        expect(fetchStub).toHaveBeenCalledTimes(1);
        const [url, init] = fetchStub.mock.calls[0];
        expect(String(url)).toBe(`${BASE}/v1/users/public/batch`);
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body).ids.sort()).toEqual(['a', 'b', 'c']);
    });

    it('serves cached ids from cache and only batches the uncached remainder', async () => {
        const fetchStub = makeFetch({});
        global.fetch = fetchStub as any;
        const resolver = new AuthorResolver(JWT_SECRET, BASE);

        await resolver.resolveMany(['a', 'b']); // 1 batch call, caches a + b
        fetchStub.mockClear();

        const out = await resolver.resolveMany(['a', 'b', 'c']); // only c uncached
        expect(out.size).toBe(3);
        expect(fetchStub).toHaveBeenCalledTimes(1);
        const ids = JSON.parse(fetchStub.mock.calls[0][1].body).ids;
        expect(ids).toEqual(['c']);
    });

    it('falls back to per-id single GETs when the batch endpoint fails', async () => {
        const fetchStub = makeFetch({ batchStatus: 500 });
        global.fetch = fetchStub as any;
        const resolver = new AuthorResolver(JWT_SECRET, BASE);

        const out = await resolver.resolveMany(['a', 'b']);

        // The known ids still resolve (degraded to single-id path).
        expect(out.size).toBe(2);
        expect(out.get('a')?.name).toBe('name-a');

        const urls = fetchStub.mock.calls.map((c) => String(c[0]));
        // 1 failed batch + 2 single GET fallbacks.
        expect(urls).toContain(`${BASE}/v1/users/public/batch`);
        expect(urls).toContain(`${BASE}/v1/users/public/a`);
        expect(urls).toContain(`${BASE}/v1/users/public/b`);
    });

    it('omits ids the batch could not resolve (absent from the response)', async () => {
        const fetchStub = makeFetch({ batch: (ids) => ids.filter((i) => i !== 'gone').map((i) => publicProfile(i)) });
        global.fetch = fetchStub as any;
        const resolver = new AuthorResolver(JWT_SECRET, BASE);

        const out = await resolver.resolveMany(['a', 'gone']);
        expect(out.has('a')).toBe(true);
        expect(out.has('gone')).toBe(false);
    });

    it('resolveOne still works (single-id path over the batch endpoint)', async () => {
        const fetchStub = makeFetch({});
        global.fetch = fetchStub as any;
        const resolver = new AuthorResolver(JWT_SECRET, BASE);

        const author = await resolver.resolveOne('solo');
        expect(author?.id).toBe('solo');
        expect(author?.name).toBe('name-solo');
    });
});

describe('AuthorResolver cache — MEDIUM #15 eviction + size cap', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
        jest.useRealTimers();
    });

    it('lazily sweeps expired entries (TTL elapsed => refetched, not served stale)', async () => {
        jest.useFakeTimers();
        const fetchStub = makeFetch({});
        global.fetch = fetchStub as any;
        const resolver = new AuthorResolver(JWT_SECRET, BASE);

        await resolver.resolveMany(['a']); // cached
        expect(fetchStub).toHaveBeenCalledTimes(1);

        // Advance beyond the 60s TTL — the entry must be swept + refetched.
        jest.advanceTimersByTime(61_000);
        await resolver.resolveMany(['a']);
        expect(fetchStub).toHaveBeenCalledTimes(2);

        // The expired entry is no longer present in the cache Map.
        const cache: Map<string, any> = (resolver as any).cache;
        // After the refetch it's re-cached (size 1), never accumulating duplicates.
        expect(cache.size).toBe(1);
    });

    it('expired entries are removed from the Map by the sweep (no unbounded growth)', async () => {
        jest.useFakeTimers();
        global.fetch = makeFetch({}) as any;
        const resolver = new AuthorResolver(JWT_SECRET, BASE);
        const cache: Map<string, any> = (resolver as any).cache;

        await resolver.resolveMany(['a', 'b', 'c']);
        expect(cache.size).toBe(3);

        // Let them all expire, then resolve a DIFFERENT id — the sweep on the next
        // resolve must drop the 3 dead entries rather than keep them forever.
        jest.advanceTimersByTime(61_000);
        await resolver.resolveMany(['z']);
        expect(cache.has('a')).toBe(false);
        expect(cache.has('b')).toBe(false);
        expect(cache.has('c')).toBe(false);
        expect(cache.has('z')).toBe(true);
        expect(cache.size).toBe(1);
    });

    it('enforces a hard size cap (drop-oldest) so the cache never grows unbounded', async () => {
        global.fetch = makeFetch({}) as any;
        const resolver = new AuthorResolver(JWT_SECRET, BASE);
        const cache: Map<string, any> = (resolver as any).cache;

        // Shrink the cap for the test via the private setCache path: insert more
        // than the cap by monkey-patching the module constant is not possible, so
        // we assert the invariant directly against the configured cap by inserting
        // a large but bounded number and checking it never exceeds the cap.
        const CAP = 10_000;
        // Insert CAP + 50 distinct authors over batched resolves.
        const ids = Array.from({ length: CAP + 50 }, (_, i) => `u${i}`);
        // resolveMany chunks to 100/batch internally; just drive it.
        for (let i = 0; i < ids.length; i += 100) {
            await resolver.resolveMany(ids.slice(i, i + 100));
        }

        expect(cache.size).toBeLessThanOrEqual(CAP);
        // The most-recently inserted ids survive; the oldest were evicted.
        expect(cache.has(`u${CAP + 49}`)).toBe(true);
        expect(cache.has('u0')).toBe(false);
    });
});
