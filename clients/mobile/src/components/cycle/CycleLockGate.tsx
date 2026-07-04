import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { authenticateBiometric, getBiometricCapability, type BiometricKind } from '@/lib/biometric';

/**
 * CycleLockGate — a privacy gate for the whole cycle screen (Period P3).
 *
 * The cycle surface holds the most sensitive data in the app (periods, discharge,
 * sexual activity, pregnancy intent, fertility signals). This gate lets a user
 * OPT-IN to locking it behind a device auth prompt on every open, so a shoulder-
 * surfer or a shared phone can't glance at it.
 *
 * TWO parts:
 *   1. A small toggle row (`<CycleLockToggle/>`) the screen mounts near the top —
 *      flips the `cycleLockEnabled` secure-store flag on/off. Enabling with no
 *      biometric enrolled walks the user through setting a 4-digit PIN.
 *   2. The gate wrapper (`<CycleLockGate>…</CycleLockGate>`) that, when the flag is
 *      on, hides its children behind a minimal lock screen until the user
 *      authenticates. Auth is remembered PER APP SESSION (a module-level flag), so
 *      re-mounting the screen inside one session doesn't re-prompt; a cold start
 *      does.
 *
 * AUTH PRIMITIVE: biometric via the app's existing `src/lib/biometric.ts`
 * (expo-local-authentication — installed) when hardware is present AND enrolled.
 * Otherwise it falls back to a 4-digit PIN stored in expo-secure-store. Both are
 * best-effort and never block the rest of the app.
 *
 * Coral period accent, matching the screen's sensitive lower-contrast styling.
 */

// SecureStore keys (namespaced so they can't collide with the auth-token keys in
// utils/storage). The PIN is only ever set/read on-device via SecureStore.
const KEY_LOCK_ENABLED = 'nf_cycle_lock_enabled';
const KEY_LOCK_PIN = 'nf_cycle_lock_pin';

// Per-app-session unlock latch. Module-level so it survives a screen re-mount but
// resets on a cold start (a fresh JS context) — exactly "unlock once per session".
let sessionUnlocked = false;

const PIN_LENGTH = 4;

/** Read the persisted "is the cycle lock on?" flag (defaults to off). */
async function readLockEnabled(): Promise<boolean> {
    try {
        return (await SecureStore.getItemAsync(KEY_LOCK_ENABLED)) === 'true';
    } catch {
        return false;
    }
}

// ── Toggle row ──────────────────────────────────────────────────────────────────

export interface CycleLockToggleProps {
    /** Notifies the parent when the persisted flag changes (so it can re-gate). */
    onChange?: (enabled: boolean) => void;
}

/**
 * A slim "Lock this screen" row for the cycle header area. Reads its initial state
 * from SecureStore; flipping it on with no biometric enrolled prompts for a PIN.
 * Turning it off clears the stored PIN and drops the session latch.
 */
export function CycleLockToggle({ onChange }: CycleLockToggleProps) {
    const { colors, typography, borderRadius } = useTheme();
    const { coral: CORAL } = useCycleAccents();

    const [enabled, setEnabled] = useState(false);
    const [capKind, setCapKind] = useState<BiometricKind>('none');
    const [biometricReady, setBiometricReady] = useState(false);
    // PIN-set flow surfaces inline when biometric isn't available.
    const [settingPin, setSettingPin] = useState(false);
    const [pin, setPin] = useState('');
    const [pinConfirm, setPinConfirm] = useState('');

    // Seed the toggle + detect biometric capability once on mount.
    useEffect(() => {
        let alive = true;
        (async () => {
            const [on, cap] = await Promise.all([readLockEnabled(), getBiometricCapability()]);
            if (!alive) return;
            setEnabled(on);
            setCapKind(cap.kind);
            setBiometricReady(cap.hardwarePresent && cap.enrolled);
        })();
        return () => {
            alive = false;
        };
    }, []);

    /** Persist the flag + tell the parent so the gate above re-reads it. */
    const persist = useCallback(
        async (next: boolean) => {
            try {
                await SecureStore.setItemAsync(KEY_LOCK_ENABLED, next ? 'true' : 'false');
            } catch {
                /* best-effort — a failed write just leaves the lock off */
            }
            setEnabled(next);
            onChange?.(next);
        },
        [onChange],
    );

    const onToggle = async (next: boolean) => {
        if (!next) {
            // Turning OFF: clear the PIN + drop the session latch, then persist.
            setSettingPin(false);
            setPin('');
            setPinConfirm('');
            try {
                await SecureStore.deleteItemAsync(KEY_LOCK_PIN);
            } catch {
                /* ignore */
            }
            sessionUnlocked = false;
            await persist(false);
            return;
        }
        // Turning ON: biometric is enough on its own; otherwise collect a PIN.
        if (biometricReady) {
            sessionUnlocked = true; // just proved presence by being here; don't re-prompt now
            await persist(true);
        } else {
            setSettingPin(true);
        }
    };

    const savePin = async () => {
        if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
            Alert.alert('PIN', `Enter a ${PIN_LENGTH}-digit PIN.`);
            return;
        }
        if (pin !== pinConfirm) {
            Alert.alert('PIN', "Those PINs don't match — try again.");
            setPinConfirm('');
            return;
        }
        try {
            await SecureStore.setItemAsync(KEY_LOCK_PIN, pin);
        } catch {
            Alert.alert('PIN', "Couldn't save your PIN. Try again.");
            return;
        }
        sessionUnlocked = true; // they set it just now — no need to immediately re-enter
        setSettingPin(false);
        setPin('');
        setPinConfirm('');
        await persist(true);
    };

    const cancelPin = () => {
        setSettingPin(false);
        setPin('');
        setPinConfirm('');
    };

    const methodHint = biometricReady
        ? capKind === 'face'
            ? 'Unlocks with Face ID.'
            : capKind === 'fingerprint'
                ? 'Unlocks with your fingerprint.'
                : 'Unlocks with device biometrics.'
        : 'Unlocks with a 4-digit PIN.';

    return (
        <GlassCard radius={borderRadius.xl} style={styles.toggleCard}>
            <View style={styles.toggleInner}>
                <View style={styles.toggleRow}>
                    <View style={[styles.iconBadge, { backgroundColor: withAlpha(CORAL, 0.14) }]}>
                        <Ionicons name="lock-closed-outline" size={16} color={CORAL} />
                    </View>
                    <View style={styles.toggleText}>
                        <Text style={[typography.subtitle, { color: colors.text.primary }]}>Lock this screen</Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                            {enabled ? methodHint : 'Ask to unlock each time you open Cycle.'}
                        </Text>
                    </View>
                    <Switch
                        value={enabled}
                        onValueChange={onToggle}
                        trackColor={{ false: colors.border.light, true: withAlpha(CORAL, 0.5) }}
                        thumbColor={enabled ? CORAL : undefined}
                        accessibilityLabel="Lock the cycle screen"
                    />
                </View>

                {/* Inline PIN set-up — only when biometric isn't available. */}
                {settingPin ? (
                    <View style={styles.pinSetup}>
                        <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary }]}>
                            Choose a 4-digit PIN
                        </Text>
                        <PinInput value={pin} onChange={setPin} accessibilityLabel="New PIN" autoFocus />
                        <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary, marginTop: 12 }]}>
                            Confirm PIN
                        </Text>
                        <PinInput value={pinConfirm} onChange={setPinConfirm} accessibilityLabel="Confirm PIN" />
                        <View style={styles.pinActions}>
                            <Pressable
                                onPress={cancelPin}
                                accessibilityRole="button"
                                accessibilityLabel="Cancel PIN setup"
                                style={styles.pinCancel}
                            >
                                <Text style={[typography.bodySm, { color: colors.text.tertiary }]}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                onPress={savePin}
                                accessibilityRole="button"
                                accessibilityLabel="Save PIN and enable the lock"
                                style={({ pressed }) => [
                                    styles.pinSave,
                                    { backgroundColor: CORAL, opacity: pressed ? 0.85 : 1 },
                                ]}
                            >
                                <Text style={[typography.bodyMedium, { color: colors.text.inverse, fontWeight: '700' }]}>
                                    Save PIN
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                ) : null}
            </View>
        </GlassCard>
    );
}

// ── The gate wrapper ─────────────────────────────────────────────────────────────

export interface CycleLockGateProps {
    children: React.ReactNode;
    /**
     * Bumped by the parent whenever the toggle flips, so the gate re-reads the
     * persisted flag without a full remount (e.g. the user just enabled the lock).
     */
    refreshKey?: number;
}

/**
 * Gate wrapper. Reads `cycleLockEnabled`; when on and this session isn't yet
 * unlocked, it renders a minimal lock screen (an Unlock button) over its children
 * until the user authenticates. When off — or already unlocked this session — it
 * renders `children` straight through.
 */
export function CycleLockGate({ children, refreshKey }: CycleLockGateProps) {
    const { colors, typography } = useTheme();
    const { coral: CORAL } = useCycleAccents();

    // 'checking' until we've read the flag; then 'unlocked' or 'locked'.
    const [phase, setPhase] = useState<'checking' | 'locked' | 'unlocked'>('checking');
    const [capKind, setCapKind] = useState<BiometricKind>('none');
    const [biometricReady, setBiometricReady] = useState(false);
    const [prompting, setPrompting] = useState(false);
    // PIN-entry state (fallback path).
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState<string | null>(null);

    // Re-evaluate whenever the toggle changes (refreshKey) or on first mount.
    useEffect(() => {
        let alive = true;
        (async () => {
            const enabled = await readLockEnabled();
            if (!alive) return;
            if (!enabled || sessionUnlocked) {
                // Lock off, or already satisfied this session → straight through.
                if (sessionUnlocked && !enabled) sessionUnlocked = false; // keep latch honest
                setPhase('unlocked');
                return;
            }
            const cap = await getBiometricCapability();
            if (!alive) return;
            setCapKind(cap.kind);
            setBiometricReady(cap.hardwarePresent && cap.enrolled);
            setPhase('locked');
        })();
        return () => {
            alive = false;
        };
    }, [refreshKey]);

    const markUnlocked = useCallback(() => {
        sessionUnlocked = true;
        setPin('');
        setPinError(null);
        setPhase('unlocked');
    }, []);

    /** Run the biometric prompt; on success unlock, else surface a gentle retry. */
    const runBiometric = useCallback(async () => {
        if (prompting) return;
        setPrompting(true);
        try {
            const res = await authenticateBiometric('Unlock your cycle', { allowDevicePasscode: true });
            if (res.success) markUnlocked();
        } finally {
            setPrompting(false);
        }
    }, [prompting, markUnlocked]);

    // Auto-trigger the biometric prompt once when the lock screen first appears
    // (feels like the OS lock — you land straight in Face ID / fingerprint).
    useEffect(() => {
        if (phase === 'locked' && biometricReady && !sessionUnlocked) {
            runBiometric();
        }
        // Intentionally only when we transition into a biometric-capable lock.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, biometricReady]);

    /** Verify a typed PIN against the stored one. */
    const submitPin = useCallback(async () => {
        try {
            const stored = await SecureStore.getItemAsync(KEY_LOCK_PIN);
            if (stored && pin === stored) {
                markUnlocked();
            } else {
                setPinError('Incorrect PIN');
                setPin('');
            }
        } catch {
            setPinError('Could not verify — try again');
            setPin('');
        }
    }, [pin, markUnlocked]);

    // Auto-submit the PIN the moment 4 digits are entered.
    useEffect(() => {
        if (phase === 'locked' && !biometricReady && pin.length === PIN_LENGTH) {
            submitPin();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pin, phase, biometricReady]);

    // While we resolve the flag, render nothing (the screen's own skeleton shows).
    if (phase === 'checking') return null;
    if (phase === 'unlocked') return <>{children}</>;

    // ── Locked: a minimal, calm lock screen ─────────────────────────────────────
    return (
        <View style={styles.lockWrap} testID="cycle-lock-screen">
            <View style={[styles.lockBadge, { backgroundColor: withAlpha(CORAL, 0.14), borderColor: withAlpha(CORAL, 0.3) }]}>
                <Ionicons name="lock-closed" size={30} color={CORAL} />
            </View>
            <Text style={[typography.h3, styles.lockTitle, { color: colors.text.primary }]}>Cycle is locked</Text>
            <Text style={[typography.bodySm, styles.lockSubtitle, { color: colors.text.secondary }]}>
                {biometricReady
                    ? capKind === 'face'
                        ? 'Use Face ID to view your cycle.'
                        : capKind === 'fingerprint'
                            ? 'Use your fingerprint to view your cycle.'
                            : 'Authenticate to view your cycle.'
                    : 'Enter your 4-digit PIN to view your cycle.'}
            </Text>

            {biometricReady ? (
                <Pressable
                    onPress={runBiometric}
                    disabled={prompting}
                    accessibilityRole="button"
                    accessibilityLabel="Unlock the cycle screen"
                    testID="cycle-unlock-btn"
                    style={({ pressed }) => [
                        styles.unlockBtn,
                        { backgroundColor: CORAL, opacity: pressed || prompting ? 0.85 : 1 },
                    ]}
                >
                    <Ionicons name="finger-print" size={18} color={colors.text.inverse} style={{ marginRight: 8 }} />
                    <Text style={[typography.bodyMedium, { color: colors.text.inverse, fontWeight: '700' }]}>
                        {prompting ? 'Unlocking…' : 'Unlock'}
                    </Text>
                </Pressable>
            ) : (
                <View style={styles.pinEntry}>
                    <PinInput
                        value={pin}
                        onChange={(v) => {
                            setPinError(null);
                            setPin(v);
                        }}
                        accessibilityLabel="Enter your PIN"
                        autoFocus
                    />
                    {pinError ? (
                        <Text style={[typography.caption, { color: colors.error, marginTop: 10, textAlign: 'center' }]}>
                            {pinError}
                        </Text>
                    ) : null}
                </View>
            )}
        </View>
    );
}

/**
 * A small masked 4-digit PIN input — four dot slots over a hidden numeric
 * TextInput. Kept local since it's only used by this gate. Tapping the dots row
 * focuses the field; digits beyond PIN_LENGTH are ignored.
 */
function PinInput({
    value,
    onChange,
    accessibilityLabel,
    autoFocus,
}: {
    value: string;
    onChange: (v: string) => void;
    accessibilityLabel: string;
    autoFocus?: boolean;
}) {
    const { colors } = useTheme();
    const { coral: CORAL } = useCycleAccents();
    const inputRef = React.useRef<TextInput>(null);

    const slots = useMemo(() => Array.from({ length: PIN_LENGTH }), []);

    return (
        <Pressable
            onPress={() => inputRef.current?.focus()}
            accessibilityRole="none"
            style={styles.pinRow}
        >
            {slots.map((_, i) => {
                const filled = i < value.length;
                return (
                    <View
                        key={i}
                        style={[
                            styles.pinDot,
                            {
                                borderColor: filled ? CORAL : colors.border.default,
                                backgroundColor: filled ? withAlpha(CORAL, 0.25) : 'transparent',
                            },
                        ]}
                    />
                );
            })}
            {/* Hidden field that actually captures keystrokes. */}
            <TextInput
                ref={inputRef}
                value={value}
                onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                keyboardType="number-pad"
                maxLength={PIN_LENGTH}
                secureTextEntry
                autoFocus={autoFocus}
                accessibilityLabel={accessibilityLabel}
                style={styles.pinHiddenInput}
                caretHidden
            />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    // Toggle card.
    toggleCard: { marginTop: 12 },
    toggleInner: { padding: 14 },
    toggleRow: { flexDirection: 'row', alignItems: 'center' },
    iconBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    toggleText: { flex: 1, marginLeft: 12, marginRight: 10 },
    // PIN set-up block under the toggle.
    pinSetup: {
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    fieldLabel: { marginBottom: 8, letterSpacing: 0.5 },
    pinActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
    pinCancel: { paddingHorizontal: 14, paddingVertical: 10 },
    pinSave: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
    // Lock screen.
    lockWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 24 },
    lockBadge: {
        width: 68,
        height: 68,
        borderRadius: 34,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lockTitle: { marginTop: 18 },
    lockSubtitle: { marginTop: 8, textAlign: 'center', maxWidth: 300 },
    unlockBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 22,
        minWidth: 180,
        borderRadius: 14,
        paddingVertical: 13,
        paddingHorizontal: 20,
    },
    pinEntry: { marginTop: 22, alignItems: 'center' },
    // PIN dots + hidden input.
    pinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
    pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
    // Zero-size but focusable — the dots are the visible affordance.
    pinHiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});

export default CycleLockGate;
