'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  MoreVertical,
  Dumbbell,
  Timer,
  X,
  SkipForward,
  Pause,
  Play,
  RotateCcw,
  LogOut,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logWorkout, logSessionExercise, endWorkoutSession } from '@/lib/api';
import Link from 'next/link';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WorkoutExercise {
  name: string;
  targetSets: number;
  targetReps: number;
  muscleGroup: string;
}

interface WorkoutData {
  planName: string;
  dayNumber: number;
  dayName: string;
  sessionId?: string;
  exercises: WorkoutExercise[];
}

interface SetData {
  kg: number;
  reps: number;
  completed: boolean;
}

interface ExerciseState {
  sets: SetData[];
  restSeconds: number;
}

interface ActiveWorkoutState {
  exercises: ExerciseState[];
  elapsedSeconds: number;
  startedAt: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getMuscleIcon(muscleGroup: string): string {
  const icons: Record<string, string> = {
    Back: '\ud83e\uddb4',
    Chest: '\ud83d\udcaa',
    Legs: '\ud83e\uddb5',
    Shoulders: '\ud83c\udfcb\ufe0f',
    Arms: '\ud83d\udcaa',
    Core: '\ud83e\uddcd',
  };
  return icons[muscleGroup] || '\ud83c\udfcb\ufe0f';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY_WORKOUT = 'nf_active_workout';
const STORAGE_KEY_STATE = 'nf_active_workout_state';
const STORAGE_KEY_RESULT = 'nf_workout_result';
const PERSIST_INTERVAL_MS = 3000;
const DEFAULT_REST_SECONDS = 120;

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ActiveWorkoutPage() {
  const router = useRouter();

  // ── Workout Plan Data ─────────────────────────────────────────────────────
  const [workoutData, setWorkoutData] = useState<WorkoutData | null>(null);

  // ── Per-Exercise State ────────────────────────────────────────────────────
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);

  // ── UI State ──────────────────────────────────────────────────────────────
  const [expandedIndex, setExpandedIndex] = useState<number>(0);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [showExerciseMenu, setShowExerciseMenu] = useState<number | null>(null);

  // ── Timers ────────────────────────────────────────────────────────────────
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restTimer, setRestTimer] = useState<{ active: boolean; seconds: number; exerciseIdx: number }>({
    active: false,
    seconds: 0,
    exerciseIdx: -1,
  });

  const elapsedRef = useRef(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const initializedRef = useRef(false);

  // ── Initialize from localStorage ──────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let data: WorkoutData | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_WORKOUT);
      if (stored) {
        const parsed = JSON.parse(stored) as WorkoutData;
        if (parsed.exercises && parsed.exercises.length > 0) {
          data = parsed;
        }
      }
    } catch {
      // No valid workout data
    }

    if (!data) {
      // No active workout found — leave workoutData as null to show error state
      return;
    }

    setWorkoutData(data);

    // Try restoring active state
    let restored = false;
    try {
      const savedState = localStorage.getItem(STORAGE_KEY_STATE);
      if (savedState) {
        const parsed = JSON.parse(savedState) as ActiveWorkoutState;
        if (parsed.exercises && parsed.exercises.length === data.exercises.length) {
          setExerciseStates(parsed.exercises);
          const resumedElapsed = Math.floor((Date.now() - parsed.startedAt) / 1000);
          setElapsedSeconds(resumedElapsed);
          elapsedRef.current = resumedElapsed;
          startedAtRef.current = parsed.startedAt;
          restored = true;
        }
      }
    } catch {
      // Ignore
    }

    if (!restored) {
      const initialStates: ExerciseState[] = data.exercises.map((ex) => ({
        sets: Array.from({ length: ex.targetSets }, () => ({
          kg: 0,
          reps: ex.targetReps,
          completed: false,
        })),
        restSeconds: DEFAULT_REST_SECONDS,
      }));
      setExerciseStates(initialStates);
      startedAtRef.current = Date.now();
    }
  }, []);

  // ── Main Workout Timer ────────────────────────────────────────────────────
  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        elapsedRef.current = next;
        return next;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // ── Rest Timer Countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (restTimer.active && restTimer.seconds > 0) {
      restIntervalRef.current = setInterval(() => {
        setRestTimer((prev) => {
          if (prev.seconds <= 1) {
            return { active: false, seconds: 0, exerciseIdx: -1 };
          }
          return { ...prev, seconds: prev.seconds - 1 };
        });
      }, 1000);
    } else {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    }

    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    };
  }, [restTimer.active, restTimer.seconds > 0]);

  // ── Persist state to localStorage periodically ────────────────────────────
  useEffect(() => {
    if (exerciseStates.length === 0) return;

    const interval = setInterval(() => {
      const state: ActiveWorkoutState = {
        exercises: exerciseStates,
        elapsedSeconds: elapsedRef.current,
        startedAt: startedAtRef.current,
      };
      try {
        localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
      } catch {
        // Storage full or unavailable
      }
    }, PERSIST_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [exerciseStates]);

  // ── Computed Stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let completedSets = 0;
    let incompleteSets = 0;
    let totalVolume = 0;

    exerciseStates.forEach((ex) => {
      ex.sets.forEach((set) => {
        if (set.completed) {
          completedSets++;
          totalVolume += set.kg * set.reps;
        } else {
          incompleteSets++;
        }
      });
    });

    return { completedSets, incompleteSets, totalVolume };
  }, [exerciseStates]);

  // ── Find next incomplete set for LOG NEXT SET ─────────────────────────────
  const nextIncompleteSet = useMemo(() => {
    for (let eIdx = 0; eIdx < exerciseStates.length; eIdx++) {
      const exercise = exerciseStates[eIdx]!;
      for (let sIdx = 0; sIdx < exercise.sets.length; sIdx++) {
        if (!exercise.sets[sIdx]!.completed) {
          return { exerciseIdx: eIdx, setIdx: sIdx };
        }
      }
    }
    return null;
  }, [exerciseStates]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const updateSet = useCallback(
    (exerciseIdx: number, setIdx: number, field: keyof SetData, value: number | boolean) => {
      setExerciseStates((prev) => {
        const updated = prev.map((ex, eIdx) => {
          if (eIdx !== exerciseIdx) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s, sIdx) => {
              if (sIdx !== setIdx) return s;
              return { ...s, [field]: value };
            }),
          };
        });
        return updated;
      });
    },
    []
  );

  const toggleSetComplete = useCallback(
    (exerciseIdx: number, setIdx: number) => {
      setExerciseStates((prev) => {
        const currentSet = prev[exerciseIdx]!.sets[setIdx]!;
        const newCompleted = !currentSet.completed;

        const updated = prev.map((ex, eIdx) => {
          if (eIdx !== exerciseIdx) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s, sIdx) => {
              if (sIdx !== setIdx) return s;
              return { ...s, completed: newCompleted };
            }),
          };
        });

        // Start rest timer when completing a set
        if (newCompleted) {
          const restDuration = prev[exerciseIdx]!.restSeconds;
          setRestTimer({
            active: true,
            seconds: restDuration,
            exerciseIdx: exerciseIdx,
          });
        }

        return updated;
      });
    },
    []
  );

  const addSet = useCallback((exerciseIdx: number) => {
    setExerciseStates((prev) => {
      return prev.map((ex, eIdx) => {
        if (eIdx !== exerciseIdx) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              kg: lastSet ? lastSet.kg : 0,
              reps: lastSet ? lastSet.reps : 8,
              completed: false,
            },
          ],
        };
      });
    });
  }, []);

  const removeSet = useCallback((exerciseIdx: number, setIdx: number) => {
    setExerciseStates((prev) => {
      return prev.map((ex, eIdx) => {
        if (eIdx !== exerciseIdx) return ex;
        if (ex.sets.length <= 1) return ex;
        return {
          ...ex,
          sets: ex.sets.filter((_, sIdx) => sIdx !== setIdx),
        };
      });
    });
  }, []);

  const handleLogNextSet = useCallback(() => {
    if (!nextIncompleteSet) return;
    const { exerciseIdx, setIdx } = nextIncompleteSet;
    setExpandedIndex(exerciseIdx);
    // Small delay to ensure accordion opens before marking complete
    setTimeout(() => {
      toggleSetComplete(exerciseIdx, setIdx);
    }, 150);
  }, [nextIncompleteSet, toggleSetComplete]);

  const skipRestTimer = useCallback(() => {
    setRestTimer({ active: false, seconds: 0, exerciseIdx: -1 });
  }, []);

  const handleFinish = useCallback(async () => {
    if (!workoutData) return;

    const result = {
      planName: workoutData.planName,
      dayNumber: workoutData.dayNumber,
      dayName: workoutData.dayName,
      durationSeconds: elapsedRef.current,
      totalVolume: stats.totalVolume,
      completedSets: stats.completedSets,
      totalSets: stats.completedSets + stats.incompleteSets,
      exercises: workoutData.exercises.map((ex, eIdx) => ({
        name: ex.name,
        muscleGroup: ex.muscleGroup,
        sets: exerciseStates[eIdx]?.sets.filter((s) => s.completed) || [],
      })),
      completedAt: new Date().toISOString(),
    };

    // Save result to localStorage for the complete page transition
    try {
      localStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(result));
      localStorage.removeItem(STORAGE_KEY_STATE);
    } catch {
      // Ignore
    }

    // POST completed workout to the exercise API
    try {
      if (workoutData.sessionId) {
        // 1. Log each completed exercise to the session using the new backend methods
        const logPromises = workoutData.exercises.map((ex, eIdx) => {
          const completedSets = exerciseStates[eIdx]?.sets.filter((s) => s.completed) || [];
          if (completedSets.length === 0) return Promise.resolve();
          const weightKg = completedSets.find(s => s.kg > 0)?.kg || 0;
          return logSessionExercise(workoutData.sessionId!, {
            exerciseName: ex.name,
            sets: completedSets.length,
            reps: ex.targetReps,
            weightKg,
            durationSecs: 0 // Optional duration per exercise
          });
        });
        await Promise.all(logPromises);

        // 2. End the session
        await endWorkoutSession(workoutData.sessionId);
      }

      // 3. Fallback/Original top-level history log for analytics 
      // (Depends on what dashboard fetches, keeping logWorkout for safety)
      await logWorkout({
        type: 'strength',
        title: `${workoutData.dayName} - ${workoutData.planName}`,
        duration: elapsedRef.current,
        intensity: 'moderate',
        splitType: workoutData.dayName.toLowerCase(),
        muscleGroups: [...new Set(workoutData.exercises.map(e => e.muscleGroup))],
        completedAt: new Date().toISOString(),
        exercises: workoutData.exercises.map((ex, eIdx) => ({
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          sets: exerciseStates[eIdx]?.sets.filter(s => s.completed).length || 0,
          reps: ex.targetReps,
          weightKg: exerciseStates[eIdx]?.sets.find(s => s.completed)?.kg || 0,
          order: eIdx,
        })),
      });
    } catch (err) {
      console.error('Failed to save workout to API:', err);
    }

    router.push('/dashboard/training/complete');
  }, [workoutData, exerciseStates, stats, router]);

  const handleQuit = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_STATE);
    } catch {
      // Ignore
    }
    router.push('/dashboard/exercises');
  }, [router]);

  const handleRestart = useCallback(() => {
    if (!workoutData) return;
    const initialStates: ExerciseState[] = workoutData.exercises.map((ex) => ({
      sets: Array.from({ length: ex.targetSets }, () => ({
        kg: 0,
        reps: ex.targetReps,
        completed: false,
      })),
      restSeconds: DEFAULT_REST_SECONDS,
    }));
    setExerciseStates(initialStates);
    setElapsedSeconds(0);
    elapsedRef.current = 0;
    startedAtRef.current = Date.now();
    setExpandedIndex(0);
    setShowPauseMenu(false);
  }, [workoutData]);

  const handleAway = useCallback(() => {
    // Save state and go back
    const state: ActiveWorkoutState = {
      exercises: exerciseStates,
      elapsedSeconds: elapsedRef.current,
      startedAt: startedAtRef.current,
    };
    try {
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
    } catch {
      // Ignore
    }
    router.push('/dashboard/exercises');
  }, [exerciseStates, router]);

  const updateRestTime = useCallback((exerciseIdx: number, seconds: number) => {
    setExerciseStates((prev) => {
      return prev.map((ex, eIdx) => {
        if (eIdx !== exerciseIdx) return ex;
        return { ...ex, restSeconds: seconds };
      });
    });
    setShowExerciseMenu(null);
  }, []);

  // ── No active workout found ──────────────────────────────────────────────
  if (!workoutData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <Dumbbell size={48} className="text-neutral-600" />
        <h2 className="text-lg font-bold text-white">No Active Workout</h2>
        <p className="text-sm text-neutral-400 text-center max-w-xs">
          Start a workout from a training plan or template to begin tracking your session.
        </p>
        <Link
          href="/dashboard/training"
          className="mt-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all"
        >
          Go to Training
        </Link>
      </div>
    );
  }

  // ── Don't render until initialized ────────────────────────────────────────
  if (exerciseStates.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-transparent flex flex-col relative">
      {/* ─── TOP BAR ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-4 h-14 max-w-3xl mx-auto">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setShowPauseMenu(true)}
              className="p-2 -ml-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-all shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white truncate">
                Day {workoutData.dayNumber} - {workoutData.planName}
              </h1>
              <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
                {workoutData.dayName}
              </p>
            </div>
          </div>

          {/* Right: Timer + Finish */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
              <Timer size={14} className="text-brand-400" />
              <span className="text-sm font-mono font-bold text-white tabular-nums">
                {formatTime(elapsedSeconds)}
              </span>
            </div>
            <button
              onClick={() => setShowFinishDialog(true)}
              className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40"
            >
              Finish
            </button>
          </div>
        </div>
      </div>

      {/* ─── EXERCISE LIST ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="px-4 py-4 max-w-3xl mx-auto space-y-3">
          {workoutData.exercises.map((exercise, exerciseIdx) => {
            const state = exerciseStates[exerciseIdx]!;
            const completedCount = state.sets.filter((s) => s.completed).length;
            const totalCount = state.sets.length;
            const isExpanded = expandedIndex === exerciseIdx;
            const allDone = completedCount === totalCount;

            return (
              <motion.div
                key={exerciseIdx}
                layout
                className={cn(
                  'rounded-2xl border overflow-hidden transition-colors',
                  allDone
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-white/5 border-white/10'
                )}
              >
                {/* ── Exercise Header ──────────────────────────────────────── */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedIndex(isExpanded ? -1 : exerciseIdx)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedIndex(isExpanded ? -1 : exerciseIdx); } }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left group cursor-pointer"
                >
                  {/* Thumbnail Icon */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0',
                      allDone ? 'bg-green-500/20' : 'bg-white/10'
                    )}
                  >
                    {allDone ? (
                      <Check size={18} className="text-green-400" />
                    ) : (
                      <span>{getMuscleIcon(exercise.muscleGroup)}</span>
                    )}
                  </div>

                  {/* Name + Progress */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className={cn(
                        'text-sm font-bold truncate',
                        allDone ? 'text-green-300' : 'text-white'
                      )}
                    >
                      {exercise.name}
                    </h3>
                    <p
                      className={cn(
                        'text-xs font-medium mt-0.5',
                        allDone ? 'text-green-500/70' : 'text-neutral-500'
                      )}
                    >
                      {completedCount}/{totalCount} Done
                    </p>
                  </div>

                  {/* Kebab + Chevron */}
                  <div className="flex items-center gap-1 shrink-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowExerciseMenu(
                          showExerciseMenu === exerciseIdx ? null : exerciseIdx
                        );
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setShowExerciseMenu(showExerciseMenu === exerciseIdx ? null : exerciseIdx); } }}
                      className="p-1.5 rounded-lg text-neutral-600 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <MoreVertical size={16} />
                    </div>
                    <div className="text-neutral-600 transition-transform">
                      {isExpanded ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Kebab Menu Dropdown ───────────────────────────────────── */}
                <AnimatePresence>
                  {showExerciseMenu === exerciseIdx && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden border-t border-white/5"
                    >
                      <div className="px-4 py-2 space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-neutral-600 font-bold px-2 pt-1 pb-1">
                          Rest Timer
                        </p>
                        <div className="flex gap-2">
                          {[60, 90, 120, 180].map((sec) => (
                            <button
                              key={sec}
                              onClick={() => updateRestTime(exerciseIdx, sec)}
                              className={cn(
                                'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all',
                                state.restSeconds === sec
                                  ? 'bg-brand-500 text-white'
                                  : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'
                              )}
                            >
                              {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Expanded Set Rows ─────────────────────────────────────── */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/5">
                        {/* Column Headers */}
                        <div className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-neutral-600 font-bold">
                          <div className="w-8 text-center">Set</div>
                          <div className="flex-1 text-center">KG</div>
                          <div className="flex-1 text-center">Reps</div>
                          <div className="w-10 text-center">Done</div>
                          <div className="w-8" />
                        </div>

                        {/* Set Rows */}
                        {state.sets.map((set, setIdx) => (
                          <motion.div
                            key={setIdx}
                            initial={false}
                            animate={{
                              backgroundColor: set.completed
                                ? 'rgba(34,197,94,0.08)'
                                : 'rgba(0,0,0,0)',
                            }}
                            className={cn(
                              'flex items-center gap-2 px-4 py-2.5 border-t border-white/[0.03] transition-all',
                              set.completed && 'opacity-70'
                            )}
                          >
                            {/* Set Number */}
                            <div
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0',
                                set.completed
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-white/5 text-neutral-400'
                              )}
                            >
                              {setIdx + 1}
                            </div>

                            {/* KG Input */}
                            <div className="flex-1 flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={set.kg || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateSet(
                                    exerciseIdx,
                                    setIdx,
                                    'kg',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                disabled={set.completed}
                                className={cn(
                                  'w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-center text-sm font-bold text-white outline-none transition-all',
                                  'focus:border-brand-500/50 focus:bg-white/15',
                                  'placeholder:text-neutral-700',
                                  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                                  set.completed && 'opacity-50 cursor-not-allowed'
                                )}
                              />
                              <span className="text-[10px] text-neutral-600 font-bold uppercase shrink-0">
                                KG
                              </span>
                            </div>

                            {/* Reps Input */}
                            <div className="flex-1 flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                value={set.reps || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateSet(
                                    exerciseIdx,
                                    setIdx,
                                    'reps',
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                disabled={set.completed}
                                className={cn(
                                  'w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-center text-sm font-bold text-white outline-none transition-all',
                                  'focus:border-brand-500/50 focus:bg-white/15',
                                  'placeholder:text-neutral-700',
                                  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                                  set.completed && 'opacity-50 cursor-not-allowed'
                                )}
                              />
                              <span className="text-[10px] text-neutral-600 font-bold uppercase shrink-0">
                                Reps
                              </span>
                            </div>

                            {/* Checkbox */}
                            <button
                              onClick={() => toggleSetComplete(exerciseIdx, setIdx)}
                              className={cn(
                                'w-10 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 border',
                                set.completed
                                  ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/25'
                                  : 'bg-white/5 border-white/20 text-neutral-600 hover:border-brand-500/50 hover:text-brand-400'
                              )}
                            >
                              <Check size={16} strokeWidth={3} />
                            </button>

                            {/* Remove Set */}
                            <button
                              onClick={() => removeSet(exerciseIdx, setIdx)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-700 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                            >
                              <Trash2 size={12} />
                            </button>
                          </motion.div>
                        ))}

                        {/* Add Set Button */}
                        <button
                          onClick={() => addSet(exerciseIdx)}
                          className="w-full flex items-center justify-center gap-2 py-3 text-xs font-bold text-neutral-500 hover:text-brand-400 hover:bg-white/[0.03] transition-all border-t border-white/[0.03]"
                        >
                          <Plus size={14} />
                          Add a set
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          {/* ── Add Exercises Link ────────────────────────────────────────── */}
          <button
            onClick={() => router.push('/dashboard/exercises')}
            className="w-full flex items-center justify-center gap-2 py-4 text-sm font-bold text-neutral-500 hover:text-brand-400 transition-all"
          >
            <Plus size={16} />
            Add exercises
          </button>
        </div>
      </div>

      {/* ─── BOTTOM BAR: LOG NEXT SET ──────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/80 backdrop-blur-xl border-t border-white/[0.06] safe-area-pb">
        <div className="px-4 py-3 max-w-3xl mx-auto">
          <button
            onClick={handleLogNextSet}
            disabled={!nextIncompleteSet}
            className={cn(
              'w-full py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all',
              nextIncompleteSet
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600 hover:shadow-brand-500/40 active:scale-[0.98]'
                : 'bg-white/5 text-neutral-600 cursor-not-allowed'
            )}
          >
            {nextIncompleteSet
              ? `Log Next Set - ${workoutData.exercises[nextIncompleteSet.exerciseIdx]?.name.split(' \u00b7 ')[0]} #${nextIncompleteSet.setIdx + 1}`
              : 'All Sets Complete!'}
          </button>
        </div>
      </div>

      {/* ─── REST TIMER OVERLAY ────────────────────────────────────────────── */}
      <AnimatePresence>
        {restTimer.active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-lg"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="flex flex-col items-center gap-6 px-8"
            >
              {/* Rest Label */}
              <div className="flex items-center gap-2 text-neutral-400">
                <Timer size={18} className="text-brand-400" />
                <span className="text-sm font-bold uppercase tracking-wider">
                  Rest Timer
                </span>
              </div>

              {/* Countdown */}
              <div className="relative">
                {/* Ring */}
                <svg width="200" height="200" viewBox="0 0 200 200" className="transform -rotate-90">
                  <circle
                    cx="100"
                    cy="100"
                    r="90"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="90"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                    className="text-brand-500"
                    strokeDasharray={2 * Math.PI * 90}
                    strokeDashoffset={
                      2 *
                      Math.PI *
                      90 *
                      (1 -
                        restTimer.seconds /
                        (exerciseStates[restTimer.exerciseIdx]?.restSeconds ||
                          DEFAULT_REST_SECONDS))
                    }
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-black text-white tabular-nums font-mono">
                    {formatTime(restTimer.seconds)}
                  </span>
                  <span className="text-xs text-neutral-500 font-medium mt-1">
                    remaining
                  </span>
                </div>
              </div>

              {/* Exercise Info */}
              <p className="text-sm text-neutral-400 font-medium text-center">
                {restTimer.exerciseIdx >= 0 &&
                  workoutData.exercises[restTimer.exerciseIdx]?.name}
              </p>

              {/* Skip Button */}
              <button
                onClick={skipRestTimer}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl px-6 py-3 text-sm font-bold text-white transition-all"
              >
                <SkipForward size={16} />
                Skip Rest
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── PAUSE MENU OVERLAY ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPauseMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="w-full max-w-sm mx-4 space-y-3"
            >
              {/* Title */}
              <div className="text-center mb-6">
                <Pause size={32} className="text-brand-400 mx-auto mb-3" />
                <h2 className="text-xl font-black text-white">Workout Paused</h2>
                <p className="text-sm text-neutral-500 mt-1">
                  {formatTime(elapsedSeconds)} elapsed &middot;{' '}
                  {stats.completedSets} sets done
                </p>
              </div>

              {/* Away */}
              <button
                onClick={handleAway}
                className="w-full flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl px-5 py-4 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                  <LogOut size={18} className="text-blue-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-white">Away for a while</p>
                  <p className="text-xs text-neutral-500">
                    Keep progress and continue later
                  </p>
                </div>
              </button>

              {/* Restart */}
              <button
                onClick={handleRestart}
                className="w-full flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl px-5 py-4 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 transition-colors">
                  <RotateCcw size={18} className="text-amber-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-white">Restart</p>
                  <p className="text-xs text-neutral-500">
                    Reset all sets and start over
                  </p>
                </div>
              </button>

              {/* Quit */}
              <button
                onClick={handleQuit}
                className="w-full flex items-center gap-4 bg-white/5 hover:bg-red-500/5 border border-white/10 hover:border-red-500/20 rounded-2xl px-5 py-4 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0 group-hover:bg-red-500/20 transition-colors">
                  <X size={18} className="text-red-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-white">Quit</p>
                  <p className="text-xs text-neutral-500">
                    Discard workout and exit
                  </p>
                </div>
              </button>

              {/* Resume */}
              <button
                onClick={() => setShowPauseMenu(false)}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white font-black text-sm uppercase tracking-wider rounded-2xl py-4 transition-all shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 mt-4"
              >
                <div className="flex items-center justify-center gap-2">
                  <Play size={16} />
                  Resume Workout
                </div>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── FINISH DIALOG ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFinishDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-lg"
            onClick={() => setShowFinishDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm mx-4 bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6"
            >
              {/* Header */}
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">
                  <Dumbbell size={40} className="text-brand-400 mx-auto" />
                </div>
                <h2 className="text-xl font-black text-white">Finished?</h2>
                <p className="text-sm text-neutral-500 mt-2">
                  Only completed sets will be recorded in your history
                </p>
              </div>

              {/* Stats */}
              <div className="flex gap-3 mb-6">
                <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-green-400">
                    {stats.completedSets}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-green-500/70 font-bold mt-1">
                    Completed
                  </p>
                </div>
                <div className="flex-1 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-amber-400">
                    {stats.incompleteSets}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-amber-500/70 font-bold mt-1">
                    Incomplete
                  </p>
                </div>
              </div>

              {/* Volume + Duration */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-neutral-500 font-medium">
                      Total Volume
                    </p>
                    <p className="text-lg font-black text-white">
                      {stats.totalVolume.toLocaleString()} kg
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-neutral-500 font-medium">
                      Duration
                    </p>
                    <p className="text-lg font-black text-white">
                      {formatTime(elapsedSeconds)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="space-y-2">
                <button
                  onClick={handleFinish}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-black text-sm uppercase tracking-wider rounded-2xl py-3.5 transition-all shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40"
                >
                  Finished
                </button>
                <button
                  onClick={() => setShowFinishDialog(false)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white font-bold text-sm rounded-2xl py-3.5 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
