import {
  isStretchy, scoreExercise, rankExercises, prescribe, kindForFocus, exercisesPerDay, FOCUS_FILTER,
} from '../../src/features/coach/select';

describe('coach selection engine', () => {
  it('flags stretch / mobility moves', () => {
    expect(isStretchy('Above Head Chest Stretch')).toBe(true);
    expect(isStretchy('Hip Mobility Drill')).toBe(true);
    expect(isStretchy('Barbell bench press')).toBe(false);
    expect(isStretchy('Pull up')).toBe(false);
  });

  it('ranks staple compounds above stretches and assisted variants', () => {
    const pool = [
      { name: 'Above Head Chest Stretch', equipment: 'body weight' },
      { name: 'Assisted Chest Dip (kneeling)', equipment: 'assisted' },
      { name: 'Barbell bench press', equipment: 'barbell' },
      { name: 'Incline dumbbell press', equipment: 'dumbbell' },
    ];
    const ranked = rankExercises(pool).map((e) => e.name);
    expect(ranked[0]).toMatch(/Barbell bench press|Incline dumbbell press/);
    expect(ranked[ranked.length - 1]).toBe('Above Head Chest Stretch');
    expect(scoreExercise(pool[2]!)).toBeGreaterThan(scoreExercise(pool[0]!));
  });

  it('prescribes sets/reps by level + kind', () => {
    expect(prescribe('beginner', 'strength')).toEqual({ sets: 3, reps: '12' });
    expect(prescribe('intermediate', 'strength')).toEqual({ sets: 4, reps: '10' });
    expect(prescribe('advanced', 'strength')).toEqual({ sets: 4, reps: '8' });
    expect(prescribe('intermediate', 'cardio').reps).toBe('20 min');
    expect(prescribe('advanced', 'core').reps).toBe('20');
  });

  it('maps focus kinds + volume', () => {
    expect(kindForFocus('cardio')).toBe('cardio');
    expect(kindForFocus('core')).toBe('core');
    expect(kindForFocus('chest')).toBe('strength');
    expect(exercisesPerDay('beginner')).toBe(4);
    expect(exercisesPerDay('advanced')).toBe(6);
  });

  it('maps every focus key to a catalog filter', () => {
    expect(FOCUS_FILTER.chest).toEqual({ bodyPart: 'chest' });
    expect(FOCUS_FILTER.biceps).toEqual({ muscleGroup: 'bicep' });
    expect(FOCUS_FILTER.cardio).toEqual({ category: 'cardio' });
  });
});
