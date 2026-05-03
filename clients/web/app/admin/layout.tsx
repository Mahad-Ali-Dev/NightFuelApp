'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard, Users, MessageSquare, Flag, ShieldAlert,
    Settings, Zap, LogOut, BarChart2,
} from 'lucide-react';
import { usePathname } from 'next/navigation';

const adminNav = [
    { href: '/admin', icon: LayoutDashboard, label: 'Overview', exact: true },
    { href: '/admin/users', icon: Users, label: 'Users' },
    { href: '/admin/content', icon: Flag, label: 'Moderation' },
    { href: '/admin/reports', icon: BarChart2, label: 'Reports' },
    { href: '/admin/notifications', icon: MessageSquare, label: 'Notifications' },
    { href: '/admin/settings', icon: Settings, label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoading, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && (!user || user.role !== 'ADMIN')) {
            router.replace('/dashboard');
        }
    }, [user, isLoading, router]);

    if (isLoading || !user || user.role !== 'ADMIN') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar */}
            <aside className="hidden md:flex w-56 flex-col h-screen sticky top-0 shrink-0">
                <div className="h-full bg-black/60 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col">
                    {/* Logo */}
                    <div className="flex items-center gap-3 px-5 h-16 border-b border-white/[0.06]">
                        <div className="w-8 h-8 bg-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/30">
                            <ShieldAlert size={15} className="text-white" />
                        </div>
                        <span className="font-black text-white text-base tracking-tight">
                            Admin Panel
                        </span>
                    </div>

                    {/* Nav */}
                    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                        {adminNav.map((item) => {
                            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                                        active
                                            ? 'bg-red-500/20 text-red-400 border border-red-500/20'
                                            : 'text-neutral-500 hover:text-white hover:bg-white/[0.06]',
                                    )}
                                >
                                    <item.icon size={16} className="shrink-0" />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Bottom */}
                    <div className="p-3 border-t border-white/[0.06] space-y-1">
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-all text-sm font-medium"
                        >
                            <Zap size={16} />
                            Back to App
                        </Link>
                        <button
                            onClick={() => logout()}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all text-sm font-medium"
                        >
                            <LogOut size={16} />
                            Logout
                        </button>
                    </div>
                </div>
            </aside>

            {/* Content */}
            <main className="flex-1 min-w-0 p-6 overflow-auto">{children}</main>
        </div>
    );
}
