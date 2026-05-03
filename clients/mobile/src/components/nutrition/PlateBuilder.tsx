import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PlateBuilderProps {
    items?: Array<{ name: string; portion: string; color: string }>;
    onBuild?: () => void;
}

export function PlateBuilder({ items = [], onBuild }: PlateBuilderProps) {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Build Your Plate</Text>
            <View style={styles.plate}>
                {items.length === 0 ? (
                    <TouchableOpacity style={styles.emptyPlate} onPress={onBuild}>
                        <Ionicons name="add-circle" size={48} color="#FF6B3560" />
                        <Text style={styles.emptyText}>Tap to add foods</Text>
                    </TouchableOpacity>
                ) : (
                    items.map((item, i) => (
                        <View key={i} style={[styles.foodItem, { borderLeftColor: item.color }]}>
                            <Text style={styles.foodName}>{item.name}</Text>
                            <Text style={styles.foodPortion}>{item.portion}</Text>
                        </View>
                    ))
                )}
            </View>
            <TouchableOpacity style={styles.buildBtn} onPress={onBuild}>
                <Ionicons name="restaurant" size={20} color="#FFFFFF" />
                <Text style={styles.buildBtnText}>Start Building</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: '#161B22', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#21262D' },
    title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
    plate: { minHeight: 120, backgroundColor: '#0D1117', borderRadius: 20, padding: 16, marginBottom: 16 },
    emptyPlate: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
    emptyText: { color: '#8B949E', marginTop: 8, fontSize: 14 },
    foodItem: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 8, marginBottom: 8 },
    foodName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    foodPortion: { color: '#8B949E', fontSize: 12, marginTop: 2 },
    buildBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6B35', height: 52, borderRadius: 26, gap: 8 },
    buildBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
