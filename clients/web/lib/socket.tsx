'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const { token, isAuthenticated } = useAuthStore();

    useEffect(() => {
        if (!isAuthenticated || !token) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
                setIsConnected(false);
            }
            return;
        }

        // The socket gateway is hosted on the notification service (port 3008)
        // Proxied via /v1/notifications in development usually, 
        // but Socket.io needs the base URL.
        // We'll use the absolute URL for the notification service in dev.
        const socketInstance = io('http://localhost:3008', {
            auth: {
                token: token,
            },
            transports: ['websocket'],
        });

        socketInstance.on('connect', () => {
            console.log('Real-time socket connected');
            setIsConnected(true);
        });

        socketInstance.on('disconnect', () => {
            console.log('Real-time socket disconnected');
            setIsConnected(false);
        });

        // Global notification listener
        socketInstance.on('notification:new', (notification: any) => {
            console.log('New notification received:', notification);
            toast(notification.title, {
                description: notification.body,
                duration: 5000,
                action: notification.data?.planId ? {
                    label: 'View Plan',
                    onClick: () => window.location.href = `/dashboard/plan?date=${notification.data.planDate}`,
                } : undefined,
            });
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, [isAuthenticated, token]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
