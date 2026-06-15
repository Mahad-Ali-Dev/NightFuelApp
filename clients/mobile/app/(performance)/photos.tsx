import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, Dimensions, Image, FlatList,
    Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui';
import { withAlpha } from '@/theme/utils';

const { width } = Dimensions.get('window');
const PHOTO_DIR = ((FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '') + 'progress_photos/';
const METADATA_KEY = 'nightfuel_photos_metadata';

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

    if (loading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                    <View style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                    </View>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>Progress Photos</Text>
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

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Progress Photos</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Add" activeOpacity={0.85} onPress={handleAddPhoto} style={[styles.headerBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.3) }]}>
                    <Ionicons name="add" size={24} color={colors.accent.purple} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {photos.length === 0 ? (
                    <EmptyState
                        icon="camera-outline"
                        title="No Photos Yet"
                        subtitle="Visual progress is one of the best motivators. Take your first photo today!"
                        actionLabel="Take Photo"
                        onAction={handleAddPhoto}
                        style={styles.emptyContainer}
                    />
                ) : (
                    <>
                        {/* Compare Toggle */}
                        {photos.length >= 2 && (
                            <TouchableOpacity
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel="Compare progress"
                                accessibilityState={{ selected: comparing }}
                                style={[styles.compareBar, { backgroundColor: comparing ? withAlpha(colors.accent.purple, 0.16) : colors.background.secondary, borderColor: comparing ? withAlpha(colors.accent.purple, 0.4) : colors.border.default, borderRadius: borderRadius.xl }]}
                                onPress={() => setComparing(!comparing)}
                            >
                                <Ionicons name="git-compare" size={20} color={comparing ? colors.accent.purple : colors.text.secondary} />
                                <Text style={[typography.subhead, { color: comparing ? colors.accent.purple : colors.text.primary, marginLeft: 10, fontWeight: '700' }]}>
                                    {comparing ? 'Exit Compare Mode' : 'Compare Progress (Before/After)'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {comparing && photos.length >= 2 && (
                            <View style={styles.compareRow}>
                                <View style={styles.compareItem}>
                                    <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 8 }]}>BEFORE ({photos[compareIdxB]?.date})</Text>
                                    <View style={[styles.compareImgContainer, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}>
                                        <Image source={{ uri: photos[compareIdxB]?.uri }} style={styles.compareImg} />
                                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Swap"
                                            activeOpacity={0.85}
                                            style={styles.cycleBtn}
                                            onPress={() => setCompareIdxB((compareIdxB + 1) % photos.length)}
                                        >
                                            <Ionicons name="swap-horizontal" size={20} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={styles.compareItem}>
                                    <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 8 }]}>AFTER ({photos[compareIdxA]?.date})</Text>
                                    <View style={[styles.compareImgContainer, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}>
                                        <Image source={{ uri: photos[compareIdxA]?.uri }} style={styles.compareImg} />
                                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Swap"
                                            activeOpacity={0.85}
                                            style={styles.cycleBtn}
                                            onPress={() => setCompareIdxA((compareIdxA + 1) % photos.length)}
                                        >
                                            <Ionicons name="swap-horizontal" size={20} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Grid */}
                        <View style={styles.grid}>
                            {photos.map((photo, index) => (
                                <TouchableOpacity
                                    key={photo.id}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Progress photo from ${photo.date}`}
                                    style={[styles.gridItem, { borderRadius: borderRadius.lg, backgroundColor: colors.background.tertiary }]}
                                    onPress={() => setSelectedPhoto(photo)}
                                >
                                    <Image source={{ uri: photo.uri }} style={styles.gridImg} />
                                    <View style={styles.dateOverlay}>
                                        <Text style={[styles.overlayText, { color: colors.text.primary }]}>{photo.date}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </>
                )}
            </ScrollView>

            {/* Lightbox / Detail Modal */}
            <Modal visible={!!selectedPhoto} transparent animationType="fade">
                <View style={styles.modalBg}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" activeOpacity={0.7} style={styles.closeModal} onPress={() => setSelectedPhoto(null)}>
                        <Ionicons name="close" size={32} color="#fff" />
                    </TouchableOpacity>

                    {selectedPhoto && (
                        <View style={styles.modalContent}>
                            <Image source={{ uri: selectedPhoto.uri }} style={styles.fullImg} resizeMode="contain" />
                            <View style={styles.modalFooter}>
                                <Text style={[typography.h3, { color: colors.text.primary }]}>{selectedPhoto.date}</Text>
                                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Delete"
                                    activeOpacity={0.7}
                                    style={styles.deleteBtn}
                                    onPress={() => handleDelete(selectedPhoto.id, selectedPhoto.uri)}
                                >
                                    <Ionicons name="trash-outline" size={24} color={colors.accent.red} />
                                </TouchableOpacity>
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    emptyContainer: { marginTop: 80 },
    compareBar: { margin: 20, padding: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
    compareRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 30 },
    compareItem: { flex: 1 },
    compareImgContainer: { width: '100%', aspectRatio: 3 / 4, overflow: 'hidden', position: 'relative' },
    compareImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    cycleBtn: { position: 'absolute', bottom: 10, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8 },
    gridItem: { width: (width - 32 - 16) / 3, aspectRatio: 3 / 4, overflow: 'hidden', position: 'relative' },
    gridImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    dateOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.4)', padding: 4 },
    overlayText: { fontSize: 10, textAlign: 'center', fontWeight: '700' },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
    closeModal: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
    modalContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    fullImg: { width: width, height: '70%' },
    modalFooter: { position: 'absolute', bottom: 50, width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 40 },
    deleteBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
});
