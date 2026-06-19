import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';

interface RiaCoachFABProps {
    onPress: () => void;
}

const RiaCoachFABComponent: React.FC<RiaCoachFABProps> = ({ onPress }) => {
    return (
        <TouchableOpacity
            style={styles.container}
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open Coach Ria"
        >
            <LinearGradient
                colors={colors.gradients.purple}
                style={styles.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <Ionicons name="sparkles" size={24} color="#FFFFFF" />
                <View style={styles.badge} />
            </LinearGradient>
        </TouchableOpacity>
    );
};

/**
 * Memoized: the only prop is a stable `onPress`. This floating button is
 * mounted on screens that re-render often, so memo avoids needless re-renders.
 */
export const RiaCoachFAB = React.memo(RiaCoachFABComponent);

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        // Brighter, larger purple glow halo so the FAB reads clearly above the
        // dark-glass Aurora surfaces (visual-only — API/behaviour unchanged).
        elevation: 12,
        shadowColor: colors.accent.purple,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.55,
        shadowRadius: 14,
    },
    gradient: {
        flex: 1,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        // Subtle bright inner ring lifts the disc off busy backgrounds.
        borderWidth: 1,
        borderColor: colors.accent.purpleLight,
    },
    badge: {
        position: 'absolute',
        top: 14,
        right: 14,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.accent.cyan,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },
});
