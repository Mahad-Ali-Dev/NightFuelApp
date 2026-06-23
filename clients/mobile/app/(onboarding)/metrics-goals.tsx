import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Platform, LayoutChangeEvent } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { CtaButton, DateTimeField, GlassCard } from '@/components/ui';
import { UnitToggle } from '@/components/UnitToggle';
import { withAlpha } from '@/theme/utils';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Ionicons } from '@expo/vector-icons';

// Reanimated-driven Pressable so card press feedback rides a spring (transform
// only) for parity with UnitToggle / CtaButton — not an instant RN style snap.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SEX_OPTIONS = [
    { value: 'MALE', label: 'Male', icon: 'male' },
    { value: 'FEMALE', label: 'Female', icon: 'female' },
    { value: 'OTHER', label: 'Other', icon: 'male-female' },
    { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say', icon: 'help-circle' },
] as const;

// Hard cap on the raw characters the numeric weight/height TextInputs accept.
// The backend range is weightKg (0, 600] / heightCm (0, 300] (user-service
// schema), so the longest legitimate entry is a one-decimal value like "600.5"
// / "180.5" — well under 6 chars. The cap stops a worker pasting an arbitrarily
// long string into the field.
export const MEASUREMENT_MAX_LENGTH = 6;

// ── Unit conversion (display only; canonical store state stays METRIC) ───────
// The onboarding store persists weightKg / heightCm, so the unit toggle is a
// pure entry convenience: the canonical `weight` (kg) / `height` (cm) strings
// remain the validation + submit source of truth and, in the default METRIC
// units, are written VERBATIM from the field (so '72' → weightKg 72 and a bad
// paste still trips the validator). Only when a worker picks lb / in do we
// convert their typed display value back into the canonical metric string.
const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

type WeightUnit = 'kg' | 'lb';
type HeightUnit = 'cm' | 'in';

/** Round to one decimal and drop a trailing ".0" so fields stay tidy. */
function tidy(n: number): string {
    if (!Number.isFinite(n)) return '';
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : String(r);
}

function displayToKg(raw: string, unit: WeightUnit): string {
    if (unit === 'kg') return raw; // identity — canonical == typed
    const v = parseFloat(raw);
    return raw.length > 0 && Number.isFinite(v) ? tidy(v / LB_PER_KG) : raw;
}
function kgToDisplay(kg: string, unit: WeightUnit): string {
    if (unit === 'kg') return kg;
    const v = parseFloat(kg);
    return kg.length > 0 && Number.isFinite(v) ? tidy(v * LB_PER_KG) : '';
}
function displayToCm(raw: string, unit: HeightUnit): string {
    if (unit === 'cm') return raw;
    const v = parseFloat(raw);
    return raw.length > 0 && Number.isFinite(v) ? tidy(v * CM_PER_IN) : raw;
}
function cmToDisplay(cm: string, unit: HeightUnit): string {
    if (unit === 'cm') return cm;
    const v = parseFloat(cm);
    return cm.length > 0 && Number.isFinite(v) ? tidy(v / CM_PER_IN) : '';
}

const WEIGHT_UNITS = [
    { value: 'kg' as const, label: 'kg' },
    { value: 'lb' as const, label: 'lb' },
];
const HEIGHT_UNITS = [
    { value: 'cm' as const, label: 'cm' },
    { value: 'in' as const, label: 'in' },
];

// This is the FIRST onboarding step (Biological Data). The "STEP X OF N"
// indicator is owned SOLELY by the onboarding layout header (which itself
// accounts for the FEMALE-only cycle step), so this screen no longer derives or
// renders its own step numeral — a single source of truth for progress.

export default function BiologicalDataScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data, updateData } = useOnboardingStore();

    const [dob, setDob] = useState(data.dateOfBirth || '');
    // Canonical METRIC state (kg / cm) — the validation + submit source of truth.
    const [weight, setWeight] = useState(data.weightKg?.toString() || '');
    const [height, setHeight] = useState(data.heightCm?.toString() || '');
    // Display buffers hold exactly what the worker typed in the active unit, so
    // editing in lb / in never reformats the string mid-keystroke. In metric
    // units the buffer mirrors the canonical value 1:1.
    const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
    const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
    const [weightDisplay, setWeightDisplay] = useState(data.weightKg?.toString() || '');
    const [heightDisplay, setHeightDisplay] = useState(data.heightCm?.toString() || '');
    const [sex, setSex] = useState(data.biologicalSex);

    // Measured height of the absolute-positioned footer. The ScrollView reserves
    // this much (+ a comfortable gap) as bottom padding so the LAST scroll
    // children — the live validation summary the worker most needs when the form
    // is invalid, and the bottom row of SexCards — always clear the pinned
    // Continue bar instead of hiding behind it.
    const [footerHeight, setFooterHeight] = useState(0);
    const onFooterLayout = (e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        setFooterHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
    };

    const isValidDob = (value: string): boolean => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        // Parse at UTC midnight (trailing Z). Without it the string parses at
        // LOCAL midnight, and the toISOString() round-trip below converts to UTC,
        // landing on the PREVIOUS day for users ahead of UTC (e.g. GMT+5) — which
        // made every valid DOB fail and kept Continue disabled.
        const parsed = new Date(`${value}T00:00:00Z`);
        // Reject impossible dates (e.g. 2020-13-40 -> NaN, 2021-02-29 -> rolls over).
        if (Number.isNaN(parsed.getTime())) return false;
        if (value !== parsed.toISOString().slice(0, 10)) return false;
        return parsed.getTime() < Date.now();
    };

    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);

    const dobError = dob.length > 0 && !isValidDob(dob)
        ? 'Enter a valid past date as YYYY-MM-DD'
        : undefined;
    const weightError = weight.length > 0 && !(weightNum > 0)
        ? 'Enter a weight greater than 0'
        : undefined;
    const heightError = height.length > 0 && !(heightNum > 0)
        ? 'Enter a height greater than 0'
        : undefined;

    // Single live-region summary of whichever inline errors are currently
    // active — a polite alert a screen reader speaks when an entry becomes
    // invalid. Reuses the already-computed *Error strings — no duplicate
    // validation.
    const validationSummary = [dobError, weightError, heightError]
        .filter(Boolean)
        .join('. ');

    // Field change handlers keep the canonical METRIC string in sync with the
    // display buffer. In metric units this is identity (verbatim), so the typed
    // value flows straight to validation/submit; in lb / in we convert.
    const onChangeWeight = (raw: string) => {
        setWeightDisplay(raw);
        setWeight(displayToKg(raw, weightUnit));
    };
    const onChangeHeight = (raw: string) => {
        setHeightDisplay(raw);
        setHeight(displayToCm(raw, heightUnit));
    };
    // Switching units re-derives the display buffer from the canonical metric
    // value ONCE; the canonical value itself never changes, so validation/submit
    // are unaffected by the unit the worker happens to be looking at.
    const onWeightUnitChange = (u: WeightUnit) => {
        setWeightUnit(u);
        setWeightDisplay(kgToDisplay(weight, u));
    };
    const onHeightUnitChange = (u: HeightUnit) => {
        setHeightUnit(u);
        setHeightDisplay(cmToDisplay(height, u));
    };

    const handleNext = () => {
        updateData({
            dateOfBirth: dob,
            weightKg: parseFloat(weight) || 0,
            heightCm: parseFloat(height) || 0,
            biologicalSex: sex as any,
        });
        // FEMALE users get the OPT-IN menstrual-cycle step (cycle-basics) inserted
        // here; everyone else (MALE / OTHER / PREFER_NOT_TO_SAY) skips it entirely
        // and goes straight to shift-type, exactly as before. Data minimization:
        // the cycle step is only offered when it could plausibly apply.
        router.push(sex === 'FEMALE' ? '/(onboarding)/cycle-basics' : '/(onboarding)/shift-type');
    };

    const isValid =
        isValidDob(dob) && weightNum > 0 && heightNum > 0 && !!sex;

    const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? spacing['2xl'] : spacing.xl);

    // Clear the REAL footer height (CtaButton lg minHeight 56 + paddingTop 16 +
    // bottomPad) plus a comfortable gap. Until onLayout measures it on the first
    // frame, fall back to a conservative estimate built from those same numbers
    // so trailing content is never occluded even momentarily.
    const fallbackFooter = 56 + 16 + bottomPad;
    const scrollBottomPad = (footerHeight || fallbackFooter) + spacing.xl;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: scrollBottomPad }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Hero — display heading (brand signature). The step indicator
                    lives ONLY in the onboarding layout header ("STEP 1 OF 4" +
                    progress bar, lime) — the screen no longer renders its own
                    0X/0Y numeral so there is a single source of truth for which
                    step the worker is on. Spring entrance matches every sibling
                    section below. */}
                <Animated.View entering={FadeInDown.duration(420).springify()} style={{ marginBottom: spacing['2xl'] }}>
                    <Text style={[typography.overline, { color: colors.accent.coral, marginBottom: spacing.sm }]}>
                        ABOUT YOU
                    </Text>
                    <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                        Your <Text style={{ color: colors.accent.coral }}>biological profile</Text>
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary }]}>
                        We use these to calculate your personalized macro targets and caloric needs.
                    </Text>
                </Animated.View>

                {/* Date of birth — framed in glass to match the input language. */}
                <Animated.View entering={FadeInDown.delay(80).duration(420).springify()} style={{ marginBottom: spacing['2xl'] }}>
                    <View style={styles.sectionLabelRow}>
                        <Ionicons name="calendar-outline" size={15} color={colors.accent.coral} style={{ marginRight: spacing.sm }} />
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>Date of Birth</Text>
                    </View>
                    <GlassCard radius={borderRadius.xl} style={{ padding: spacing.lg }}>
                        <DateTimeField
                            mode="date"
                            value={dob}
                            onChange={setDob}
                            error={dobError}
                            maximumDate={new Date()}
                        />
                    </GlassCard>
                </Animated.View>

                {/* Body metrics — two big tabular numeric fields, each with its own
                    unit toggle. The accessible field labels stay metric ("Weight
                    (kg)" / "Height (cm)") so assistive tech announces the canonical
                    quantity regardless of the entry unit. */}
                <Animated.View entering={FadeInDown.delay(140).duration(420).springify()} style={{ marginBottom: spacing['2xl'] }}>
                    <View style={styles.sectionLabelRow}>
                        <Ionicons name="fitness-outline" size={15} color={colors.accent.coral} style={{ marginRight: spacing.sm }} />
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>Body Metrics</Text>
                    </View>
                    <GlassCard radius={borderRadius.xl} style={{ padding: spacing.lg, gap: spacing.lg }}>
                        <MetricField
                            label="Weight"
                            accessibilityLabel="Weight (kg)"
                            placeholder={weightUnit === 'kg' ? '75' : '165'}
                            value={weightDisplay}
                            onChangeText={onChangeWeight}
                            error={weightError}
                            unitToggle={
                                <UnitToggle
                                    options={WEIGHT_UNITS}
                                    value={weightUnit}
                                    onChange={onWeightUnitChange}
                                    accessibilityLabel="Weight unit"
                                />
                            }
                        />
                        <View style={[styles.divider, { backgroundColor: withAlpha(colors.text.primary, 0.06) }]} />
                        <MetricField
                            label="Height"
                            accessibilityLabel="Height (cm)"
                            placeholder={heightUnit === 'cm' ? '180' : '71'}
                            value={heightDisplay}
                            onChangeText={onChangeHeight}
                            error={heightError}
                            unitToggle={
                                <UnitToggle
                                    options={HEIGHT_UNITS}
                                    value={heightUnit}
                                    onChange={onHeightUnitChange}
                                    accessibilityLabel="Height unit"
                                />
                            }
                        />
                    </GlassCard>
                </Animated.View>

                {/* Biological sex — premium selection cards in a 2-up grid. */}
                <Animated.View entering={FadeInDown.delay(200).duration(420).springify()}>
                    <View style={styles.sectionLabelRow}>
                        <Ionicons name="person-outline" size={15} color={colors.accent.coral} style={{ marginRight: spacing.sm }} />
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>Biological Sex</Text>
                    </View>
                    <View style={styles.sexGrid}>
                        {SEX_OPTIONS.map((s) => {
                            const isSelected = sex === s.value;
                            return (
                                <SexCard
                                    key={s.value}
                                    label={s.label}
                                    icon={s.icon}
                                    selected={isSelected}
                                    onPress={() => setSex(sex === s.value ? null : (s.value as any))}
                                />
                            );
                        })}
                    </View>
                </Animated.View>

                {validationSummary ? (
                    <Text
                        accessible
                        accessibilityRole="alert"
                        accessibilityLiveRegion="polite"
                        accessibilityLabel={validationSummary}
                        style={[
                            typography.caption,
                            { color: colors.error, marginTop: spacing.lg },
                        ]}
                    >
                        {validationSummary}
                    </Text>
                ) : null}
            </ScrollView>

            <View
                onLayout={onFooterLayout}
                style={[
                    styles.footer,
                    {
                        backgroundColor: withAlpha(colors.background.primary, 0.92),
                        borderTopColor: colors.border.default,
                        paddingHorizontal: spacing.xl,
                        paddingBottom: bottomPad,
                    },
                ]}
            >
                <CtaButton
                    label="Continue"
                    size="lg"
                    onPress={handleNext}
                    disabled={!isValid}
                />
            </View>
        </View>
    );
}

// ── MetricField ──────────────────────────────────────────────────────────────
// A large tabular numeric entry row: a visible label + inline unit toggle on the
// top line, then a big mono figure input, with the per-field error rendered
// BELOW (recovery path). The TextInput keeps keyboardType="numeric", the additive
// maxLength cap and the metric accessibilityLabel — the validation contract is
// unchanged; only the presentation is upgraded.
function MetricField({
    label,
    accessibilityLabel,
    placeholder,
    value,
    onChangeText,
    error,
    unitToggle,
}: {
    label: string;
    accessibilityLabel: string;
    placeholder: string;
    value: string;
    onChangeText: (v: string) => void;
    error?: string;
    unitToggle: React.ReactNode;
}) {
    const { colors, typography, spacing } = useTheme();
    const [focused, setFocused] = useState(false);
    // Programmatically associate the visible label with the input. The explicit
    // accessibilityLabel still wins for the announced name (it carries the
    // canonical unit, e.g. "Weight (kg)"); labelledBy just establishes the link.
    const labelId = `metric-${label.toLowerCase()}-label`;

    return (
        <View>
            <View style={styles.metricHeaderRow}>
                <Text nativeID={labelId} style={[typography.bodyMedium, { color: colors.text.secondary }]}>{label}</Text>
                {unitToggle}
            </View>
            <View
                style={[
                    styles.metricInputBox,
                    {
                        backgroundColor: colors.background.secondary,
                        // Focus feedback is COLOR-ONLY (border + width constant on
                        // Android to avoid the focus-loop flicker the shared Input
                        // documents). Error wins over focus.
                        borderColor: error
                            ? colors.error
                            : focused
                            ? colors.accent.coral
                            : colors.border.default,
                    },
                ]}
            >
                <TextInput
                    accessibilityLabel={accessibilityLabel}
                    accessibilityLabelledBy={labelId}
                    placeholder={placeholder}
                    placeholderTextColor={colors.text.tertiary}
                    value={value}
                    onChangeText={onChangeText}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    keyboardType="numeric"
                    inputMode="decimal"
                    maxLength={MEASUREMENT_MAX_LENGTH}
                    selectionColor={colors.accent.coral}
                    style={[styles.metricInput, { color: colors.text.primary }]}
                    maxFontSizeMultiplier={1.3}
                />
            </View>
            {error ? (
                <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>
                    {error}
                </Text>
            ) : null}
        </View>
    );
}

// ── SexCard ──────────────────────────────────────────────────────────────────
// A premium selection tile for the biological-sex grid: dark-glass at rest, and
// on `selected` a lime hairline ring + minimal glow, a solid lime icon medallion
// with an ink glyph, and a checkmark badge — the brand's "chosen" state. Colour
// is never the only signal (medallion fill + check + bolder label all shift).
function SexCard({
    label,
    icon,
    selected,
    onPress,
}: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    selected: boolean;
    onPress: () => void;
}) {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();

    // Spring-driven pressed scale (transform only) for parity with UnitToggle /
    // CtaButton — replaces the instant, non-animated RN style snap. 0.96 per spec.
    const scale = useSharedValue(1);
    const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={() => {
                scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
            }}
            onPressOut={() => {
                scale.value = withSpring(1, { damping: 16, stiffness: 280 });
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            style={[styles.sexCardWrap, pressStyle]}
        >
            <GlassCard
                radius={borderRadius.xl}
                glow={selected ? colors.accent.coral : undefined}
                style={[
                    styles.sexCard,
                    {
                        // Constant border width (1.5) — only the colour changes on
                        // select, so a neighbour never reflows by 0.5px.
                        borderColor: selected ? colors.accent.coral : withAlpha(colors.text.primary, 0.1),
                        borderWidth: 1.5,
                    },
                ]}
            >
                <View style={[styles.sexCardBody, { padding: spacing.lg }]}>
                    <View
                        style={[
                            styles.sexMedallion,
                            {
                                backgroundColor: selected
                                    ? colors.accent.coral
                                    : withAlpha(colors.accent.coral, 0.14),
                                borderColor: selected
                                    ? 'transparent'
                                    : withAlpha(colors.accent.coral, 0.28),
                            },
                            selected ? shadows.glow(colors.accent.coral) : null,
                        ]}
                    >
                        <Ionicons
                            name={icon}
                            size={22}
                            color={selected ? colors.text.inverse : colors.accent.coral}
                        />
                    </View>
                    <Text
                        style={[
                            typography.subhead,
                            {
                                color: selected ? colors.text.primary : colors.text.secondary,
                                marginTop: spacing.md,
                            },
                        ]}
                        numberOfLines={2}
                    >
                        {label}
                    </Text>

                    {selected ? (
                        <View style={[styles.sexCheck, { backgroundColor: colors.accent.coral }]}>
                            <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
                        </View>
                    ) : null}
                </View>
            </GlassCard>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    sectionLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    metricHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    metricInputBox: {
        borderWidth: 1.5,
        borderRadius: 14,
        paddingHorizontal: 16,
        height: 60,
        justifyContent: 'center',
    },
    metricInput: {
        // Big tabular figure — the brand's "large bold numerals" for stats/entry.
        fontFamily: 'JetBrainsMono_700Bold',
        fontSize: 26,
        height: '100%',
        paddingVertical: 0,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
    },
    sexGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 16,
    },
    sexCardWrap: {
        width: '48%',
    },
    sexCard: {
        minHeight: 132,
    },
    sexCardBody: {
        flex: 1,
        minHeight: 132,
        justifyContent: 'flex-start',
    },
    sexMedallion: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sexCheck: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: 16,
    },
});
