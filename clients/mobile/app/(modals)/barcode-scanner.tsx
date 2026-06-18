import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiClient } from '@/api/client';
import { EmptyState } from '@/components/ui';

// ---------------------------------------------------------------------------
// Barcode lookup via the Next.js API gateway → Open Food Facts
// ---------------------------------------------------------------------------

interface FoodResult {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

const lookupBarcode = async (code: string): Promise<FoodResult | null> => {
    const { data } = await apiClient.get<{ food: FoodResult }>('/food-search', {
        params: { barcode: code },
    });
    return data.food ?? null;
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BarcodeScannerModal() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [lookingUp, setLookingUp] = useState(false);

    if (!permission) {
        return <View style={{ flex: 1, backgroundColor: colors.background.primary }} />;
    }

    if (!permission.granted) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center' }]}>
                <EmptyState
                    icon="camera-outline"
                    title="Camera access needed"
                    subtitle="Allow camera access to scan food barcodes and log meals instantly."
                    actionLabel="Grant Permission"
                    onAction={requestPermission}
                />
            </View>
        );
    }

    const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
        if (scanned || lookingUp) return;
        setScanned(true);
        setLookingUp(true);

        try {
            const food = await lookupBarcode(data);

            if (food) {
                // Navigate to log-meal with the scanned food pre-filled
                router.navigate({
                    pathname: '/(meals)/log-meal',
                    params: {
                        barcodeName:     food.name,
                        barcodeCalories: String(Math.round(food.calories)),
                        barcodeProtein:  String(food.protein),
                        barcodeCarbs:    String(food.carbs),
                        barcodeFat:      String(food.fat),
                    },
                } as any);
            } else {
                Alert.alert(
                    'Product Not Found',
                    `Barcode "${data}" wasn't found in the database. You can search for it manually.`,
                    [
                        { text: 'Search Manually', onPress: () => router.navigate('/(meals)/log-meal' as any) },
                        { text: 'Scan Again', onPress: () => { setScanned(false); setLookingUp(false); } },
                    ]
                );
            }
        } catch (err: any) {
            const isNotFound = err?.response?.status === 404;
            Alert.alert(
                isNotFound ? 'Product Not Found' : 'Lookup Failed',
                isNotFound
                    ? `Barcode "${data}" wasn't found in the database. You can search for it manually.`
                    : 'Could not reach the food database. Check your connection and try again.',
                [
                    { text: 'Search Manually', onPress: () => router.navigate('/(meals)/log-meal' as any) },
                    { text: 'Scan Again', onPress: () => { setScanned(false); setLookingUp(false); } },
                ]
            );
        } finally {
            setLookingUp(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: '#000' }]}>
            <StatusBar style="light" />
            <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                barcodeScannerSettings={{
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'],
                }}
            />

            {/* Overlay */}
            <View style={styles.overlay}>
                <View style={styles.topArea}>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close"
                        style={[styles.closeBtn, { marginTop: insets.top + 10 }]}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    <Text style={[typography.heading, { color: '#fff', marginTop: 20, textAlign: 'center' }]}>
                        Scan Food Barcode
                    </Text>
                </View>

                {/* Scanner frame */}
                <View style={styles.scannerBox}>
                    <View style={styles.cornerTopLeft} />
                    <View style={styles.cornerTopRight} />
                    <View style={styles.cornerBottomLeft} />
                    <View style={styles.cornerBottomRight} />
                    {!lookingUp && (
                        <View style={[styles.scanLine, { backgroundColor: colors.accent.coral }]} />
                    )}
                </View>

                <View style={styles.bottomArea}>
                    {lookingUp ? (
                        <View style={styles.lookupRow}>
                            <ActivityIndicator color={colors.accent.coral} size="small" />
                            <Text style={[typography.body, { color: '#fff', marginLeft: 12 }]}>
                                Looking up food…
                            </Text>
                        </View>
                    ) : (
                        <Text style={[typography.caption, { color: '#ccc', textAlign: 'center' }]}>
                            Position the barcode within the frame
                        </Text>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'space-between' },
    topArea: { padding: 20 },
    closeBtn: { alignSelf: 'flex-start', padding: 8 },
    scannerBox: {
        width: 250,
        height: 250,
        alignSelf: 'center',
        position: 'relative',
    },
    cornerTopLeft:    { position: 'absolute', top: 0,    left: 0,  width: 40, height: 40, borderTopWidth: 4,    borderLeftWidth: 4,  borderColor: '#fff' },
    cornerTopRight:   { position: 'absolute', top: 0,    right: 0, width: 40, height: 40, borderTopWidth: 4,    borderRightWidth: 4, borderColor: '#fff' },
    cornerBottomLeft: { position: 'absolute', bottom: 0, left: 0,  width: 40, height: 40, borderBottomWidth: 4, borderLeftWidth: 4,  borderColor: '#fff' },
    cornerBottomRight:{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#fff' },
    scanLine: { width: '100%', height: 2, position: 'absolute', top: '50%', opacity: 0.8 },
    bottomArea: { padding: 40, paddingBottom: 60, alignItems: 'center' },
    lookupRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
});
