import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface PlanSection {
    title: string;
    items: string[];
    color: string;
    icon: keyof typeof Ionicons.glyphMap;
}

interface PlanBuilderProps {
    sections?: PlanSection[];
    onSave?: () => void;
    onAddSection?: () => void;
}

const DEFAULT_SECTIONS: PlanSection[] = [
    { title: 'Nutrition', items: ['Pre-shift meal at 6 PM', 'Light meal at midnight', 'Post-shift smoothie'], color: '#FF6B35', icon: 'restaurant' },
    { title: 'Sleep', items: ['Blackout curtains protocol', 'Melatonin at 7 AM', '7-hour sleep target'], color: '#A78BFA', icon: 'moon' },
    { title: 'Training', items: ['3x/week strength', 'Pre-shift mobility (15 min)'], color: '#00D4AA', icon: 'barbell' },
];

export function PlanBuilder({ sections = DEFAULT_SECTIONS, onSave, onAddSection }: PlanBuilderProps) {
    return (
        <View style={styles.container}>
            {sections.map((section, i) => (
                <View key={i} style={[styles.sectionCard, { borderLeftColor: section.color }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name={section.icon} size={18} color={section.color} />
                        <Text style={[styles.sectionTitle, { color: section.color }]}>{section.title}</Text>
                    </View>
                    {section.items.map((item, j) => (
                        <View key={j} style={styles.itemRow}>
                            <Text style={styles.bullet}>•</Text>
                            <Text style={styles.itemText}>{item}</Text>
                        </View>
                    ))}
                </View>
            ))}

            <TouchableOpacity style={styles.addSectionBtn} onPress={onAddSection} activeOpacity={0.85}>
                <Ionicons name="add" size={20} color="#7C4DFF" />
                <Text style={styles.addSectionText}>Add Section</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={onSave} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Save Plan</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { padding: 4 },
    sectionCard: { backgroundColor: colors.background.secondary, borderRadius: 16, padding: 16, marginBottom: 12, borderLeftWidth: 4 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    sectionTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
    itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, gap: 10 },
    bullet: { color: colors.text.secondary, fontSize: 14, lineHeight: 20, marginTop: 1 },
    itemText: { color: '#C9D1D9', fontSize: 14, lineHeight: 20, flex: 1 },
    addSectionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderWidth: 1, borderColor: '#7C4DFF30', borderStyle: 'dashed', borderRadius: 16, marginBottom: 12, gap: 8 },
    addSectionText: { color: '#7C4DFF', fontWeight: '700' },
    saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C4DFF', height: 52, borderRadius: 26, gap: 8 },
    saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
