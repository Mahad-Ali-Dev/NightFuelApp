/**
 * Tab Layout — NightFuel bottom navigation.
 *
 * Visible tabs (5):
 *   Home · Train · [+ Log — centre coral FAB] · Insights · Profile
 *
 * The Ria AI Coach FAB floats above the tab bar on every screen.
 *
 * Hidden tabs (reachable via in-screen navigation):
 *   schedule → redirects to /(shifts)
 *   community → redirects to /(community)
 *   circadian → accessed from Insights / home
 */
import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeBlurView } from '@/components/SafeBlurView';
import { withAlpha } from '@/theme/utils';
import { colors as C } from '@/theme/colors';

// ─── Heights ─────────────────────────────────────────────────────────────────

export const TAB_BAR_H = Platform.OS === 'ios' ? 88 : 72;

// ─── Tab icon wrapper (icon + active indicator dot) ───────────────────────────

function TabIcon({
    icon,
    iconFocused,
    focused,
    color,
}: {
    icon: string;
    iconFocused: string;
    focused: boolean;
    color: string;
}) {
    return (
        <View style={ti.wrap}>
            <Ionicons name={(focused ? iconFocused : icon) as any} size={22} color={color} />
            {focused && <View style={[ti.dot, { backgroundColor: color }]} />}
        </View>
    );
}

const ti = StyleSheet.create({
    wrap: { alignItems: 'center', gap: 3 },
    dot: { width: 4, height: 4, borderRadius: 2 },
});

// ─── Centre "Log" raised button ───────────────────────────────────────────────

function CentreButton({ onPress }: { onPress?: () => void }) {
    return (
        <TouchableOpacity style={cb.outer} onPress={onPress} activeOpacity={0.88}>
            <LinearGradient
                colors={['#FF8A5C', '#FF6B35']}
                style={cb.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <Ionicons name="restaurant" size={26} color="#fff" />
            </LinearGradient>
        </TouchableOpacity>
    );
}

const cb = StyleSheet.create({
    outer: {
        width: 58,
        height: 58,
        borderRadius: 29,
        marginBottom: Platform.OS === 'ios' ? 18 : 14,
        // Elevated above the tab bar
        shadowColor: '#FF6B35',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
        elevation: 10,
    },
    gradient: {
        flex: 1,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

// ─── Ria AI Coach FAB (global — appears on every tab) ────────────────────────

function RiaFAB({ onPress }: { onPress: () => void }) {
    return (
        <TouchableOpacity style={fab.container} onPress={onPress} activeOpacity={0.85}>
            <LinearGradient
                colors={C.gradients.purple}
                style={fab.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <Ionicons name="sparkles" size={24} color="#fff" />
                <View style={fab.badge} />
            </LinearGradient>
        </TouchableOpacity>
    );
}

const fab = StyleSheet.create({
    container: {
        position: 'absolute',
        // Sits just above the tab bar
        bottom: TAB_BAR_H + 14,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        shadowColor: C.accent.purple,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 100,
    },
    gradient: {
        flex: 1,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: C.accent.cyan,
        borderWidth: 1.5,
        borderColor: '#fff',
    },
});

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabLayout() {
    const { colors } = useTheme();
    const router = useRouter();

    const barBg = colors.background.secondary;
    const active = colors.accent.coral;
    const inactive = colors.text.tertiary;

    return (
        // Outer View so the Ria FAB can be positioned relative to the whole tab area
        <View style={{ flex: 1 }}>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        // Make it absolute and transparent to let BlurView show through
                        position: 'absolute',
                        backgroundColor: 'transparent',
                        borderTopWidth: 1,
                        borderTopColor: withAlpha(colors.text.primary, 0.1),
                        height: TAB_BAR_H,
                        paddingBottom: Platform.OS === 'ios' ? 26 : 10,
                        paddingTop: 10,
                        elevation: 0,
                        shadowOpacity: 0,
                    },
                    tabBarBackground: () => (
                        <SafeBlurView
                            intensity={40}
                            tint="dark"
                            style={StyleSheet.absoluteFill}
                        />
                    ),
                    tabBarActiveTintColor: active,
                    tabBarInactiveTintColor: inactive,
                    tabBarShowLabel: true,
                    tabBarLabelStyle: {
                        fontSize: 10,
                        fontWeight: '600',
                        marginTop: 0,
                    },
                }}
            >
                {/* ── Home ──────────────────────────────────────────── */}
                <Tabs.Screen
                    name="index"
                    options={{
                        title: 'Home',
                        tabBarIcon: ({ focused, color }) => (
                            <TabIcon icon="home-outline" iconFocused="home" focused={focused} color={color} />
                        ),
                    }}
                />

                {/* ── Train ─────────────────────────────────────────── */}
                <Tabs.Screen
                    name="training"
                    options={{
                        title: 'Train',
                        tabBarIcon: ({ focused, color }) => (
                            <TabIcon icon="barbell-outline" iconFocused="barbell" focused={focused} color={color} />
                        ),
                    }}
                />

                {/* ── Log (centre raised FAB button) ────────────────── */}
                <Tabs.Screen
                    name="nutrition"
                    options={{
                        title: '',
                        tabBarLabel: () => null,
                        tabBarButton: ({ onPress }) => <CentreButton onPress={() => onPress?.({} as any)} />,
                    }}
                />

                {/* ── Feed (Community) ──────────────────────── */}
                <Tabs.Screen
                    name="community"
                    options={{
                        title: 'Feed',
                        tabBarIcon: ({ focused, color }) => (
                            <TabIcon icon="people-outline" iconFocused="people" focused={focused} color={color} />
                        ),
                    }}
                />

                {/* ── More (Settings, Profile, etc.) ────────────────── */}
                <Tabs.Screen
                    name="more"
                    options={{
                        title: 'More',
                        tabBarIcon: ({ focused, color }) => (
                            <TabIcon icon="menu-outline" iconFocused="menu" focused={focused} color={color} />
                        ),
                    }}
                />

                {/* ── Hidden — reachable via in-screen buttons ───────── */}
                <Tabs.Screen name="analytics" options={{ href: null }} />
                <Tabs.Screen name="profile" options={{ href: null }} />
                <Tabs.Screen name="schedule" options={{ href: null }} />
                <Tabs.Screen name="circadian" options={{ href: null }} />
                <Tabs.Screen name="profile/edit" options={{ href: null }} />
                <Tabs.Screen name="profile/preferences" options={{ href: null }} />
            </Tabs>

            {/* ── Ria AI Coach FAB — visible on every tab ─────────── */}
            <RiaFAB onPress={() => router.push('/(modals)/ai-coach' as any)} />
        </View>
    );
}
