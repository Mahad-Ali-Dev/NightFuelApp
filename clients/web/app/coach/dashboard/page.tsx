'use client';

import { useAuth } from '@/context/auth-context';
import { useQuery } from '@tanstack/react-query';
import { getStudents, getProtocols, assignProtocol } from '@/lib/api';
import {
    Users,
    Activity,
    ArrowUpRight,
    Search,
    Filter,
    MoreHorizontal,
    CheckCircle2,
    AlertCircle,
    Zap,
    ClipboardList,
    ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// --- Types ---
interface Student {
    userId: string;
    profile: {
        displayName: string;
        avatarUrl: string | null;
        lifestyleType: string;
    };
    status: {
        fatigueScore: number;
        adherenceRate: number;
        currentStreak: number;
    } | null;
    currentProtocolId: string | null;
}

interface Protocol {
    id: string;
    name: string;
    description: string;
}

export default function CoachDashboard() {
    const { user, isAuthenticated } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');

    const { data: students, isLoading: studentsLoading } = useQuery<Student[]>({
        queryKey: ['coachStudents'],
        queryFn: async () => {
            const res = await getStudents();
            return res.data;
        },
        enabled: isAuthenticated && (user?.role === 'COACH' || user?.role === 'TRAINER' || user?.role === 'NUTRITIONIST'),
    });

    const { data: protocols } = useQuery<Protocol[]>({
        queryKey: ['protocols'],
        queryFn: async () => {
            const res = await getProtocols();
            return res.data;
        },
        enabled: isAuthenticated,
    });

    if (!isAuthenticated || !['COACH', 'TRAINER', 'NUTRITIONIST'].includes(user?.role || '')) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-black text-white">
                <div className="text-center space-y-4">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
                    <h1 className="text-2xl font-bold">Access Denied</h1>
                    <p className="text-neutral-500">This dashboard is only available for professional roles.</p>
                </div>
            </div>
        );
    }

    const filteredStudents = students?.filter(s =>
        s.profile.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8 relative z-10 selection:bg-brand-500 selection:text-white mt-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-7xl mx-auto space-y-8"
            >
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass-panel p-8 rounded-3xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <Users className="w-24 h-24 text-brand-500" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-4">
                            Coach <span className="text-brand-500">Dashboard</span>
                        </h1>
                        <p className="mt-2 text-neutral-400 font-medium">
                            Managing {students?.length || 0} active students across {protocols?.length || 0} protocols.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                            <input
                                type="text"
                                placeholder="Search students..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 w-64 transition-all"
                            />
                        </div>
                        <Button className="bg-brand-500 hover:bg-brand-600 text-white rounded-xl gap-2 font-bold shadow-lg shadow-brand-500/20">
                            <Zap className="h-4 w-4 fill-white" />
                            Blast Update
                        </Button>
                    </div>
                </header>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Student List */}
                    <div className="lg:col-span-8 space-y-6">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 flex items-center gap-3 pl-2">
                            <div className="w-8 h-px bg-neutral-800" />
                            Active Student Roster
                        </h2>

                        {studentsLoading ? (
                            <div className="grid gap-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-24 glass-panel animate-pulse rounded-2xl" />
                                ))}
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {filteredStudents?.map((student, idx) => (
                                    <StudentRow key={student.userId} student={student} protocols={protocols || []} index={idx} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Insights Slider */}
                    <div className="lg:col-span-4 space-y-6">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 flex items-center gap-3 pl-2">
                            <div className="w-8 h-px bg-neutral-800" />
                            Priority Insights
                        </h2>

                        <Card className="glass-card border-brand-500/20 bg-brand-500/5 p-6 space-y-4">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-amber-500" /> High Fatigue Alert
                            </h3>
                            <p className="text-xs text-neutral-400 leading-relaxed">
                                4 students have reported fatigue scores above 8/10 this week. AI suggests deloading their volume.
                            </p>
                            <Button variant="ghost" className="w-full text-xs text-brand-400 hover:text-brand-300 hover:bg-white/5 border border-white/5 font-bold uppercase tracking-wider">
                                View Affected Students
                            </Button>
                        </Card>

                        <Card className="glass-card border-white/5 bg-black/40 p-6 space-y-4">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Activity className="h-4 w-4 text-emerald-500" /> Adherence Trending
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-neutral-500 uppercase">Avg. Adherence</p>
                                        <p className="text-2xl font-black text-white">84%</p>
                                    </div>
                                    <div className="text-emerald-500 text-xs font-bold flex items-center gap-1">
                                        <ArrowUpRight className="h-4 w-4" /> +12%
                                    </div>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 w-[84%]" />
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

function StudentRow({ student, protocols, index }: { student: Student; protocols: Protocol[]; index: number }) {
    const isHighFatigue = (student.status?.fatigueScore || 0) > 7;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * index }}
            className="group glass-panel p-4 rounded-2xl flex items-center justify-between border border-white/5 hover:border-brand-500/30 transition-all cursor-pointer"
        >
            <div className="flex items-center gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center text-lg font-bold border border-white/10 text-white">
                        {student.profile.displayName[0]}
                    </div>
                    {student.status?.currentStreak && (
                        <div className="absolute -top-1 -right-1 bg-brand-500 text-[8px] font-black px-1.5 py-0.5 rounded-full text-white ring-2 ring-black">
                            {student.status.currentStreak}
                        </div>
                    )}
                </div>
                <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-brand-400 transition-colors">
                        {student.profile.displayName}
                    </h3>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                        {student.profile.lifestyleType.replace('_', ' ')}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-8">
                {/* Fatigue Status */}
                <div className="text-center w-20">
                    <p className="text-[10px] text-neutral-500 uppercase mb-1">Fatigue</p>
                    <div className={cn(
                        "text-xs font-black px-2 py-0.5 rounded-lg border",
                        isHighFatigue
                            ? "bg-red-500/10 border-red-500/30 text-red-400"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    )}>
                        {student.status?.fatigueScore || '?'}/10
                    </div>
                </div>

                {/* Adherence */}
                <div className="text-center w-24">
                    <p className="text-[10px] text-neutral-500 uppercase mb-1">Adherence</p>
                    <p className="text-sm font-bold text-white">
                        {Math.round((student.status?.adherenceRate || 0) * 100)}%
                    </p>
                </div>

                {/* Protocol Selector */}
                <div className="hidden md:block">
                    <select
                        defaultValue={student.currentProtocolId || ''}
                        onChange={async (e) => {
                            await assignProtocol(student.userId, e.target.value || null);
                            alert(`Protocol updated for ${student.profile.displayName}`);
                        }}
                        className="bg-black/40 border border-white/10 rounded-lg text-[10px] font-bold text-neutral-400 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                    >
                        <option value="">No Active Training</option>
                        {protocols.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>

                <div className="p-2 text-neutral-600 group-hover:text-brand-400 transition-colors">
                    <ChevronRight className="h-4 w-4" />
                </div>
            </div>
        </motion.div>
    );
}
