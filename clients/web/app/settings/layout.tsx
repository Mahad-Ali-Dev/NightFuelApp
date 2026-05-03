'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Settings, Shield, Bell, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const sidebarItems = [
    { name: 'Profile', href: '/settings/profile', icon: User },
    { name: 'Preferences', href: '/settings/preferences', icon: Settings },
    { name: 'Notifications', href: '/settings/notifications', icon: Bell },
    { name: 'Subscription', href: '/settings/subscription', icon: CreditCard },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8 relative z-10">
            {/* Background elements */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-[50%] h-[50%] bg-brand-500/5 rounded-full blur-[150px]" />
                <div className="absolute bottom-0 right-0 w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-[150px]" />
            </div>

            <div className="mx-auto max-w-6xl relative z-10">
                <div className="flex flex-col md:flex-row gap-8">
                    {/* Sidebar */}
                    <aside className="w-full md:w-64 space-y-2">
                        <div className="glass-panel p-4 rounded-2xl mb-6">
                            <h2 className="text-xl font-bold text-white mb-4 px-2">Settings</h2>
                            <nav className="space-y-1">
                                {sidebarItems.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group",
                                                isActive
                                                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20"
                                                    : "text-neutral-400 hover:text-white hover:bg-white/5"
                                            )}
                                        >
                                            <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "group-hover:text-brand-400")} />
                                            <span className="font-medium">{item.name}</span>
                                            {isActive && (
                                                <motion.div
                                                    layoutId="active-pill"
                                                    className="absolute left-0 w-1 h-6 bg-white rounded-r-full"
                                                />
                                            )}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>
                    </aside>

                    {/* Content */}
                    <main className="flex-1">
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4 }}
                        >
                            {children}
                        </motion.div>
                    </main>
                </div>
            </div>
        </div>
    );
}
