import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { useOfflineStore } from '@/store/offlineStore';

let NetInfo: { addEventListener: (cb: (state: { isConnected: boolean | null }) => void) => () => void };
try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  // Fallback — always report online
  NetInfo = { addEventListener: () => () => {} };
}

export function NetworkStatusBar() {
  const insets = useSafeAreaInsets();
  const { isOffline, setOfflineStatus } = useOfflineStore();
  const [slideAnim] = useState(() => new Animated.Value(-50));

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected ?? true);
      setOfflineStatus(offline);
    });
    return unsubscribe;
  }, [setOfflineStatus]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOffline ? 0 : -50,
      useNativeDriver: true,
    }).start();
  }, [isOffline, slideAnim]);

  if (!isOffline) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: insets.top + 4, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color="#FFF" />
      <Text style={styles.text}>You're offline — changes will sync when reconnected</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: colors.accent.amber,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
