import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { captureException } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Always send to Sentry (it's a no-op in dev since SDK is gated on !__DEV__).
    // Component stack goes into a custom context so it's searchable in Sentry.
    captureException(error, {
      componentStack: info.componentStack,
      source: 'ErrorBoundary',
    });

    if (__DEV__) {
      console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={64} color={colors.accent.amber} />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {__DEV__ ? this.state.error?.message : 'An unexpected error occurred. Please try again.'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color="#FFF" />
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: colors.text.primary,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  message: {
    color: colors.text.secondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent.coral,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
