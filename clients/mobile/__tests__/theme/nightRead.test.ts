import { nightReadColors, resolveTheme } from '@/theme/nightRead';

describe('nightRead theme', () => {
  describe('resolveTheme', () => {
    test('nightRead variant returns the deep-red palette', () => {
      expect(resolveTheme('nightRead').background.primary).toBe('#0A0000');
    });

    test('nightRead variant exposes the nightReadColors constant', () => {
      expect(resolveTheme('nightRead')).toBe(nightReadColors);
    });

    test('aurora variant returns a non-null colors object', () => {
      const aurora = resolveTheme('aurora');
      expect(aurora).toBeTruthy();
      expect(aurora.background.primary).toBeDefined();
    });

    test('aurora variant is NOT the nightRead palette (no Aurora edits)', () => {
      // If this fails, someone wired nightRead into Aurora — Aurora must stay
      // identical to keep every existing screen rendering as before.
      expect(resolveTheme('aurora').background.primary).not.toBe('#0A0000');
    });
  });

  describe('shape parity with Aurora', () => {
    // Walks every key on Aurora and asserts the same key exists on nightRead.
    // This guarantees a consumer that reads e.g. `colors.accent.purpleDark`
    // off Aurora won't crash when switched to nightRead.
    const collectKeyPaths = (
      obj: unknown,
      prefix = ''
    ): string[] => {
      if (obj === null || typeof obj !== 'object') return [];
      const paths: string[] = [];
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        paths.push(path);
        const value = (obj as Record<string, unknown>)[key];
        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          paths.push(...collectKeyPaths(value, path));
        }
      }
      return paths;
    };

    const getAtPath = (obj: unknown, path: string): unknown => {
      return path.split('.').reduce<unknown>((acc, segment) => {
        if (acc === null || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[segment];
      }, obj);
    };

    test('every nightRead key path is reachable', () => {
      const nightRead = resolveTheme('nightRead');
      // Smoke-check a handful of representative paths to catch a refactor that
      // accidentally drops the parity-critical keys.
      const requiredPaths = [
        'background.primary',
        'background.secondary',
        'background.tertiary',
        'background.quaternary',
        'border.default',
        'border.light',
        'border.focus',
        'accent.coral',
        'accent.coralLight',
        'accent.coralDark',
        'accent.pink',
        'accent.cyan',
        'accent.cyanLight',
        'accent.cyanDark',
        'accent.blue',
        'accent.blueLight',
        'accent.purple',
        'accent.purpleLight',
        'accent.purpleDark',
        'accent.red',
        'accent.redLight',
        'accent.amber',
        'accent.amberLight',
        'accent.emerald',
        'accent.orange',
        'text.primary',
        'text.secondary',
        'text.tertiary',
        'text.accent',
        'text.inverse',
        'success',
        'error',
        'warning',
        'info',
        'gradients.coral',
        'gradients.cyan',
        'gradients.purple',
        'gradients.dark',
        'gradients.card',
      ];
      for (const path of requiredPaths) {
        expect(getAtPath(nightRead, path)).toBeDefined();
      }
    });

    test('every key on resolveTheme(aurora) also exists on resolveTheme(nightRead)', () => {
      const aurora = resolveTheme('aurora') as unknown as Record<
        string,
        unknown
      >;
      const nightRead = resolveTheme('nightRead');

      // Aurora's `colors` export also carries a `light` sub-tree (light-mode
      // overrides) that nightRead, being a single dark variant, does not. The
      // work-item only requires parity on the keys nightRead defines, so we
      // skip Aurora's `light.*` paths.
      const auroraPaths = collectKeyPaths(aurora).filter(
        (p) => !p.startsWith('light')
      );

      const missing: string[] = [];
      for (const path of auroraPaths) {
        if (getAtPath(nightRead, path) === undefined) {
          missing.push(path);
        }
      }
      expect(missing).toEqual([]);
    });
  });

  describe('hex strings are valid CSS color format', () => {
    // Matches #RRGGBB and #RGB. Gradient arrays may also contain rgba(...)
    // strings (Aurora's gradients.card uses these), which we allow too.
    const HEX_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;
    const RGBA_RE = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)$/;

    const isColorString = (value: string): boolean => {
      return HEX_RE.test(value) || RGBA_RE.test(value);
    };

    const walkStrings = (
      obj: unknown,
      prefix = ''
    ): Array<{ path: string; value: string }> => {
      const found: Array<{ path: string; value: string }> = [];
      if (obj === null || obj === undefined) return found;
      if (typeof obj === 'string') {
        found.push({ path: prefix, value: obj });
        return found;
      }
      if (Array.isArray(obj)) {
        obj.forEach((item, i) => {
          found.push(...walkStrings(item, `${prefix}[${i}]`));
        });
        return found;
      }
      if (typeof obj === 'object') {
        for (const key of Object.keys(obj as Record<string, unknown>)) {
          const next = prefix ? `${prefix}.${key}` : key;
          found.push(
            ...walkStrings((obj as Record<string, unknown>)[key], next)
          );
        }
      }
      return found;
    };

    test('every color string in nightRead matches #RRGGBB or rgba(...)', () => {
      const strings = walkStrings(resolveTheme('nightRead'));
      const invalid = strings.filter((s) => !isColorString(s.value));
      expect(invalid).toEqual([]);
    });

    test('spec-anchored values match exactly', () => {
      const c = resolveTheme('nightRead');
      expect(c.background.primary).toBe('#0A0000');
      expect(c.background.secondary).toBe('#140404');
      expect(c.text.primary).toBe('#E8B5B5');
      expect(c.text.secondary).toBe('#A47878');
      expect(c.text.tertiary).toBe('#6B4444');
      expect(c.accent.coral).toBe('#8C1A1A');
      expect(c.accent.red).toBe('#8C1A1A');
      expect(c.accent.cyan).toBe('#8C1A1A');
      expect(c.accent.amber).toBe('#5C2A0F');
      expect(c.accent.purple).toBe('#3A1010');
      expect(c.accent.emerald).toBe('#2A1414');
      expect(c.border.default).toBe('#2A0A0A');
    });
  });
});
