'use client';

import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStudents, getProtocols, createProtocol, assignProtocol, deleteProtocol } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, BookOpen, Plus, Trash2, CheckCircle2, UserPlus, Settings, Activity, Zap, Shield, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function SpecialistDashboard() {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'students' | 'protocols'>('students');
    const [isCreatingProtocol, setIsCreatingProtocol] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [isAssigningProtocol, setIsAssigningProtocol] = useState(false);

    // Protocol Form State
    const [protocolForm, setProtocolForm] = useState({
        name: '',
        description: '',
        parameters: {
            calories: 2500,
            protein_g: 180,
            volume_modifier: 1.0,
            deload: false,
            training_split: 'PUSH_PULL_LEGS'
        }
    });

    // Queries
    const { data: students, isLoading: studentsLoading } = useQuery({
        queryKey: ['students'],
        queryFn: async () => {
            const res = await getStudents();
            return res.data;
        },
        enabled: isAuthenticated,
    });

    const { data: protocols, isLoading: protocolsLoading } = useQuery({
        queryKey: ['protocols'],
        queryFn: async () => {
            const res = await getProtocols();
            return res.data;
        },
        enabled: isAuthenticated,
    });

    // Mutations
    const createProtocolMutation = useMutation({
        mutationFn: createProtocol,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
            setIsCreatingProtocol(false);
            setProtocolForm({
                name: '',
                description: '',
                parameters: {
                    calories: 2500,
                    protein_g: 180,
                    volume_modifier: 1.0,
                    deload: false,
                    training_split: 'PUSH_PULL_LEGS'
                }
            });
        }
    });

    const deleteProtocolMutation = useMutation({
        mutationFn: deleteProtocol,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['protocols'] })
    });

    const assignProtocolMutation = useMutation({
        mutationFn: ({ studentId, protocolId }: { studentId: string, protocolId: string | null }) =>
            assignProtocol(studentId, protocolId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['students'] });
            setIsAssigningProtocol(false);
            setSelectedStudent(null);
        }
    });

    const handleCreateProtocol = (e: React.FormEvent) => {
        e.preventDefault();
        createProtocolMutation.mutate(protocolForm);
    };

    if (!isAuthenticated) return null;

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8 relative z-10">
            {/* Background elements */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-brand-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto max-w-6xl space-y-8 relative z-10"
            >
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass-panel p-8 rounded-3xl border-white/5">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-brand-500/20 rounded-lg">
                                <Shield className="h-6 w-6 text-brand-500" />
                            </div>
                            <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">
                                Specialist <span className="text-brand-500">Hub</span>
                            </h1>
                        </div>
                        <p className="text-neutral-400 font-medium tracking-wide ml-12">
                            Advanced client management & protocol orchestration
                        </p>
                    </div>

                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 self-start md:self-center">
                        <button
                            onClick={() => setActiveTab('students')}
                            className={cn(
                                "px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 uppercase tracking-widest",
                                activeTab === 'students' ? "bg-brand-500 text-white shadow-lg" : "text-neutral-400 hover:text-white"
                            )}
                        >
                            <Users className="h-4 w-4" /> Students
                        </button>
                        <button
                            onClick={() => setActiveTab('protocols')}
                            className={cn(
                                "px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 uppercase tracking-widest",
                                activeTab === 'protocols' ? "bg-brand-500 text-white shadow-lg" : "text-neutral-400 hover:text-white"
                            )}
                        >
                            <BookOpen className="h-4 w-4" /> Protocols
                        </button>
                    </div>
                </header>

                <main className="min-h-[600px]">
                    <AnimatePresence mode="wait">
                        {activeTab === 'students' ? (
                            <motion.div
                                key="students"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between px-2">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                        Active Students <span className="bg-brand-500/20 text-brand-400 text-xs px-2 py-1 rounded-full">{students?.length || 0}</span>
                                    </h2>
                                    <Button variant="outline" className="border-brand-500/30 text-brand-400 hover:bg-brand-500 hover:text-white">
                                        <UserPlus className="h-4 w-4 mr-2" /> Invite Student
                                    </Button>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {studentsLoading ? (
                                        [1, 2, 3].map(i => <div key={i} className="glass-card h-48 animate-pulse" />)
                                    ) : (
                                        students?.map((relation: any) => (
                                            <Card key={relation.id} className="glass-card border-white/5 hover:border-brand-500/30 transition-all group overflow-hidden">
                                                <div className="h-1.5 w-full bg-brand-500/20 group-hover:bg-brand-500 transition-all" />
                                                <CardContent className="p-6 space-y-4">
                                                    <div className="flex items-start justify-between">
                                                        <div className="space-y-1">
                                                            <p className="text-xs font-bold text-neutral-500 uppercase tracking-tighter">Client ID</p>
                                                            <h3 className="text-xl font-black text-white truncate max-w-[150px]">{relation.clientUserId}</h3>
                                                        </div>
                                                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-brand-500 to-blue-500 flex items-center justify-center text-white font-bold text-xl uppercase">
                                                            {relation.clientUserId[0]}
                                                        </div>
                                                    </div>

                                                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] text-neutral-500 font-bold uppercase">Status</span>
                                                            <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                                                                <CheckCircle2 className="h-3 w-3" /> STABLE
                                                            </span>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => {
                                                                setSelectedStudent(relation);
                                                                setIsAssigningProtocol(true);
                                                            }}
                                                            className="bg-white/5 hover:bg-brand-500 text-white border border-white/10 hover:border-brand-500 text-[10px] font-black tracking-widest uppercase px-4"
                                                        >
                                                            Manage Plan
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="protocols"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between px-2">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                        Protocol Library <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded-full">{protocols?.length || 0}</span>
                                    </h2>
                                    <Button onClick={() => setIsCreatingProtocol(true)} className="bg-brand-500 hover:bg-brand-600 text-white font-bold shadow-lg">
                                        <Plus className="h-4 w-4 mr-2" /> New Protocol
                                    </Button>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    <AnimatePresence>
                                        {isCreatingProtocol && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className="md:col-span-2 lg:col-span-1"
                                            >
                                                <Card className="glass-card border-brand-500 bg-brand-500/5 sparkle-card">
                                                    <CardHeader>
                                                        <CardTitle className="text-white flex items-center gap-2">
                                                            <Sparkles className="h-5 w-5 text-brand-500" /> Draft Protocol
                                                        </CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="space-y-4">
                                                        <div className="space-y-2">
                                                            <Label className="text-[10px] font-black uppercase text-neutral-500">Name</Label>
                                                            <Input
                                                                className="bg-black/40 border-white/10"
                                                                placeholder="e.g. Aggressive Cut Phase 1"
                                                                value={protocolForm.name}
                                                                onChange={e => setProtocolForm({ ...protocolForm, name: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-black uppercase text-neutral-500">Calories</Label>
                                                                <Input
                                                                    type="number" className="bg-black/40 border-white/10"
                                                                    value={protocolForm.parameters.calories}
                                                                    onChange={e => setProtocolForm({ ...protocolForm, parameters: { ...protocolForm.parameters, calories: parseInt(e.target.value) } })}
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-black uppercase text-neutral-500">Protein (g)</Label>
                                                                <Input
                                                                    type="number" className="bg-black/40 border-white/10"
                                                                    value={protocolForm.parameters.protein_g}
                                                                    onChange={e => setProtocolForm({ ...protocolForm, parameters: { ...protocolForm.parameters, protein_g: parseInt(e.target.value) } })}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2 pt-2">
                                                            <Button onClick={handleCreateProtocol} className="flex-1 bg-brand-500 hover:bg-brand-600">Save</Button>
                                                            <Button variant="ghost" onClick={() => setIsCreatingProtocol(false)} className="text-neutral-400">Cancel</Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {protocolsLoading ? (
                                        [1, 2].map(i => <div key={i} className="glass-card h-48 animate-pulse" />)
                                    ) : (
                                        protocols?.map((protocol: any) => (
                                            <Card key={protocol.id} className="glass-card border-white/5 hover:border-blue-500/30 transition-all group relative overflow-hidden">
                                                <CardContent className="p-6 space-y-4">
                                                    <div className="flex justify-between items-start">
                                                        <div className="space-y-1">
                                                            <h3 className="text-xl font-black text-white uppercase italic">{protocol.name}</h3>
                                                            <p className="text-xs text-neutral-500 line-clamp-2">{protocol.description || 'No description provided'}</p>
                                                        </div>
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            className="text-neutral-500 hover:text-red-500 hover:bg-red-500/10"
                                                            onClick={() => deleteProtocolMutation.mutate(protocol.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center">
                                                            <p className="text-[10px] font-bold text-neutral-500 uppercase">Energy</p>
                                                            <p className="text-sm font-black text-white">{protocol.parameters.calories} kcal</p>
                                                        </div>
                                                        <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center">
                                                            <p className="text-[10px] font-bold text-neutral-500 uppercase">Recovery</p>
                                                            <p className="text-sm font-black text-white">{protocol.parameters.protein_g}g Pro</p>
                                                        </div>
                                                    </div>

                                                    <div className="pt-2 flex gap-2">
                                                        <Button variant="outline" className="flex-1 text-[10px] font-black uppercase tracking-widest border-white/10 hover:bg-white/5">
                                                            Edit
                                                        </Button>
                                                        <Button className="flex-1 bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white border border-blue-500/30">
                                                            Use as Base
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </motion.div>

            {/* ── Assign Protocol Modal ── */}
            <AnimatePresence>
                {isAssigningProtocol && selectedStudent && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setIsAssigningProtocol(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl"
                        >
                            <h3 className="text-2xl font-black text-white uppercase italic mb-2">Assign Management Protocol</h3>
                            <p className="text-neutral-400 text-sm mb-6">Select a protocol to override AI logic for <span className="text-white font-bold">{selectedStudent.clientUserId}</span>.</p>

                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 mb-6 custom-scrollbar">
                                <button
                                    onClick={() => assignProtocolMutation.mutate({ studentId: selectedStudent.clientUserId, protocolId: null })}
                                    className="w-full p-4 rounded-xl border border-dashed border-white/10 hover:border-brand-500/50 hover:bg-white/5 transition-all flex items-center justify-between group"
                                >
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-white group-hover:text-brand-400 transition-colors">Standard Adaptive (Default)</p>
                                        <p className="text-xs text-neutral-500">Let the Decision Engine calculate targets automatically.</p>
                                    </div>
                                    <Sparkles className="h-4 w-4 text-neutral-600 group-hover:text-brand-500" />
                                </button>

                                {protocols?.map((p: any) => (
                                    <button
                                        key={p.id}
                                        onClick={() => assignProtocolMutation.mutate({ studentId: selectedStudent.clientUserId, protocolId: p.id })}
                                        className="w-full p-4 rounded-xl border border-white/5 bg-white/5 hover:border-blue-500/50 hover:bg-blue-500/10 transition-all flex items-center justify-between group"
                                    >
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</p>
                                            <p className="text-xs text-neutral-500">{p.parameters.calories} kcal | {p.parameters.protein_g}g Pro</p>
                                        </div>
                                        <Zap className="h-4 w-4 text-neutral-600 group-hover:text-blue-500" />
                                    </button>
                                ))}
                            </div>

                            <Button
                                variant="ghost"
                                onClick={() => setIsAssigningProtocol(false)}
                                className="w-full text-neutral-500 hover:text-white"
                            >
                                Cancel
                            </Button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
