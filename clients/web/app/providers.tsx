'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { SocketProvider } from '@/lib/socket';
import { Toaster } from 'sonner';
import AuthBootstrap from '@/components/auth/AuthBootstrap';

export default function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000,
                        retry: 1,
                        refetchOnWindowFocus: false,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            <SocketProvider>
                <AuthBootstrap />
                {children}
                <Toaster position="top-right" theme="dark" richColors />
            </SocketProvider>
        </QueryClientProvider>
    );
}
