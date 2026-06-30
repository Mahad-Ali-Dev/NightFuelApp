import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

/**
 * Admin route guard. The (admin) group must NEVER render for a non-admin — even
 * via a direct deep-link to /(admin). The backend independently enforces
 * requireAdmin (403) on every admin route, but this stops the panel UI from
 * showing at all and bounces a non-admin back to their profile.
 */
export default function AdminLayout() {
    const { isAdmin } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isAdmin) router.replace('/(tabs)/profile');
    }, [isAdmin, router]);

    if (!isAdmin) return null;
    return <Stack screenOptions={{ headerShown: false }} />;
}
