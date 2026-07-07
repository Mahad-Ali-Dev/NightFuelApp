import { cycleAccentsForBackground } from '@/theme/useCycleAccents';

/**
 * Locks the Phase-1 light-theme fix. The critical guarantee is the DARK path:
 * routing every cycle component through useCycleAccents must NOT change a single
 * pixel in dark mode — so on the dark scheme's background the resolver must
 * return byte-identical coral/lime. The light path only needs to prove it
 * DIVERGES (darker, AA-safe) so the near-white surface stops washing out.
 */
describe('cycleAccentsForBackground', () => {
  // The dark scheme's colors.background.primary.
  const DARK_BG = '#0A0C12';
  // The light scheme's colors.background.primary.
  const LIGHT_BG = '#F4F5F7';

  it('DARK background → byte-identical ship values (zero dark regression)', () => {
    const a = cycleAccentsForBackground(DARK_BG);
    expect(a.isLight).toBe(false);
    expect(a.coral).toBe('#FF7A90');
    expect(a.lime).toBe('#A8CC3C');
  });

  it('dark soft fills are the exact rgba of the ship colours', () => {
    const a = cycleAccentsForBackground(DARK_BG);
    expect(a.coralSoft).toBe('rgba(255,122,144,0.14)');
    expect(a.limeSoft).toBe('rgba(168,204,60,0.14)');
  });

  it('LIGHT background → darkened, AA-safe accents (not the raw coral/lime)', () => {
    const a = cycleAccentsForBackground(LIGHT_BG);
    expect(a.isLight).toBe(true);
    expect(a.coral).not.toBe('#FF7A90');
    expect(a.lime).not.toBe('#A8CC3C');
    expect(a.coral).toBe('#C93B60');
    expect(a.lime).toBe('#557A0F');
  });

  it('every variant background resolves without throwing (robust to any hex)', () => {
    for (const bg of ['#000000', '#FFFFFF', '#111319', '#FAFAFA', '#1B1207']) {
      const a = cycleAccentsForBackground(bg);
      expect(typeof a.coral).toBe('string');
      expect(a.coralSoft.startsWith('rgba(')).toBe(true);
    }
  });
});
