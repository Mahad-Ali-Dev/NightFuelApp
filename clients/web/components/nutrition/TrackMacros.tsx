import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Activity } from 'lucide-react';

export function TrackMacros({ today }: { today: any }) {
    if (!today) return null;

    const p = today.proteinActual || 0;
    const c = today.carbsActual || 0;
    const f = today.fatActual || 0;

    // Convert to kcal to get an accurate distribution pie (P: 4, C: 4, F: 9)
    const pKcal = p * 4;
    const cKcal = c * 4;
    const fKcal = f * 9;
    const totalKcal = pKcal + cKcal + fKcal || 1; // avoid /0

    // Circumference of circle with r=40 is ~251.2
    const C_CIRCUMFERENCE = 251.2;

    // Percentages
    const pctP = pKcal / totalKcal;
    const pctC = cKcal / totalKcal;
    const pctF = fKcal / totalKcal;

    // Dash offsets
    const dashP = pctP * C_CIRCUMFERENCE;
    const dashC = pctC * C_CIRCUMFERENCE;
    const dashF = pctF * C_CIRCUMFERENCE;

    // Offsets for the stroke
    const offsetP = C_CIRCUMFERENCE;
    const offsetC = C_CIRCUMFERENCE - dashP;
    const offsetF = C_CIRCUMFERENCE - dashP - dashC;

    // Mock Fiber & Net Carbs (Assuming 15% of carbs are fiber for demonstration purposes)
    const mockFibre = Math.round(c * 0.15);
    const mockNetCarbs = c - mockFibre;
    const fibreTarget = 30; // standard 30g target
    const cTarget = today.carbsTarget || 250;

    return (
        <Card className="glass-card overflow-hidden">
            <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="text-white text-lg flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-brand-400" />
                    Track Macros
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid md:grid-cols-2 gap-8 items-center">
                    {/* SVG Pie Chart */}
                    <div className="relative flex justify-center items-center h-48">
                        <svg className="w-full h-full transform -rotate-90 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" viewBox="0 0 100 100">
                            {/* Background Track */}
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="16" />

                            {/* Protein */}
                            <motion.circle
                                cx="50" cy="50" r="40" fill="transparent"
                                stroke="#3b82f6" // blue-500
                                strokeWidth="16"
                                strokeDasharray={C_CIRCUMFERENCE}
                                initial={{ strokeDashoffset: C_CIRCUMFERENCE }}
                                animate={{ strokeDashoffset: offsetP }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                            />

                            {/* Carbs */}
                            <motion.circle
                                cx="50" cy="50" r="40" fill="transparent"
                                stroke="#10b981" // emerald-500
                                strokeWidth="16"
                                strokeDasharray={C_CIRCUMFERENCE}
                                initial={{ strokeDashoffset: C_CIRCUMFERENCE }}
                                animate={{ strokeDashoffset: offsetC }}
                                transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                            />

                            {/* Fats */}
                            <motion.circle
                                cx="50" cy="50" r="40" fill="transparent"
                                stroke="#eab308" // yellow-500
                                strokeWidth="16"
                                strokeDasharray={C_CIRCUMFERENCE}
                                initial={{ strokeDashoffset: C_CIRCUMFERENCE }}
                                animate={{ strokeDashoffset: offsetF }}
                                transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
                            />
                        </svg>

                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-black text-white">{Math.round(totalKcal)}</span>
                            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Kcal</span>
                        </div>
                    </div>

                    {/* Breakdown Details */}
                    <div className="space-y-6">
                        {/* Legend */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className="text-center">
                                <div className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-blue-500" /> {Math.round(p)}g
                                </div>
                                <div className="text-[10px] uppercase text-neutral-500 font-bold tracking-wider mt-0.5">Protein</div>
                            </div>
                            <div className="text-center border-x border-white/10">
                                <div className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> {Math.round(c)}g
                                </div>
                                <div className="text-[10px] uppercase text-neutral-500 font-bold tracking-wider mt-0.5">Carbs</div>
                            </div>
                            <div className="text-center">
                                <div className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-yellow-500" /> {Math.round(f)}g
                                </div>
                                <div className="text-[10px] uppercase text-neutral-500 font-bold tracking-wider mt-0.5">Fat</div>
                            </div>
                        </div>

                        {/* Net Carbs & Fibre Linear Bars */}
                        <div className="space-y-4 pt-4 border-t border-white/5">
                            <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2 mb-3">
                                <Activity className="h-3 w-3 text-brand-400" /> Carbohydrate Depth
                            </h4>

                            {/* Fibre */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs font-medium">
                                    <span className="text-neutral-300">Dietary Fibre</span>
                                    <span className="text-white">{mockFibre}g / <span className="text-neutral-500">{fibreTarget}g</span></span>
                                </div>
                                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-emerald-400"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min((mockFibre / fibreTarget) * 100, 100)}%` }}
                                        transition={{ duration: 1, delay: 0.5 }}
                                    />
                                </div>
                            </div>

                            {/* Net Carbs */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs font-medium">
                                    <span className="text-neutral-300">Net Carbs</span>
                                    <span className="text-white">{mockNetCarbs}g / <span className="text-neutral-500">{cTarget}g</span></span>
                                </div>
                                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-emerald-600"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min((mockNetCarbs / cTarget) * 100, 100)}%` }}
                                        transition={{ duration: 1, delay: 0.6 }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
