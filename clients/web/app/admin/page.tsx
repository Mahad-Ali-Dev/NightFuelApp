'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    Users, Flag, ShieldOff, CheckCircle, XCircle, AlertTriangle,
    Search, RefreshCw, Ban, Trash2, Eye, ChevronDown, ChevronUp,
    TrendingUp, Activity, Bell, MessageSquare, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { userApi } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformStats {
    totalUsers: number;
    activeToday: number;
    pendingReports: number;
    bannedUsers: number;
    newUsersThisWeek: number;
    premiumUsers: number;
}

interface UserRow {
    id: string;
    userId: string;
    displayName: string;
    role: string;
    status: 'ACTIVE' | 'BANNED' | 'SUSPENDED';
    tier: string;
    createdAt: string;
    lastActiveAt: string | null;
}

interface ReportRow {
    id: string;
    reportedBy: string;
    targetType: 'POST' | 'COMMENT' | 'USER' | 'MESSAGE';
    targetId: string;
    reason: string;
    status: 'PENDING' | 'REVIEWED' | 'DISMISSED' | 'ACTION_TAKEN';
    createdAt: string;
    preview?: string;
}

// ─── Reports mock data (no backend yet) ──────────────────────────────────────

const MOCK_REPORTS: ReportRow[] = [
    { id: 'r1', reportedBy: 'carol@example.com', targetType: 'POST', targetId: 'p123', reason: 'Spam / Advertising', status: 'PENDING', createdAt: '2026-02-25', preview: 'Check out my amazing diet pill...' },
    { id: 'r2', reportedBy: 'alice@example.com', targetType: 'USER', targetId: 'u3', reason: 'Inappropriate content', status: 'PENDING', createdAt: '2026-02-24', preview: undefined },
    { id: 'r3', reportedBy: 'dave@example.com', targetType: 'COMMENT', targetId: 'c77', reason: 'Harassment', status: 'REVIEWED', createdAt: '2026-02-20', preview: 'You\'re so stupid...' },
    { id: 'r4', reportedBy: 'bob@nightshift.io', targetType: 'MESSAGE', targetId: 'm44', reason: 'Scam link', status: 'ACTION_TAKEN', createdAt: '2026-02-18', preview: 'Click here to get free premium...' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: number | string; sub?: string; color: string }) {
    return (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex items-start gap-4">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
                <Icon size={18} className="text-white" />
            </div>
            <div>
                <p className="text-neutral-500 text-xs font-medium uppercase tracking-wider">{label}</p>
                <p className="text-white text-2xl font-bold mt-0.5">{typeof value === 'number' ? value.toLocaleString() : value}</p>
                {sub && <p className="text-neutral-600 text-xs mt-1">{sub}</p>}
            </div>
        </div>
    );
}

const statusBadge: Record<string, string> = {
    ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/20',
    BANNED: 'bg-red-500/20 text-red-400 border-red-500/20',
    SUSPENDED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20',
    PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20',
    REVIEWED: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
    ACTION_TAKEN: 'bg-red-500/20 text-red-400 border-red-500/20',
    DISMISSED: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/20',
};

const tierBadge: Record<string, string> = {
    FREE: 'text-neutral-400',
    PRO: 'text-blue-400',
    PREMIUM: 'text-brand-400',
};

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'users' | 'reports' | 'notifications';

export default function AdminDashboardPage() {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<Tab>('users');
    const [userSearch, setUserSearch] = useState('');
    const [reportFilter, setReportFilter] = useState<'ALL' | 'PENDING' | 'REVIEWED' | 'ACTION_TAKEN' | 'DISMISSED'>('PENDING');
    const [reports, setReports] = useState<ReportRow[]>(MOCK_REPORTS);
    const [expandedReport, setExpandedReport] = useState<string | null>(null);
    const [notifTitle, setNotifTitle] = useState('');
    const [notifBody, setNotifBody] = useState('');
    const [notifTarget, setNotifTarget] = useState<'ALL' | 'FREE' | 'PRO' | 'PREMIUM'>('ALL');
    const [notifSent, setNotifSent] = useState(false);

    // ── Real API queries ─────────────────────────────────────────────────────
    const {
        data: statsData,
        isLoading: statsLoading,
        isError: statsError,
    } = useQuery<PlatformStats>({
        queryKey: ['admin', 'stats'],
        queryFn: async () => {
            const res = await userApi.get('/admin/stats');
            return res.data;
        },
    });

    const {
        data: usersData,
        isLoading: usersLoading,
        isError: usersError,
    } = useQuery<UserRow[]>({
        queryKey: ['admin', 'users'],
        queryFn: async () => {
            const res = await userApi.get('/admin/users?limit=50');
            return res.data;
        },
    });

    const banMutation = useMutation({
        mutationFn: async (userId: string) => {
            const res = await userApi.post(`/admin/users/${userId}/ban`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });

    const stats: PlatformStats = statsData ?? {
        totalUsers: 0,
        activeToday: 0,
        pendingReports: reports.filter((r) => r.status === 'PENDING').length,
        bannedUsers: 0,
        newUsersThisWeek: 0,
        premiumUsers: 0,
    };

    const users: UserRow[] = usersData ?? [];

    const filteredUsers = users.filter(
        (u) =>
            u.displayName.toLowerCase().includes(userSearch.toLowerCase()),
    );

    const filteredReports =
        reportFilter === 'ALL' ? reports : reports.filter((r) => r.status === reportFilter);

    const handleBanUser = useCallback((userId: string) => {
        banMutation.mutate(userId);
    }, [banMutation]);

    const handleRefresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['admin'] });
    }, [queryClient]);

    const handleReportAction = useCallback((reportId: string, action: 'REVIEWED' | 'DISMISSED' | 'ACTION_TAKEN') => {
        setReports((prev) =>
            prev.map((r) => (r.id === reportId ? { ...r, status: action } : r)),
        );
    }, []);

    const handleSendNotification = () => {
        if (!notifTitle.trim() || !notifBody.trim()) return;
        // In production: POST /v1/admin/notifications/broadcast
        setNotifSent(true);
        setTimeout(() => {
            setNotifTitle('');
            setNotifBody('');
            setNotifSent(false);
        }, 3000);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                    <p className="text-neutral-500 text-sm mt-1">Platform overview and moderation tools</p>
                </div>
                <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:bg-white/10 transition-all text-sm"
                >
                    <RefreshCw size={14} className={statsLoading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Stats Grid */}
            {statsLoading ? (
                <div className="flex items-center justify-center py-12 text-neutral-500 gap-2">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-sm">Loading stats...</span>
                </div>
            ) : statsError ? (
                <div className="flex items-center justify-center py-12 text-red-400 gap-2">
                    <AlertTriangle size={18} />
                    <span className="text-sm">Failed to load stats. Check your connection or admin permissions.</span>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                    <StatCard icon={Users} label="Total Users" value={stats.totalUsers} color="bg-brand-500" />
                    <StatCard icon={Activity} label="Active Today" value={stats.activeToday} color="bg-green-600" />
                    <StatCard icon={AlertTriangle} label="Pending Reports" value={stats.pendingReports} sub="Require review" color="bg-yellow-600" />
                    <StatCard icon={ShieldOff} label="Banned" value={stats.bannedUsers} color="bg-red-600" />
                    <StatCard icon={TrendingUp} label="New This Week" value={stats.newUsersThisWeek} color="bg-blue-600" />
                    <StatCard icon={Users} label="Premium" value={stats.premiumUsers} sub={stats.totalUsers > 0 ? `${((stats.premiumUsers / stats.totalUsers) * 100).toFixed(1)}%` : '0%'} color="bg-purple-600" />
                </div>
            )}

            {/* Tab Strip */}
            <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 w-fit">
                {(['users', 'reports', 'notifications'] as Tab[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            'px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all',
                            tab === t ? 'bg-brand-500 text-background shadow' : 'text-neutral-500 hover:text-white',
                        )}
                    >
                        {t}
                        {t === 'reports' && stats.pendingReports > 0 && (
                            <span className="ml-2 bg-yellow-500/20 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded-full border border-yellow-500/20">
                                {stats.pendingReports}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Users Tab ───────────────────────────────────────────────── */}
            {tab === 'users' && (
                <motion.div
                    key="users"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <input
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                placeholder="Search by name..."
                                className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-brand-500 transition-colors"
                            />
                        </div>
                    </div>

                    {usersLoading ? (
                        <div className="flex items-center justify-center py-16 text-neutral-500 gap-2">
                            <Loader2 size={18} className="animate-spin" />
                            <span className="text-sm">Loading users...</span>
                        </div>
                    ) : usersError ? (
                        <div className="flex items-center justify-center py-16 text-red-400 gap-2">
                            <AlertTriangle size={18} />
                            <span className="text-sm">Failed to load users. Check your connection or admin permissions.</span>
                        </div>
                    ) : (
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/[0.06]">
                                        {['User', 'Tier', 'Status', 'Joined', 'Last Active', 'Actions'].map((h) => (
                                            <th key={h} className="text-left px-5 py-3.5 text-neutral-500 font-medium text-xs uppercase tracking-wider">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.04]">
                                    {filteredUsers.map((u) => (
                                        <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-5 py-4">
                                                <div>
                                                    <p className="text-white font-medium">{u.displayName}</p>
                                                    <p className="text-neutral-600 text-xs font-mono">{u.userId.slice(0, 8)}...</p>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={cn('font-medium', tierBadge[u.tier] ?? 'text-neutral-400')}>{u.tier}</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border', statusBadge[u.status] ?? statusBadge['ACTIVE']!)}>
                                                    {u.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-neutral-500 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                                            <td className="px-5 py-4 text-neutral-500 text-xs">{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : '\u2014'}</td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleBanUser(u.userId)}
                                                        disabled={banMutation.isPending}
                                                        title={u.status === 'BANNED' ? 'Unban user' : 'Ban user'}
                                                        className={cn(
                                                            'p-1.5 rounded-lg transition-all',
                                                            u.status === 'BANNED'
                                                                ? 'text-green-400 hover:bg-green-500/10'
                                                                : 'text-red-400 hover:bg-red-500/10',
                                                        )}
                                                    >
                                                        {u.status === 'BANNED' ? <CheckCircle size={14} /> : <Ban size={14} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredUsers.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-5 py-10 text-center text-neutral-600">
                                                No users found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            )}

            {/* ── Reports Tab ─────────────────────────────────────────────── */}
            {tab === 'reports' && (
                <motion.div
                    key="reports"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                >
                    {/* Filter Pills */}
                    <div className="flex flex-wrap gap-2">
                        {(['ALL', 'PENDING', 'REVIEWED', 'ACTION_TAKEN', 'DISMISSED'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setReportFilter(f)}
                                className={cn(
                                    'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                                    reportFilter === f
                                        ? statusBadge[f === 'ALL' ? 'ACTIVE' : f]
                                        : 'bg-white/5 border-white/10 text-neutral-500 hover:text-white',
                                )}
                            >
                                {f.replace('_', ' ')}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-3">
                        {filteredReports.map((r) => (
                            <div
                                key={r.id}
                                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden"
                            >
                                <div
                                    className="flex items-center justify-between p-5 cursor-pointer"
                                    onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                                >
                                    <div className="flex items-start gap-4 min-w-0">
                                        <div className="w-9 h-9 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                                            <Flag size={15} className="text-yellow-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold border', statusBadge[r.status])}>
                                                    {r.status.replace('_', ' ')}
                                                </span>
                                                <span className="text-xs text-neutral-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                                                    {r.targetType}
                                                </span>
                                            </div>
                                            <p className="text-white font-medium mt-1.5 text-sm">{r.reason}</p>
                                            <p className="text-neutral-600 text-xs mt-0.5">
                                                Reported by {r.reportedBy} · {r.createdAt}
                                            </p>
                                        </div>
                                    </div>
                                    <button className="text-neutral-500 hover:text-white transition-colors ml-4 shrink-0">
                                        {expandedReport === r.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                </div>

                                {expandedReport === r.id && (
                                    <div className="border-t border-white/[0.06] px-5 py-4 space-y-4">
                                        {r.preview && (
                                            <div className="bg-black/30 border border-white/[0.06] rounded-xl p-4 text-sm text-neutral-400 italic">
                                                "{r.preview}"
                                            </div>
                                        )}
                                        <p className="text-xs text-neutral-500">
                                            Target ID: <code className="text-neutral-300">{r.targetId}</code>
                                        </p>
                                        {r.status === 'PENDING' && (
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => handleReportAction(r.id, 'REVIEWED')}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all text-sm font-medium"
                                                >
                                                    <Eye size={14} />
                                                    Mark Reviewed
                                                </button>
                                                <button
                                                    onClick={() => handleReportAction(r.id, 'ACTION_TAKEN')}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm font-medium"
                                                >
                                                    <Trash2 size={14} />
                                                    Take Action
                                                </button>
                                                <button
                                                    onClick={() => handleReportAction(r.id, 'DISMISSED')}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-500/20 border border-neutral-500/20 text-neutral-400 hover:bg-neutral-500/30 transition-all text-sm font-medium"
                                                >
                                                    <XCircle size={14} />
                                                    Dismiss
                                                </button>
                                            </div>
                                        )}
                                        {r.status !== 'PENDING' && (
                                            <p className="text-xs text-neutral-600">This report has been {r.status.toLowerCase().replace('_', ' ')}.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {filteredReports.length === 0 && (
                            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-10 text-center text-neutral-600">
                                No reports matching the selected filter.
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ── Broadcast Notification Tab ───────────────────────────────── */}
            {tab === 'notifications' && (
                <motion.div
                    key="notifications"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-2xl space-y-6"
                >
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-brand-500/20 rounded-xl flex items-center justify-center">
                                <Bell size={16} className="text-brand-400" />
                            </div>
                            <div>
                                <h2 className="text-white font-semibold">Broadcast Notification</h2>
                                <p className="text-neutral-500 text-xs">Send a push + in-app notification to all or a segment of users</p>
                            </div>
                        </div>

                        {/* Target Segment */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                                Target Segment
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {(['ALL', 'FREE', 'PRO', 'PREMIUM'] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setNotifTarget(t)}
                                        className={cn(
                                            'px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                                            notifTarget === t
                                                ? 'bg-brand-500/20 border-brand-500/30 text-brand-400'
                                                : 'bg-white/5 border-white/10 text-neutral-500 hover:text-white',
                                        )}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Title */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                                Title
                            </label>
                            <input
                                value={notifTitle}
                                onChange={(e) => setNotifTitle(e.target.value)}
                                placeholder="e.g. New feature available!"
                                maxLength={80}
                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-brand-500 transition-colors"
                            />
                        </div>

                        {/* Body */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                                Message
                            </label>
                            <textarea
                                value={notifBody}
                                onChange={(e) => setNotifBody(e.target.value)}
                                placeholder="Notification body text…"
                                rows={4}
                                maxLength={300}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-brand-500 transition-colors resize-none"
                            />
                            <p className="text-right text-neutral-600 text-xs mt-1">{notifBody.length}/300</p>
                        </div>

                        {/* Send button */}
                        <button
                            onClick={handleSendNotification}
                            disabled={!notifTitle.trim() || !notifBody.trim() || notifSent}
                            className={cn(
                                'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all',
                                notifSent
                                    ? 'bg-green-500/20 border border-green-500/20 text-green-400 cursor-default'
                                    : notifTitle.trim() && notifBody.trim()
                                        ? 'bg-brand-500 hover:bg-brand-600 text-background shadow-lg shadow-brand-500/25'
                                        : 'bg-white/5 border border-white/10 text-neutral-600 cursor-not-allowed',
                            )}
                        >
                            {notifSent ? (
                                <>
                                    <CheckCircle size={16} />
                                    Notification Sent!
                                </>
                            ) : (
                                <>
                                    <MessageSquare size={16} />
                                    Send to {notifTarget === 'ALL' ? 'All Users' : `${notifTarget} Tier`}
                                </>
                            )}
                        </button>
                    </div>

                    <p className="text-neutral-600 text-xs">
                        Broadcasts trigger both in-app notifications (via notification-service) and push notifications (web + Expo) to all devices registered by matching users.
                    </p>
                </motion.div>
            )}
        </div>
    );
}
