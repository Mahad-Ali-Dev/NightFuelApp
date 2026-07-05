/**
 * Theme-aware treatment for full-bleed hero cards (challenges, 30-day, women's
 * Body Focus) and the cycle phase backdrop.
 *
 * The hero art ships in two variants — a dark-cinematic `<name>.jpg` and a
 * bright/airy `<name>-light.jpg`. This helper pairs the right SCRIM + TEXT colour
 * with each so the card reads correctly on both grounds:
 *   - dark theme  → near-black scrim + white text over the dark art (original)
 *   - light theme → a light scrim + dark text over the light art, so the card is
 *     an airy panel on a near-white page instead of a heavy dark slab.
 *
 * Callers pick the image with `isLightHex(colors.background.primary)` and feed the
 * same boolean here, keeping the image + treatment in lockstep.
 */
export interface HeroCardTint {
  /** LinearGradient `colors` — a 2-stop scrim (top → bottom / diagonal). */
  scrim: readonly [string, string];
  /** Title colour over the scrim. */
  title: string;
  /** Subtitle / blurb colour over the scrim. */
  sub: string;
}

export function heroCardTint(isLight: boolean): HeroCardTint {
  return isLight
    ? {
        scrim: ['rgba(247,249,252,0.04)', 'rgba(247,249,252,0.92)'],
        title: '#15181F',
        sub: 'rgba(21,24,31,0.72)',
      }
    : {
        scrim: ['rgba(10,12,18,0.2)', 'rgba(10,12,18,0.94)'],
        title: '#FFFFFF',
        sub: 'rgba(255,255,255,0.86)',
      };
}
