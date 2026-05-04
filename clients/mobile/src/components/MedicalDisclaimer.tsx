/**
 * Medical disclaimer banner.
 *
 * Apple App Review Guideline 1.4.1: apps providing health, fitness, or
 * dietary advice must clearly disclose they are not a substitute for
 * professional medical advice.
 *
 * Two variants in this file:
 *
 *   <MedicalDisclaimerBanner />  — small inline banner for screens that
 *                                   show AI-generated nutrition / workout /
 *                                   sleep advice. Render at the top OR
 *                                   bottom of any screen with health advice.
 *
 *   <MedicalDisclaimerScreen />  — first-run modal that requires the user
 *                                   to acknowledge the disclaimer once.
 *                                   Persists acknowledgement to
 *                                   AsyncStorage.
 *
 * The wording was reviewed against Apple's recent rejections in the
 * Health & Fitness category. Don't soften the "not medical advice"
 * phrasing — that's specifically what reviewers look for.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

const DISCLAIMER_ACK_KEY = 'nf_medical_disclaimer_v1_ack';

export const MEDICAL_DISCLAIMER_TEXT =
    "NightFuel provides general nutrition, exercise, and sleep guidance for healthy adults. " +
    "It is NOT a substitute for medical advice, diagnosis, or treatment. " +
    "Consult a qualified healthcare provider before starting any new diet, fasting protocol, " +
    "or exercise program — especially if you are pregnant, nursing, have a medical condition, " +
    "or take medication. If you experience chest pain, severe dizziness, or any concerning " +
    "symptom while using the app, stop immediately and seek medical attention.";

export const MEDICAL_DISCLAIMER_SHORT =
    "Not medical advice. Consult your healthcare provider before starting a new diet or fitness routine.";

// ─────────────────────────────────────────────────────────────────────
// Inline banner — small, dismissable, embeddable above AI content
// ─────────────────────────────────────────────────────────────────────

export function MedicalDisclaimerBanner({
    text = MEDICAL_DISCLAIMER_SHORT,
    style,
}: {
    text?: string;
    style?: any;
}) {
    const { colors, typography } = useTheme();
    return (
        <View
            style={[
                styles.bannerContainer,
                {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.default,
                },
                style,
            ]}
            accessibilityRole="alert"
            accessibilityLabel="Medical disclaimer"
        >
            <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.text.secondary}
                style={{ marginTop: 2 }}
            />
            <Text style={[typography.caption, { color: colors.text.secondary, flex: 1, lineHeight: 16 }]}>
                {text}
            </Text>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────
// First-run acknowledgement modal
// ─────────────────────────────────────────────────────────────────────

export async function hasAcknowledgedMedicalDisclaimer(): Promise<boolean> {
    try {
        const v = await AsyncStorage.getItem(DISCLAIMER_ACK_KEY);
        return v === 'true';
    } catch {
        return false;
    }
}

export async function setMedicalDisclaimerAcknowledged(): Promise<void> {
    try {
        await AsyncStorage.setItem(DISCLAIMER_ACK_KEY, 'true');
    } catch {
        // Best-effort; ignore.
    }
}

/**
 * Modal-style screen prompting the user to acknowledge the medical
 * disclaimer. Use it at app startup wrapped in a check against
 * `hasAcknowledgedMedicalDisclaimer()` so it shows once.
 */
export function MedicalDisclaimerScreen({
    visible,
    onAcknowledge,
}: {
    visible: boolean;
    onAcknowledge: () => void;
}) {
    const { colors, typography, spacing, borderRadius } = useTheme();

    const handleAck = async () => {
        await setMedicalDisclaimerAcknowledged();
        onAcknowledge();
    };

    return (
        <Modal visible={visible} animationType="fade" transparent={false}>
            <View style={[styles.modalRoot, { backgroundColor: colors.background.primary }]}>
                <ScrollView contentContainerStyle={styles.modalScroll}>
                    <View style={styles.modalIconWrap}>
                        <Ionicons name="medkit-outline" size={48} color={colors.accent.coral} />
                    </View>

                    <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, textAlign: 'center', marginBottom: 16 }]}>
                        Before You Start
                    </Text>

                    <Text style={[typography.body, { color: colors.text.secondary, lineHeight: 22, textAlign: 'left' }]}>
                        {MEDICAL_DISCLAIMER_TEXT}
                    </Text>

                    <View style={[styles.bulletList, { borderColor: colors.border.default }]}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginBottom: 12 }]}>
                            By tapping &quot;I understand&quot; you confirm:
                        </Text>
                        <View style={styles.bulletRow}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.accent.cyan} />
                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8, flex: 1, lineHeight: 18 }]}>
                                You are 17 or older and a healthy adult
                            </Text>
                        </View>
                        <View style={styles.bulletRow}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.accent.cyan} />
                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8, flex: 1, lineHeight: 18 }]}>
                                You will consult a healthcare provider for any medical condition
                            </Text>
                        </View>
                        <View style={styles.bulletRow}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.accent.cyan} />
                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8, flex: 1, lineHeight: 18 }]}>
                                NightFuel doesn&apos;t replace professional advice
                            </Text>
                        </View>
                    </View>
                </ScrollView>

                <View style={[styles.modalFooter, { paddingBottom: spacing['2xl'] }]}>
                    <TouchableOpacity
                        onPress={handleAck}
                        style={[styles.ackButton, { backgroundColor: colors.accent.coral, borderRadius: borderRadius.lg }]}
                        accessibilityRole="button"
                        accessibilityLabel="I understand and accept"
                    >
                        <Text style={[typography.subhead, { color: '#fff', fontWeight: '700' }]}>
                            I understand
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    bannerContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
    },
    modalRoot: { flex: 1 },
    modalScroll: { padding: 24, paddingTop: 60, paddingBottom: 24 },
    modalIconWrap: { alignItems: 'center', marginBottom: 16 },
    bulletList: { marginTop: 24, padding: 16, borderRadius: 12, borderWidth: 1 },
    bulletRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    modalFooter: { paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 0 },
    ackButton: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
});
