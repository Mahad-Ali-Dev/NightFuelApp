'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { useState } from 'react';
import {
    LayoutDashboard, Dumbbell, UtensilsCrossed, Moon,
    TrendingUp, ClipboardList, Settings, Zap,
    Users, ChevronLeft, ChevronRight, LogOut,
    Menu, X, BookOpen, Calculator, History,
    Apple, Calendar, Timer, Camera, MessageSquare,
    MessageCircle, Trophy, Globe
} from 'lucide-react';

const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    {
        href: '/dashboard/training', icon: Timer, label: 'Training', children: [
            { href: '/dashboard/training/workout', icon: Dumbbell, label: 'Active Workout' },
        ]
    },
    {
        href: '/dashboard/exercises', icon: Dumbbell, label: 'Exercises', children: [
            { href: '/dashboard/exercises/muscles', icon: Dumbbell, label: 'Muscle Groups' },
            { href: '/dashboard/exercises/routines', icon: BookOpen, label: 'Routines' },
            { href: '/dashboard/exercises/report', icon: TrendingUp, label: 'Report' },
            { href: '/dashboard/exercises/analytics', icon: TrendingUp, label: 'Analytics' },
            { href: '/dashboard/exercises/calculator', icon: Calculator, label: '1RM Calculator' },
            { href: '/dashboard/exercises/history', icon: History, label: 'History' },
        ]
    },
    {
        href: '/dashboard/meals', icon: UtensilsCrossed, label: 'Nutrition', children: [
            { href: '/dashboard/meals/encyclopedia', icon: Apple, label: 'Food Library' },
            { href: '/dashboard/meals/recipes', icon: BookOpen, label: 'Recipes' },
            { href: '/dashboard/meals/planner', icon: Calendar, label: 'Meal Planner' },
        ]
    },
    { href: '/dashboard/sleep', icon: Moon, label: 'Sleep' },
    {
        href: '/dashboard/performance', icon: TrendingUp, label: 'Progress', children: [
            { href: '/dashboard/performance/measurements', icon: Calculator, label: 'Measurements' },
            { href: '/dashboard/performance/reports', icon: BookOpen, label: 'AI Reports' },
            { href: '/dashboard/performance/photos', icon: Camera, label: 'Photos' },
        ]
    },
    {
        href: '/dashboard/community', icon: Globe, label: 'Community', children: [
            { href: '/dashboard/community/challenges', icon: Trophy, label: 'Challenges' },
        ]
    },
    {
        href: '/dashboard/coaches', icon: Users, label: 'Coaches', children: [
            { href: '/dashboard/coaches/chat', icon: MessageCircle, label: 'Coach Chat' },
        ]
    },
    { href: '/dashboard/messages', icon: MessageSquare, label: 'Messages' },
    { href: '/dashboard/profile', icon: Users, label: 'Profile' },
    { href: '/dashboard/plan', icon: ClipboardList, label: 'Plan' },
];

const mobileNavItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home', exact: true },
    { href: '/dashboard/training', icon: Timer, label: 'Training' },
    { href: '/dashboard/exercises', icon: Dumbbell, label: 'Exercises' },
    { href: '/dashboard/community', icon: Globe, label: 'Feed' },
    { href: '/dashboard/plan', icon: ClipboardList, label: 'Plan' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isActive = (href: string, exact?: boolean) => {
        if (exact) return pathname === href;
        return pathname.startsWith(href) && href !== '/dashboard';
    };

    return (
        <div className="flex min-h-screen bg-background">
            {/* ──────────────────── DESKTOP SIDEBAR ──────────────────────── */}
            <aside
                className={cn(
                    'hidden md:flex flex-col h-screen sticky top-0 transition-all duration-300 z-30 shrink-0',
                    collapsed ? 'w-[68px]' : 'w-60'
                )}
            >
                <div className="h-full bg-black/60 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col">
                    {/* Logo */}
                    <div className={cn(
                        'flex items-center border-b border-white/[0.06] h-16 shrink-0',
                        collapsed ? 'justify-center px-0' : 'gap-3 px-5'
                    )}>
                        <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/30">
                            <Zap size={15} className="text-white" />
                        </div>
                        <AnimatePresence>
                            {!collapsed && (
                                <motion.span
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: 'auto' }}
                                    exit={{ opacity: 0, width: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="font-black text-white text-lg tracking-tight overflow-hidden whitespace-nowrap"
                                >
                                    NightFuel
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                        {navItems.map((item) => {
                            const active = isActive(item.href, item.exact);
                            return (
                                <div key={item.href} className="flex flex-col">
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            'flex items-center rounded-xl transition-all duration-200 group relative overflow-hidden',
                                            collapsed ? 'justify-center h-11 w-11 mx-auto' : 'gap-3 px-3 py-2.5',
                                            active
                                                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                                                : 'text-neutral-500 hover:text-white hover:bg-white/[0.06]'
                                        )}
                                        title={collapsed ? item.label : undefined}
                                    >
                                        <item.icon
                                            size={18}
                                            className={cn(
                                                'shrink-0 transition-colors',
                                                active ? 'text-white' : 'group-hover:text-brand-400'
                                            )}
                                        />
                                        <AnimatePresence>
                                            {!collapsed && (
                                                <motion.span
                                                    initial={{ opacity: 0, x: -8 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -8 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="text-sm font-medium whitespace-nowrap"
                                                >
                                                    {item.label}
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </Link>

                                    {!collapsed && 'children' in item && item.children && active && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="ml-5 mt-1 pl-4 border-l border-white/[0.06] space-y-1 flex flex-col overflow-hidden"
                                        >
                                            {item.children.map((child: any) => {
                                                const childActive = pathname === child.href;
                                                return (
                                                    <Link
                                                        key={child.href}
                                                        href={child.href}
                                                        className={cn(
                                                            'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all',
                                                            childActive
                                                                ? 'text-white bg-white/[0.06]'
                                                                : 'text-neutral-500 hover:text-white hover:bg-white/[0.03]'
                                                        )}
                                                    >
                                                        <child.icon size={12} className={childActive ? 'text-brand-400' : ''} />
                                                        {child.label}
                                                    </Link>
                                                )
                                            })}
                                        </motion.div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Coach Hub (role-gated) */}
                        {['COACH', 'TRAINER', 'NUTRITIONIST'].includes(user?.role || '') && (
                            <Link
                                href="/coach/dashboard"
                                className={cn(
                                    'flex items-center rounded-xl transition-all group',
                                    collapsed ? 'justify-center h-11 w-11 mx-auto' : 'gap-3 px-3 py-2.5',
                                    pathname.startsWith('/coach')
                                        ? 'bg-brand-500 text-white'
                                        : 'text-neutral-500 hover:text-white hover:bg-white/[0.06]'
                                )}
                                title={collapsed ? 'Coach Hub' : undefined}
                            >
                                <Users size={18} className="shrink-0" />
                                {!collapsed && <span className="text-sm font-medium">Coach Hub</span>}
                            </Link>
                        )}
                    </nav>

                    {/* Bottom Actions */}
                    <div className={cn(
                        'p-3 border-t border-white/[0.06] space-y-1',
                        collapsed && 'flex flex-col items-center'
                    )}>
                        <Link
                            href="/settings/profile"
                            className={cn(
                                'flex items-center rounded-xl transition-all group',
                                collapsed ? 'justify-center h-11 w-11' : 'gap-3 px-3 py-2.5',
                                pathname.startsWith('/settings')
                                    ? 'bg-white/10 text-white'
                                    : 'text-neutral-500 hover:text-white hover:bg-white/[0.06]'
                            )}
                            title={collapsed ? 'Settings' : undefined}
                        >
                            <Settings size={18} className="shrink-0 group-hover:text-brand-400 transition-colors" />
                            {!collapsed && <span className="text-sm font-medium">Settings</span>}
                        </Link>

                        <button
                            onClick={() => logout()}
                            className={cn(
                                'w-full flex items-center rounded-xl text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all',
                                collapsed ? 'justify-center h-11 w-11' : 'gap-3 px-3 py-2.5'
                            )}
                            title={collapsed ? 'Logout' : undefined}
                        >
                            <LogOut size={18} className="shrink-0" />
                            {!collapsed && <span className="text-sm font-medium">Logout</span>}
                        </button>

                        {/* Collapse Toggle */}
                        <button
                            onClick={() => setCollapsed(!collapsed)}
                            className={cn(
                                'w-full flex items-center rounded-xl text-neutral-600 hover:text-neutral-300 hover:bg-white/5 transition-all',
                                collapsed ? 'justify-center h-11 w-11' : 'gap-3 px-3 py-2'
                            )}
                        >
                            {collapsed ? <ChevronRight size={16} /> : (
                                <>
                                    <ChevronLeft size={16} />
                                    <span className="text-xs font-medium">Collapse</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </aside>

            {/* ──────────────────── MAIN CONTENT ─────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="md:hidden sticky top-0 z-40 h-14 bg-black/80 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
                            <Zap size={13} className="text-white" />
                        </div>
                        <span className="font-black text-white text-base">NightFuel</span>
                    </div>
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </header>

                {/* Mobile Drawer Menu */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="md:hidden fixed inset-0 bg-black/70 z-40"
                                onClick={() => setMobileMenuOpen(false)}
                            />
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="md:hidden fixed top-14 right-0 bottom-0 w-64 bg-black/90 backdrop-blur-2xl border-l border-white/[0.06] z-50 p-4 flex flex-col"
                            >
                                <nav className="flex-1 space-y-1">
                                    {navItems.map((item) => {
                                        const active = isActive(item.href, item.exact);
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setMobileMenuOpen(false)}
                                                className={cn(
                                                    'flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-sm font-medium',
                                                    active
                                                        ? 'bg-brand-500 text-white'
                                                        : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
                                                )}
                                            >
                                                <item.icon size={18} />
                                                {item.label}
                                            </Link>
                                        );
                                    })}
                                </nav>
                                <div className="space-y-1 border-t border-white/[0.06] pt-3">
                                    <Link
                                        href="/settings/profile"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center gap-3 px-3 py-3 rounded-xl text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all text-sm font-medium"
                                    >
                                        <Settings size={18} />
                                        Settings
                                    </Link>
                                    <button
                                        onClick={() => { logout(); setMobileMenuOpen(false); }}
                                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all text-sm font-medium"
                                    >
                                        <LogOut size={18} />
                                        Logout
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Page Content */}
                <main className="flex-1 pb-20 md:pb-0">
                    {children}
                </main>
            </div>

            {/* ──────────────────── MOBILE BOTTOM NAV ────────────────────── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-black/85 backdrop-blur-2xl border-t border-white/[0.06] safe-area-pb">
                <div className="flex items-center justify-around px-2 py-1">
                    {mobileNavItems.map((item) => {
                        const active = isActive(item.href, item.exact);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'relative flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl min-w-[52px] transition-all',
                                    active ? 'text-brand-500' : 'text-neutral-600 hover:text-neutral-400'
                                )}
                            >
                                <item.icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                                <span className={cn(
                                    'text-[9px] font-semibold uppercase tracking-wider transition-all',
                                    active ? 'opacity-100' : 'opacity-60'
                                )}>
                                    {item.label}
                                </span>
                                {active && (
                                    <motion.div
                                        layoutId="bottom-nav-indicator"
                                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-brand-500 rounded-full"
                                    />
                                )}
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
