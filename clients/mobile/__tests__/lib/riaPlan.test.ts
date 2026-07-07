import { parseRiaPlan } from '@/lib/riaPlan';

describe('parseRiaPlan', () => {
  it('returns text unchanged when there is no plan block', () => {
    const { cleanText, plan } = parseRiaPlan('Just checking in — how are you feeling tonight?');
    expect(cleanText).toBe('Just checking in — how are you feeling tonight?');
    expect(plan).toBeNull();
  });

  it('strips a complete meal block and parses items + macros', () => {
    const text =
      "Here's a light night-shift snack to keep you sharp. " +
      '[ZEITRA_PLAN]{"meals":[{"title":"Night snack","mealType":"SNACK","items":[' +
      '{"name":"Greek yogurt","amount":"170g","calories":100,"protein":17,"carbs":6,"fat":0}]}]}[/ZEITRA_PLAN]';
    const { cleanText, plan } = parseRiaPlan(text);
    expect(cleanText).toBe("Here's a light night-shift snack to keep you sharp.");
    expect(cleanText).not.toContain('ZEITRA_PLAN');
    expect(plan?.meals?.[0]?.mealType).toBe('SNACK');
    expect(plan?.meals?.[0]?.items[0]).toMatchObject({ name: 'Greek yogurt', protein: 17 });
    expect(plan?.workout).toBeUndefined();
  });

  it('parses a workout block with exercises', () => {
    const text =
      'Let’s hit upper body. [ZEITRA_PLAN]{"workout":{"title":"Upper","durationMin":40,' +
      '"exercises":[{"name":"Bench Press","sets":4,"reps":"8"}]}}[/ZEITRA_PLAN]';
    const { plan } = parseRiaPlan(text);
    expect(plan?.workout?.title).toBe('Upper');
    expect(plan?.workout?.exercises[0]).toMatchObject({ name: 'Bench Press', sets: 4, reps: '8' });
    expect(plan?.meals).toBeUndefined();
  });

  it('hides a half-streamed (unclosed) block and yields no plan yet', () => {
    const text = 'One sec, building your plan… [ZEITRA_PLAN]{"meals":[{"title":"Din';
    const { cleanText, plan } = parseRiaPlan(text);
    expect(cleanText).toBe('One sec, building your plan…');
    expect(cleanText).not.toContain('ZEITRA_PLAN');
    expect(plan).toBeNull();
  });

  it('shows clean prose but no card when the JSON is malformed', () => {
    const text = 'Here you go. [ZEITRA_PLAN]{not valid json}[/ZEITRA_PLAN]';
    const { cleanText, plan } = parseRiaPlan(text);
    expect(cleanText).toBe('Here you go.');
    expect(plan).toBeNull();
  });

  it('parses even when the LLM mangles the closing tag ("}/[ZEITRA_PLAN]")', () => {
    // Verbatim shape observed from the live model (brace-balanced extraction
    // must ignore the broken close).
    const text =
      "I've got just the thing for you. " +
      '[ZEITRA_PLAN]{"meals":[{"title":"Midnight Protein Boost","mealType":"SNACK","items":[' +
      '{"name":"Cottage Cheese","amount":"120g","calories":80,"protein":11,"carbs":5,"fat":0}]}]}/[ZEITRA_PLAN]';
    const { cleanText, plan } = parseRiaPlan(text);
    expect(cleanText).toBe("I've got just the thing for you.");
    expect(cleanText).not.toContain('ZEITRA_PLAN');
    expect(plan?.meals?.[0]?.title).toBe('Midnight Protein Boost');
    expect(plan?.meals?.[0]?.items[0]?.name).toBe('Cottage Cheese');
  });

  it('defaults an unknown mealType to SNACK and drops empty item lists', () => {
    const text =
      '[ZEITRA_PLAN]{"meals":[{"title":"X","mealType":"BRUNCH","items":[' +
      '{"name":"Oats","calories":150,"protein":5,"carbs":27,"fat":3}]},{"title":"empty","items":[]}]}[/ZEITRA_PLAN]';
    const { plan } = parseRiaPlan(text);
    expect(plan?.meals).toHaveLength(1);
    expect(plan?.meals?.[0]?.mealType).toBe('SNACK');
  });
});
