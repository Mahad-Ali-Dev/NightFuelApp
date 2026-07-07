/**
 * Tests for useSubscription — the client-side "is this user Pro" reconciliation.
 *
 * isPro must be true when EITHER the RevenueCat entitlement (immediate) OR the
 * backend tier (authoritative) says Pro. We stub react-query's useQuery (backend
 * status) and the revenueCat seam (entitlement + listener) so the pure
 * reconciliation logic is exercised without axios or the native SDK.
 */

// Backend status holder read by the stubbed useQuery.
const mockQuery: { data: any; isLoading: boolean } = { data: undefined, isLoading: false };
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockQuery.data, isLoading: mockQuery.isLoading, refetch: jest.fn() }),
}));

// getStatus is never called (useQuery is stubbed) — mock only so its axios import
// graph never loads.
jest.mock('@/api/subscriptions', () => ({ getStatus: jest.fn() }));

// RevenueCat seam — controllable readiness / entitlement, and a captured listener
// so a test can fire an entitlement change.
const rc: { ready: boolean; pro: boolean; listener: ((p: boolean) => void) | null } = {
  ready: false,
  pro: false,
  listener: null,
};
jest.mock('@/lib/purchases/revenueCat', () => ({
  isPurchasesReady: () => rc.ready,
  isProActive: jest.fn(async () => rc.pro),
  addProListener: (cb: (p: boolean) => void) => {
    rc.listener = cb;
    return () => {
      rc.listener = null;
    };
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useSubscription } from '@/hooks/useSubscription';

beforeEach(() => {
  mockQuery.data = undefined;
  mockQuery.isLoading = false;
  rc.ready = false;
  rc.pro = false;
  rc.listener = null;
});

describe('useSubscription', () => {
  it('backend FREE + RevenueCat unavailable → not Pro', async () => {
    mockQuery.data = { tier: 'FREE', active: false, features: [] };
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isPro).toBe(false));
    expect(result.current.tier).toBe('FREE');
  });

  it('backend PRO + active → Pro, regardless of RevenueCat', () => {
    mockQuery.data = { tier: 'PRO', active: true, features: [] };
    const { result } = renderHook(() => useSubscription());
    expect(result.current.isPro).toBe(true);
    expect(result.current.tier).toBe('PRO');
  });

  it('backend PRO but INACTIVE (expired) → not Pro', async () => {
    mockQuery.data = { tier: 'PRO', active: false, features: [] };
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isPro).toBe(false));
  });

  it('backend FREE but RevenueCat entitlement active → Pro (immediate client unlock)', async () => {
    mockQuery.data = { tier: 'FREE', active: false, features: [] };
    rc.ready = true;
    rc.pro = true;
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isPro).toBe(true));
    // Backend tier is still FREE until the webhook syncs it — isPro leads.
    expect(result.current.tier).toBe('FREE');
  });

  it('a live entitlement change (listener) flips isPro without a refetch', async () => {
    mockQuery.data = { tier: 'FREE', active: false, features: [] };
    rc.ready = true;
    rc.pro = false;
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(rc.listener).not.toBeNull());
    expect(result.current.isPro).toBe(false);

    act(() => rc.listener!(true));
    expect(result.current.isPro).toBe(true);

    act(() => rc.listener!(false));
    expect(result.current.isPro).toBe(false);
  });

  it('passes through isLoading and defaults tier to FREE while loading', () => {
    mockQuery.isLoading = true;
    mockQuery.data = undefined;
    const { result } = renderHook(() => useSubscription());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.tier).toBe('FREE');
    expect(result.current.isPro).toBe(false);
  });
});
