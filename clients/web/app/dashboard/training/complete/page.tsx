'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SetResult {
  weight: number;
  reps: number;
  oneRepMax: number;
  isBest?: boolean;
}

interface ExerciseResult {
  name: string;
  sets: SetResult[];
}

interface WorkoutResult {
  planName: string;
  dayName: string;
  totalVolume: number;
  durationSeconds: number;
  completedAt: string;
  exercises: ExerciseResult[];
  hasChanges?: boolean;
  changes?: { exercise: string; from: number; to: number }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SET_CIRCLES = ['\u2460', '\u2461', '\u2462', '\u2463', '\u2464', '\u2465', '\u2466', '\u2467', '\u2468', '\u2469'];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  Confetti Piece                                                     */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = [
  '#f97316', '#fb923c', '#fdba74', '#a855f7', '#c084fc',
  '#e879f9', '#22d3ee', '#34d399', '#fbbf24', '#f472b6',
  '#818cf8', '#38bdf8', '#4ade80', '#facc15', '#fb7185',
];

interface ConfettiPieceProps {
  index: number;
}

function ConfettiPiece({ index }: ConfettiPieceProps) {
  const style = useMemo(() => {
    const left = Math.random() * 100;
    const delay = Math.random() * 3;
    const duration = 2.5 + Math.random() * 2;
    const size = 4 + Math.random() * 6;
    const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
    const rotation = Math.random() * 360;
    const drift = -30 + Math.random() * 60;

    return {
      left: `${left}%`,
      width: `${size}px`,
      height: `${size * (0.4 + Math.random() * 0.6)}px`,
      backgroundColor: color,
      borderRadius: Math.random() > 0.5 ? '50%' : '1px',
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
      '--drift': `${drift}px`,
      '--rotation': `${rotation}deg`,
    } as React.CSSProperties;
  }, [index]);

  return <div className="confetti-piece" style={style} />;
}

/* ------------------------------------------------------------------ */
/*  Update Dialog                                                      */
/* ------------------------------------------------------------------ */

interface UpdateDialogProps {
  changes: { exercise: string; from: number; to: number }[];
  onUpdate: () => void;
  onKeep: () => void;
}

function UpdateDialog({ changes, onUpdate, onKeep }: UpdateDialogProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-sm bg-neutral-900 border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        <div className="text-center mb-4">
          <div className="text-2xl mb-2">&#x1F504;</div>
          <h3 className="text-white font-bold text-lg">Update your workout?</h3>
          <p className="text-neutral-400 text-sm mt-1">
            You changed some weights during this workout
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {changes.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3"
            >
              <span className="text-sm text-neutral-300 font-medium truncate mr-3">{c.exercise}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-neutral-500 text-sm">{c.from} kg</span>
                <span className="text-brand-400 font-bold">&#8594;</span>
                <span className="text-white text-sm font-bold">{c.to} kg</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onKeep}
            className="flex-1 py-3 rounded-xl border border-white/10 text-neutral-400 font-bold text-sm hover:bg-white/5 transition-colors"
          >
            Keep current
          </button>
          <button
            onClick={onUpdate}
            className="flex-1 py-3 rounded-xl bg-brand-500 text-white font-bold text-sm hover:bg-brand-600 transition-colors shadow-lg shadow-brand-500/25"
          >
            Update all changes
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function WorkoutCompletePage() {
  const router = useRouter();
  const [result, setResult] = useState<WorkoutResult | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [confettiVisible, setConfettiVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('sessionId');

        if (!sessionId) {
          // Fallback to local storage if sessionId is not in URL
          const stored = localStorage.getItem('nf_workout_result');
          if (stored) {
            const parsed = JSON.parse(stored) as WorkoutResult;
            setResult(parsed);
          } else {
            setError("No workout session found.");
          }
          return;
        }

        const res = await fetch(`/api/workout/session/${sessionId}`);
        if (!res.ok) throw new Error('Failed to load session');
        const data = await res.json();

        // Transform the backend data into the WorkoutResult format
        // This is a placeholder transformation assuming standard backend format
        const transformedData: WorkoutResult = {
          planName: data.routine?.name || 'Custom Workout',
          dayName: 'Completed',
          totalVolume: data.logs?.reduce((acc: number, log: any) => acc + (log.weight * log.reps), 0) || 0,
          durationSeconds: data.endedAt ? Math.floor((new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime()) / 1000) : 0,
          completedAt: data.endedAt || new Date().toISOString(),
          exercises: data.logs?.reduce((acc: any[], log: any) => {
            const existing = acc.find(e => e.name === log.exercise?.name);
            const set = { weight: log.weight, item: log.reps, oneRepMax: log.weight * (1 + log.reps / 30) }; // Basic 1RM formula
            if (existing) {
              existing.sets.push(set);
            } else {
              acc.push({ name: log.exercise?.name || 'Unknown', sets: [set] });
            }
            return acc;
          }, []) || [],
          hasChanges: false,
          changes: []
        };

        setResult(transformedData);
        // Clear local storage on successful fetch
        localStorage.removeItem('nf_workout_result');

      } catch (err: any) {
        console.error(err);
        setError("Error loading workout summary.");
      }
    };
    fetchSession();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setConfettiVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (result?.hasChanges && result.changes && result.changes.length > 0) {
      const timer = setTimeout(() => setShowUpdateDialog(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const handleFinished = () => {
    localStorage.removeItem('nf_workout_result');
    router.push('/dashboard/training');
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white p-4">
        <h2 className="text-2xl font-bold mb-4">Oops!</h2>
        <p className="text-neutral-400 mb-8">{error}</p>
        <button
          onClick={() => router.push('/dashboard/training')}
          className="px-6 py-3 bg-brand-500 rounded-xl font-bold hover:bg-brand-600 transition-colors"
        >
          Return to Training
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* ---- Inline styles for confetti animation ---- */}
      <style jsx global>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-20px) translateX(0) rotate(0deg);
            opacity: 1;
          }
          25% {
            transform: translateY(25vh) translateX(var(--drift, 20px)) rotate(calc(var(--rotation, 180deg)));
            opacity: 1;
          }
          50% {
            transform: translateY(50vh) translateX(calc(var(--drift, 20px) * -0.5)) rotate(calc(var(--rotation, 180deg) * 2));
            opacity: 0.8;
          }
          100% {
            transform: translateY(105vh) translateX(var(--drift, 20px)) rotate(calc(var(--rotation, 180deg) * 3));
            opacity: 0;
          }
        }
        .confetti-piece {
          position: fixed;
          top: -10px;
          z-index: 60;
          pointer-events: none;
          animation: confetti-fall linear forwards;
        }
      `}</style>

      <div className="min-h-screen bg-transparent relative overflow-hidden">
        {/* ---- Confetti ---- */}
        <AnimatePresence>
          {confettiVisible && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="fixed inset-0 z-50 pointer-events-none"
            >
              {Array.from({ length: 60 }).map((_, i) => (
                <ConfettiPiece key={i} index={i} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Content ---- */}
        <div className="relative z-10 max-w-lg mx-auto px-4 py-8 pb-32">
          {/* Trophy */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
            className="text-center mb-2"
          >
            <span className="text-7xl block" role="img" aria-label="Trophy">
              &#127942;
            </span>
          </motion.div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-center mb-8"
          >
            <p className="text-brand-400 font-bold text-sm uppercase tracking-widest mb-1">Nice job!</p>
            <h1
              className="text-3xl md:text-4xl font-black text-white"
              style={{
                textShadow: '0 0 40px rgba(168, 85, 247, 0.5), 0 0 80px rgba(168, 85, 247, 0.2)',
              }}
            >
              WORKOUT COMPLETED!
            </h1>
          </motion.div>

          {/* Stats Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass-card p-5 rounded-2xl mb-6"
          >
            <div className="text-center mb-4">
              <p className="text-white font-bold text-lg">
                {result.dayName} &mdash; {result.planName}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Volume</p>
                <p className="text-2xl font-black text-white">{result.totalVolume}</p>
                <p className="text-xs text-neutral-500">kg</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Duration</p>
                <p className="text-2xl font-black text-white">{formatDuration(result.durationSeconds)}</p>
                <p className="text-xs text-neutral-500">min</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Date</p>
                <p className="text-lg font-bold text-white leading-tight">{formatDate(result.completedAt)}</p>
              </div>
            </div>
          </motion.div>

          {/* Exercise Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="space-y-4 mb-8"
          >
            <h2 className="text-white font-bold text-sm uppercase tracking-widest px-1">
              Exercise Summary
            </h2>

            {result.exercises.map((exercise, exIdx) => (
              <motion.div
                key={exIdx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 + exIdx * 0.1 }}
                className="glass-card p-4 rounded-2xl"
              >
                <h3 className="text-white font-bold text-sm mb-3">{exercise.name}</h3>
                <div className="space-y-2">
                  {exercise.sets.map((set, setIdx) => (
                    <div
                      key={setIdx}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors',
                        set.isBest
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'bg-white/[0.02]'
                      )}
                    >
                      {/* Set number circle */}
                      <span className="text-neutral-500 text-sm w-5 shrink-0 text-center">
                        {SET_CIRCLES[setIdx] || `${setIdx + 1}`}
                      </span>

                      {/* Weight x Reps */}
                      <span className="text-white font-bold text-sm flex-1">
                        {set.weight} kg &times; {set.reps}
                      </span>

                      {/* Best badge */}
                      {set.isBest && (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                          Best
                        </span>
                      )}

                      {/* 1RM */}
                      <span className="text-neutral-500 text-xs shrink-0">
                        1 RM = {set.oneRepMax.toFixed(1)} kg
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Finished Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="px-4"
          >
            <button
              onClick={handleFinished}
              className="w-full py-4 rounded-2xl bg-brand-500 text-white font-black text-base uppercase tracking-wider hover:bg-brand-600 transition-all shadow-lg shadow-brand-500/25 active:scale-[0.98]"
            >
              FINISHED
            </button>
          </motion.div>
        </div>

        {/* ---- Update Dialog ---- */}
        <AnimatePresence>
          {showUpdateDialog && result.changes && (
            <UpdateDialog
              changes={result.changes}
              onUpdate={() => {
                setShowUpdateDialog(false);
              }}
              onKeep={() => {
                setShowUpdateDialog(false);
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
