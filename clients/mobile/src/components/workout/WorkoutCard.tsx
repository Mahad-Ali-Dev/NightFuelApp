import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/theme';

interface WorkoutCardProps {
    name: string;
    muscleGroup: string;
    equipment: string;
    difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
    duration?: string;
    imageUrl?: string;
    onPress?: () => void;
}

const DIFFICULTY_COLORS = { Beginner: '#00D4AA', Intermediate: '#FFB300', Advanced: '#FF4444' };

function WorkoutCardComponent({ name, muscleGroup, equipment, difficulty, duration, imageUrl, onPress }: WorkoutCardProps) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    return (
        <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
            <Card style={styles.card}>
                <View style={[styles.imageBg, imageUrl ? {} : { backgroundColor: colors.background.tertiary }]}>
                    {imageUrl ? (
                        <Image
                            source={{ uri: imageUrl }}
                            style={styles.image}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={200}
                        />
                    ) : (
                        <Ionicons name="barbell" size={32} color="#A8CC3C40" />
                    )}
                    {duration && <View style={styles.durationBadge}><Text style={styles.durationText}>{duration}</Text></View>}
                </View>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                <Text style={styles.meta}>{muscleGroup} • {equipment}</Text>
                <View style={[styles.diffBadge, { backgroundColor: DIFFICULTY_COLORS[difficulty] + '20' }]}>
                    <Text style={[styles.diffText, { color: DIFFICULTY_COLORS[difficulty] }]}>{difficulty}</Text>
                </View>
            </Card>
        </TouchableOpacity>
    );
}

/**
 * Memoized: all props are primitives (strings/union) plus a stable `onPress`
 * callback, so a shallow prop comparison is safe and prevents re-renders when
 * sibling cards in a list update. No internal state.
 */
export const WorkoutCard = React.memo(WorkoutCardComponent);

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
    card: { padding: 0, overflow: 'hidden', marginBottom: 16, width: '100%' },
    imageBg: { width: '100%', height: 120, borderTopLeftRadius: 20, borderTopRightRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    image: { width: '100%', height: '100%' },
    durationBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    durationText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
    name: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', paddingHorizontal: 14, paddingTop: 12 },
    meta: { color: colors.text.secondary, fontSize: 12, paddingHorizontal: 14, marginTop: 4 },
    diffBadge: { alignSelf: 'flex-start', marginHorizontal: 14, marginTop: 8, marginBottom: 14, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    diffText: { fontSize: 11, fontWeight: '700' },
});
