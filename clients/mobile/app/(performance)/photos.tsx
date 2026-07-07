import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    Alert, Dimensions, Image,
    Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Skeleton, EmptyState, CtaButton } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { withAlpha } from '@/theme/utils';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const PHOTO_DIR = ((FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '') + 'progress_photos/';
const METADATA_KEY = 'nightfuel_photos_metadata';

// House entrance recipe — staggered FadeInDown spring, matching the rest of the
// performance stack (body-metrics.tsx). `i` indexes the stagger so sections
// cascade in on mount. transform/opacity only, interruptible.
const enter = (i: number) => FadeInDown.delay(80 + i * 50).springify().damping(18).mass(0.7);

// Inclusive whole-day span between the oldest and newest snapshot (peak-end
// momentum readout). Photos arrive newest-first, so the last entry is the oldest.
function daysSpanned(dates: string[]): number {
    if (dates.length < 2) return 0;
    const ts = dates.map(d => new Date(d).getTime()).filter(n => Number.isFinite(n));
    if (ts.length < 2) return 0;
    const span = Math.round((Math.max(...ts) - Math.min(...ts)) / 86400000);
    return span < 0 ? 0 : span;
}

interface PhotoEntry {
    id: string;
    uri: string;
    date: string;
}

export default function ProgressPhotosScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [photos, setPhotos] = useState<PhotoEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [comparing, setComparing] = useState(false);
    const [compareIdxA, setCompareIdxA] = useState(0);
    const [compareIdxB, setCompareIdxB] = useState(0);
    const [selectedPhoto, setSelectedPhoto] = useState<PhotoEntry | null>(null);

    useEffect(() => {
        ensureDirExists();
        loadPhotos();
    }, []);

    const ensureDirExists = async () => {
        const dirInfo = await FileSystem.getInfoAsync(PHOTO_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
        }
    };

    const loadPhotos = async () => {
        try {
            const json = await AsyncStorage.getItem(METADATA_KEY);
            if (json) {
                const metadata = JSON.parse(json);
                setPhotos(metadata);
                if (metadata.length >= 2) {
                    setCompareIdxB(metadata.length - 1);
                }
            }
        } catch (e) {
            console.error('Failed to load photos', e);
        } finally {
            setLoading(false);
        }
    };

    const saveMetadata = async (updated: PhotoEntry[]) => {
        try {
            await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error('Failed to save metadata', e);
        }
    };

    const handleAddPhoto = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission Denied', 'We need camera permissions to take progress photos.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [3, 4],
            quality: 0.8,
        });

        if (!result.canceled) {
            const asset = result.assets[0];
            const filename = `photo_${Date.now()}.jpg`;
            const dest = `${PHOTO_DIR}${filename}`;

            try {
                await FileSystem.copyAsync({ from: asset!.uri, to: dest });
                const newPhoto: PhotoEntry = {
                    id: Date.now().toString(),
                    uri: dest,
                    date: new Date().toISOString().split('T')[0] as string,
                };
                const updated = [newPhoto, ...photos];
                setPhotos(updated);
                saveMetadata(updated);
            } catch (e) {
                Alert.alert('Error', 'Failed to save photo locally.');
            }
        }
    };

    const handleDelete = async (id: string, uri: string) => {
        Alert.alert('Delete Photo', 'Are you sure you want to delete this progress photo?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    const updated = photos.filter(p => p.id !== id);
                    setPhotos(updated);
                    saveMetadata(updated);
                    try {
                        await FileSystem.deleteAsync(uri, { idempotent: true });
                    } catch (e) { }
                    if (selectedPhoto?.id === id) setSelectedPhoto(null);
                }
            }
        ]);
    };

    // Momentum readout for the hero band — total snapshots + the span they cover.
    const spanDays = useMemo(() => daysSpanned(photos.map(p => p.date)), [photos]);

    if (loading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                {/* Header */}
                <View style={styles.header}>
                    <View style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                    </View>
                    <Text style={[typography.h2, { color: colors.text.primary }]}>Progress Photos</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.grid}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton
                            key={i}
                            width={(width - 32 - 16) / 3}
                            height={((width - 32 - 16) / 3) * (4 / 3)}
                            radius={borderRadius.lg}
                        />
                    ))}
                </View>
            </View>
        );
    }

    const hasPhotos = photos.length > 0;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header — title only; the primary action lives in the thumb zone. */}
            <View style={styles.header}>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </PressableScale>
                <Text style={[typography.h2, { color: colors.text.primary }]}>Progress Photos</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                {!hasPhotos ? (
                    <EmptyState
                        icon="camera-outline"
                        title="No Photos Yet"
                        subtitle="Visual progress is one of the best motivators. Add your first progress photo today!"
                        actionLabel="Take Photo"
                        onAction={handleAddPhoto}
                        style={styles.emptyContainer}
                    />
                ) : (
                    <>
                        {/* Hero momentum band — value dominates its label (peak-end). */}
                        <Animated.View
                            entering={enter(0)}
                            style={[
                                styles.heroBand,
                                {
                                    backgroundColor: colors.background.secondary,
                                    borderColor: colors.border.default,
                                    borderRadius: borderRadius['2xl'],
                                },
                            ]}
                        >
                            <View style={styles.heroStat}>
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>{photos.length}</Text>
                                <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 2 }]}>
                                    {photos.length === 1 ? 'SNAPSHOT' : 'SNAPSHOTS'}
                                </Text>
                            </View>
                            <View style={[styles.heroDivider, { backgroundColor: colors.border.default }]} />
                            <View style={styles.heroStat}>
                                {/* Reserve the scarce 10% lime for a real multi-day milestone;
                                    a single-photo span (0) renders neutral, never an anti-peak. */}
                                <Text style={[typography.statLarge, { color: spanDays > 0 ? colors.accent.coral : colors.text.primary }]}>{spanDays}</Text>
                                <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 2 }]}>
                                    {spanDays === 1 ? 'DAY TRACKED' : 'DAYS TRACKED'}
                                </Text>
                            </View>
                        </Animated.View>

                        {/* Compare Toggle */}
                        {photos.length >= 2 && (
                            <Animated.View entering={enter(1)}>
                                <PressableScale
                                    accessibilityRole="button"
                                    accessibilityLabel="Compare progress"
                                    accessibilityState={{ selected: comparing }}
                                    style={[styles.compareBar, { backgroundColor: comparing ? withAlpha(colors.accent.coral, 0.12) : colors.background.secondary, borderColor: comparing ? withAlpha(colors.accent.coral, 0.45) : colors.border.default, borderRadius: borderRadius.xl }]}
                                    onPress={() => setComparing(!comparing)}
                                >
                                    <View style={[styles.compareIconWrap, { backgroundColor: comparing ? withAlpha(colors.accent.coral, 0.18) : colors.background.tertiary }]}>
                                        <Ionicons name="git-compare" size={18} color={comparing ? colors.accent.coral : colors.text.secondary} />
                                    </View>
                                    <Text style={[typography.subhead, { color: comparing ? colors.accent.coral : colors.text.primary, marginLeft: 12, flex: 1 }]}>
                                        {comparing ? 'Exit Compare Mode' : 'Compare Before / After'}
                                    </Text>
                                    <Ionicons name={comparing ? 'chevron-up' : 'chevron-forward'} size={18} color={comparing ? colors.accent.coral : colors.text.tertiary} />
                                </PressableScale>
                            </Animated.View>
                        )}

                        {comparing && photos.length >= 2 && (
                            <Animated.View entering={enter(2)}>
                                <View style={styles.compareRow}>
                                    <View style={styles.compareItem}>
                                        <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: 8 }]}>BEFORE</Text>
                                        <View style={[styles.compareImgContainer, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}>
                                            <Image source={{ uri: photos[compareIdxB]?.uri }} style={styles.compareImg} />
                                            <View style={styles.compareDateChip}>
                                                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: '700' }]}>{photos[compareIdxB]?.date}</Text>
                                            </View>
                                            <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Swap"
                                                style={styles.cycleBtn}
                                                onPress={() => setCompareIdxB((compareIdxB + 1) % photos.length)}
                                            >
                                                <Ionicons name="swap-horizontal" size={18} color={colors.text.primary} />
                                            </PressableScale>
                                        </View>
                                    </View>
                                    <View style={styles.compareItem}>
                                        <Text style={[typography.overline, { color: colors.accent.coral, marginBottom: 8 }]}>AFTER</Text>
                                        <View style={[styles.compareImgContainer, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl, borderColor: withAlpha(colors.accent.coral, 0.35) }]}>
                                            <Image source={{ uri: photos[compareIdxA]?.uri }} style={styles.compareImg} />
                                            <View style={styles.compareDateChip}>
                                                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: '700' }]}>{photos[compareIdxA]?.date}</Text>
                                            </View>
                                            <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Swap"
                                                style={styles.cycleBtn}
                                                onPress={() => setCompareIdxA((compareIdxA + 1) % photos.length)}
                                            >
                                                <Ionicons name="swap-horizontal" size={18} color={colors.text.primary} />
                                            </PressableScale>
                                        </View>
                                    </View>
                                </View>
                                {/* Peak-end affirmation under the comparison. */}
                                <Text style={[typography.bodySm, styles.compareAffirm, { color: colors.text.secondary }]}>
                                    Look how far you've come. Keep showing up.
                                </Text>
                            </Animated.View>
                        )}

                        {/* Gallery overline */}
                        <View style={styles.galleryHeader}>
                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>GALLERY</Text>
                        </View>

                        {/* Grid */}
                        <View style={styles.grid}>
                            {photos.map((photo, idx) => (
                                <Animated.View key={photo.id} entering={enter(3 + Math.min(idx, 8))}>
                                    <PressableScale
                                        accessibilityRole="button"
                                        accessibilityLabel={`Progress photo from ${photo.date}`}
                                        style={[styles.gridItem, { borderRadius: borderRadius.lg, backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}
                                        onPress={() => setSelectedPhoto(photo)}
                                    >
                                        <Image source={{ uri: photo.uri }} style={styles.gridImg} />
                                        <View style={styles.dateOverlay}>
                                            <Text style={[styles.overlayText, { color: colors.text.primary }]}>{photo.date}</Text>
                                        </View>
                                    </PressableScale>
                                </Animated.View>
                            ))}
                        </View>
                    </>
                )}
            </ScrollView>

            {/* Thumb-zone primary CTA — the single full-lime action on the screen.
                Docked in both the empty and populated cases so the primary action
                always sits within reach in the bottom third. */}
            <View
                pointerEvents="box-none"
                style={[styles.ctaDock, { paddingBottom: insets.bottom + 16 }]}
            >
                <CtaButton
                    label={hasPhotos ? 'Add Photo' : 'Take First Photo'}
                    icon="camera"
                    size="lg"
                    onPress={handleAddPhoto}
                    accessibilityLabel="Add progress photo"
                />
            </View>

            {/* Lightbox / Detail Modal */}
            <Modal visible={!!selectedPhoto} transparent animationType="fade">
                <View style={styles.modalBg}>
                    <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" style={[styles.closeModal, { top: insets.top + 12, backgroundColor: withAlpha(colors.text.primary, 0.12) }]} onPress={() => setSelectedPhoto(null)}>
                        <Ionicons name="close" size={26} color={colors.text.primary} />
                    </PressableScale>

                    {selectedPhoto && (
                        <View style={styles.modalContent}>
                            <Image source={{ uri: selectedPhoto.uri }} style={styles.fullImg} resizeMode="contain" />
                            <View style={[styles.modalFooter, { paddingBottom: insets.bottom + 24 }]}>
                                <View>
                                    <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: 2 }]}>CAPTURED</Text>
                                    <Text style={[typography.h2, { color: colors.text.primary }]}>{selectedPhoto.date}</Text>
                                </View>
                                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Delete"
                                    style={[styles.deleteBtn, { backgroundColor: withAlpha(colors.accent.red, 0.16), borderColor: withAlpha(colors.accent.red, 0.4) }]}
                                    onPress={() => handleDelete(selectedPhoto.id, selectedPhoto.uri)}
                                >
                                    <Ionicons name="trash-outline" size={22} color={colors.accent.red} />
                                </PressableScale>
                            </View>
                        </View>
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    emptyContainer: { marginTop: 72 },
    heroBand: { marginHorizontal: 20, marginBottom: 20, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
    heroStat: { flex: 1, alignItems: 'center' },
    heroDivider: { width: 1, height: 44 },
    compareBar: { marginHorizontal: 20, marginBottom: 20, paddingVertical: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
    compareIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    compareRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 12 },
    compareItem: { flex: 1 },
    compareImgContainer: { width: '100%', aspectRatio: 3 / 4, overflow: 'hidden', position: 'relative', borderWidth: 1 },
    compareImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    compareDateChip: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    compareAffirm: { textAlign: 'center', paddingHorizontal: 32, marginBottom: 28 },
    cycleBtn: { position: 'absolute', bottom: 10, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
    galleryHeader: { paddingHorizontal: 20, marginBottom: 12 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8 },
    gridItem: { width: (width - 32 - 16) / 3, aspectRatio: 3 / 4, overflow: 'hidden', position: 'relative', borderWidth: 1 },
    gridImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    dateOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 5 },
    overlayText: { fontSize: 10, textAlign: 'center', fontWeight: '700' },
    ctaDock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12 },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
    closeModal: { position: 'absolute', right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    modalContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    fullImg: { width: width, height: '70%' },
    modalFooter: { position: 'absolute', bottom: 0, width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 32 },
    deleteBtn: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
});
