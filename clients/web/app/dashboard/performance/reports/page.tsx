'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, Sparkles, TrendingUp, AlertCircle,
    CheckCircle2, Flame, BrainCircuit, Activity, BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { progressApi } from '@/lib/api';
import { toast } from 'sonner';

interface AIReport {
    id: string;
    date: string;
    weekRange: string;
    score: number;
    summary: string;
    highlights: string[];
    improvements: string[];
    focusArea: string;
}

export default function AIReportsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

    const { data: reports = [], isLoading } = useQuery<AIReport[]>({
        queryKey: ['progress-reports'],
        queryFn: async () => {
            const res = await progressApi.get('/reports');
            return res.data;
        }
    });

    const generateAuditMutation = useMutation({
        mutationFn: async () => {
            const res = await progressApi.post('/weekly-audit');
            return res.data;
        },
        onSuccess: () => {
            toast.success('Generated new weekly audit!');
            queryClient.invalidateQueries({ queryKey: ['progress-reports'] });
        },
        onError: () => toast.error('Failed to generate audit. Try again later.')
    });

    // Auto-select first report if none selected
    if (!selectedReportId && reports.length > 0) {
        setSelectedReportId(reports[0]!.id);
    }

    const activeReport = (reports.find(r => r.id === selectedReportId) ?? reports[0]!)!;

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <ChevronLeft size={20} />
                    </Button>
                    <div className="flex-1 flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-black text-white flex items-center gap-3">
                                <BrainCircuit className="text-brand-500" /> AI Performance Reports
                            </h1>
                            <p className="text-neutral-400 text-sm mt-0.5">Weekly insights generated from your tracker data</p>
                        </div>
                        <Button
                            onClick={() => generateAuditMutation.mutate()}
                            disabled={generateAuditMutation.isPending}
                            className="bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl"
                        >
                            {generateAuditMutation.isPending ? 'Generating...' : 'Generate New Audit'}
                        </Button>
                    </div>
                </header>

                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500" />
                    </div>
                ) : reports.length === 0 ? (
                    <div className="glass-card p-12 text-center rounded-2xl border-white/[0.04]">
                        <BrainCircuit size={48} className="mx-auto text-neutral-600 mb-4" />
                        <h2 className="text-xl font-bold text-white mb-2">No Reports Yet</h2>
                        <p className="text-neutral-400 mb-6">Generate your first AI performance audit to get insights on your recent data.</p>
                        <Button
                            onClick={() => generateAuditMutation.mutate()}
                            disabled={generateAuditMutation.isPending}
                            className="bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl"
                        >
                            {generateAuditMutation.isPending ? 'Generating...' : 'Generate First Audit'}
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Sidebar / History List */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest px-2 mb-4">Past Reports</h3>
                            {reports.map((report) => (
                                <button
                                    key={report.id}
                                    onClick={() => setSelectedReportId(report.id)}
                                    className={cn(
                                        'w-full text-left p-4 rounded-xl transition-all border block',
                                        selectedReportId === report.id
                                            ? 'bg-brand-500/10 border-brand-500/30'
                                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                                    )}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className={cn("font-bold text-sm", selectedReportId === report.id ? 'text-brand-400' : 'text-white')}>
                                                {report.weekRange}
                                            </p>
                                            <p className="text-xs text-neutral-500 mt-0.5">{new Date(report.date).toLocaleDateString()}</p>
                                        </div>
                                        <div className={cn(
                                            "px-2 py-1 rounded-md text-xs font-bold",
                                            report.score >= 85 ? 'bg-emerald-500/20 text-emerald-400' :
                                                report.score >= 70 ? 'bg-amber-500/20 text-amber-400' :
                                                    'bg-red-500/20 text-red-400'
                                        )}>
                                            {report.score}
                                        </div>
                                    </div>
                                    <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                                        {report.summary}
                                    </p>
                                </button>
                            ))}
                        </div>

                        {/* Main Report View */}
                        <div className="md:col-span-2">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeReport.id}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    className="glass-card p-6 md:p-8 rounded-2xl border-white/[0.04]"
                                >
                                    {/* Overview Banner */}
                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/[0.06] pb-6 mb-6 gap-6">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Sparkles size={18} className="text-brand-500" />
                                                <h2 className="text-xl font-bold text-white">Weekly Analysis</h2>
                                            </div>
                                            <p className="text-neutral-400 text-sm">{activeReport.weekRange}</p>
                                        </div>

                                        <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-2xl min-w-[140px]">
                                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">NightFuel Score</p>
                                            <div className="relative w-16 h-16 flex items-center justify-center">
                                                <svg className="w-full h-full -rotate-90 absolute inset-0" viewBox="0 0 100 100">
                                                    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                                                    <circle
                                                        cx="50" cy="50" r="45" fill="none"
                                                        stroke={activeReport.score >= 85 ? '#10b981' : activeReport.score >= 70 ? '#f59e0b' : '#ef4444'}
                                                        strokeWidth="8" strokeLinecap="round"
                                                        strokeDasharray={`${(activeReport.score / 100) * 283} 283`}
                                                    />
                                                </svg>
                                                <span className="text-xl font-black text-white">{activeReport.score}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Summary */}
                                    <div className="mb-8 p-5 rounded-xl bg-gradient-to-br from-brand-500/10 to-transparent border border-brand-500/20">
                                        <p className="text-brand-100 leading-relaxed text-sm md:text-base">
                                            "{activeReport.summary}"
                                        </p>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-6 mb-8">
                                        {/* Highlights */}
                                        <div className="space-y-4">
                                            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                                                <TrendingUp size={16} className="text-emerald-400" />
                                                Highlights
                                            </h3>
                                            <ul className="space-y-3">
                                                {activeReport.highlights.map((item, i) => (
                                                    <li key={i} className="flex gap-3 text-sm text-neutral-300">
                                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                                                        <span className="leading-tight">{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        {/* Areas to Improve */}
                                        <div className="space-y-4">
                                            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                                                <AlertCircle size={16} className="text-amber-400" />
                                                Areas to Improve
                                            </h3>
                                            <ul className="space-y-3">
                                                {activeReport.improvements.map((item, i) => (
                                                    <li key={i} className="flex gap-3 text-sm text-neutral-300">
                                                        <Activity size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                                        <span className="leading-tight">{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    {/* Focus Area Banner */}
                                    <div className="p-5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                        <h3 className="flex items-center gap-2 text-sm font-bold text-white mb-2">
                                            <BookOpen size={16} className="text-blue-400" />
                                            Next Week's Focus
                                        </h3>
                                        <p className="text-blue-100 text-sm leading-relaxed">
                                            {activeReport.focusArea}
                                        </p>
                                    </div>

                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
