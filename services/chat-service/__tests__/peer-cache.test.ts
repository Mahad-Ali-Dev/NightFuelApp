/**
 * Peer-profile cache regression suite (MEDIUM #12).
 *
 * resolvePeers() runs on EVERY getConversations()/getIncomingRequests() call and
 * previously re-fetched each peer's profile from user-service over HTTP with NO
 * cache — unlike community's AuthorResolver. This locks the fix: a short-lived,
 * size-bounded in-memory cache so a SECOND inbox load within the TTL serves the
 * already-resolved peer WITHOUT a second HTTP round-trip.
 *
 * Proven at the SERVICE layer against a tiny in-memory Prisma fake with global
 * fetch mocked, so we can count exactly how many times user-service is hit.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ChatService } from '../src/chat.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';

const SELF = 'user-self';
const PEER = 'user-peer';
const CONV_ID = 'conv-1';

// Minimal prisma fake: just the slice getConversations() touches.
function makePrisma() {
    const conv = {
        id: CONV_ID,
        participantA: SELF,
        participantB: PEER,
        requestState: 'accepted',
        updatedAt: new Date(),
        messages: [{ id: 'm1', conversationId: CONV_ID, senderId: PEER, text: 'hi', createdAt: new Date(1) }],
    };
    return {
        conversation: {
            findMany: jest.fn(async () => [conv]),
        },
    } as any;
}

describe('ChatService.resolvePeers — TTL peer-profile cache (MEDIUM #12)', () => {
    const realFetch = global.fetch;

    beforeEach(() => {
        process.env.JWT_SECRET = JWT_SECRET;
    });

    afterEach(() => {
        global.fetch = realFetch;
        delete process.env.JWT_SECRET;
        jest.restoreAllMocks();
    });

    it('serves the second resolve from cache within the TTL — no second HTTP call', async () => {
        const fetchMock = jest.fn(async () =>
            ({
                ok: true,
                status: 200,
                json: async () => ({ userId: PEER, displayName: 'Real Name', avatarUrl: 'https://x/a.png' }),
            }) as any,
        );
        global.fetch = fetchMock as any;

        const svc = new ChatService(makePrisma());

        // First inbox load: cache miss -> exactly one user-service fetch.
        const first = await svc.getConversations(SELF);
        expect(first[0].peer).toEqual({ userId: PEER, displayName: 'Real Name', avatarUrl: 'https://x/a.png' });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Second inbox load within the 60s TTL: cache HIT -> NO additional fetch.
        const second = await svc.getConversations(SELF);
        expect(second[0].peer).toEqual({ userId: PEER, displayName: 'Real Name', avatarUrl: 'https://x/a.png' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('re-fetches once the cached entry has expired past the TTL (no stale serve)', async () => {
        const fetchMock = jest.fn(async () =>
            ({
                ok: true,
                status: 200,
                json: async () => ({ userId: PEER, displayName: 'Real Name', avatarUrl: null }),
            }) as any,
        );
        global.fetch = fetchMock as any;

        // One service instance so the cache persists across resolves.
        const svc = new ChatService(makePrisma());

        const base = 1_000_000;
        const nowSpy = jest.spyOn(Date, 'now');

        // First resolve at t=base (miss -> fetch + cache).
        nowSpy.mockReturnValue(base);
        await svc.getConversations(SELF);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Still within TTL (+59s): cache hit, no fetch.
        nowSpy.mockReturnValue(base + 59_000);
        await svc.getConversations(SELF);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Past the 60s TTL (+61s): lazy expiry -> re-fetch.
        nowSpy.mockReturnValue(base + 61_000);
        await svc.getConversations(SELF);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does NOT cache a degraded fallback — a transient user-service blip is re-fetched next time, not pinned for the TTL', async () => {
        // First load: user-service is down (non-OK) -> generic fallback for THIS load.
        // Second load (within the TTL): user-service has recovered -> the real name must
        // appear, proving the fallback was NOT cached (it would otherwise be pinned ~60s).
        let healthy = false;
        const fetchMock = jest.fn(async () =>
            healthy
                ? ({ ok: true, status: 200, json: async () => ({ userId: PEER, displayName: 'Real Name', avatarUrl: null }) } as any)
                : ({ ok: false, status: 503, json: async () => ({}) } as any),
        );
        global.fetch = fetchMock as any;

        const svc = new ChatService(makePrisma());

        const first = await svc.getConversations(SELF);
        expect(first[0].peer.displayName).toBe('Zeitra Member'); // degraded this load
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // user-service recovers; a second load within the TTL must RE-FETCH (fallback
        // was not cached) and surface the real profile.
        healthy = true;
        const second = await svc.getConversations(SELF);
        expect(second[0].peer.displayName).toBe('Real Name');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
