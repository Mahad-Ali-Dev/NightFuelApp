/**
 * ChatBubble — a single transcript row for the unified chat screen.
 *
 * Owns BOTH the own-message and peer-message bubble (migrated out of
 * app/messages/[id].tsx so the screen's renderItem stays a thin, hoisted
 * function). The own bubble keeps the Aurora coral fill as a
 * `StyleSheet.absoluteFillObject` <LinearGradient> overlay BEHIND the text — an
 * overlay fill, NOT a labeled coral CTA, so it passes check-no-inline-cta (which
 * only flags a coral <LinearGradient> wrapping a <Text>). The send button stays
 * icon-only and lives on the screen.
 *
 * Status ticks (own bubbles only): 'sending' (clock) → 'sent' (single check) →
 * 'read' (double check, coral-tinted). Driven entirely by the `status` prop —
 * the bubble stores no state and derives the glyph from ground truth, so the
 * list can flip a bubble sending→sent→read by swapping the prop alone.
 *
 * Memoized: every prop is a primitive except the stable `onRetry` callback
 * (hoisted at the list root, keyed by id). Chat transcripts re-render the whole
 * list on each new message / tick change; memo keeps already-rendered bubbles
 * that didn't change from re-rendering.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

/** Delivery state of an OWN message. Peer messages never carry a status. */
export type ChatBubbleStatus = 'sending' | 'sent' | 'read' | 'failed';

export interface ChatBubbleProps {
  text: string;
  isOwn: boolean;
  timestamp: string;
  /** Optional leading sender name on peer bubbles (group/coach context). */
  senderName?: string;
  /** Own-bubble delivery state — drives the trailing tick. Ignored for peers. */
  status?: ChatBubbleStatus;
  /** Stable callback to retry a failed own message (passed the message id). */
  onRetry?: (id: string) => void;
  /** This row's id — forwarded to onRetry so the list keeps ONE callback. */
  id?: string;
  /**
   * Speaker-qualified screen-reader label for the bubble body (e.g.
   * "You: Hey there" / "Coach Ria: How are you?"). Lets a screen reader tell who
   * said what. Optional: when omitted the body falls back to announcing its `text`,
   * so existing non-Ria callers (and the snapshot tests) stay unaffected.
   */
  accessibilityLabel?: string;
}

/** Map a delivery status to its trailing tick glyph + tint (own bubbles only). */
function StatusTick({ status }: { status: ChatBubbleStatus }) {
  const { colors } = useTheme();
  // Read = coral double-check; sent/sending = muted white. Failed = red alert.
  if (status === 'failed') {
    return (
      <Ionicons
        name="alert-circle"
        size={13}
        color={colors.error}
        style={styles.tick}
        accessibilityLabel="Failed"
      />
    );
  }
  if (status === 'sending') {
    return (
      <Ionicons
        name="time-outline"
        size={12}
        color={withAlpha(colors.text.primary, 0.6)}
        style={styles.tick}
        accessibilityLabel="Sending"
      />
    );
  }
  const read = status === 'read';
  return (
    <Ionicons
      name={read ? 'checkmark-done' : 'checkmark'}
      size={14}
      color={read ? colors.accent.coralLight : withAlpha(colors.text.primary, 0.6)}
      style={styles.tick}
      accessibilityLabel={read ? 'Read' : 'Sent'}
    />
  );
}

function ChatBubbleComponent({ text, isOwn, timestamp, senderName, status, onRetry, id, accessibilityLabel }: ChatBubbleProps) {
  const { colors, typography, shadows } = useTheme();
  // Announce the speaker-qualified label when supplied; otherwise fall back to the
  // raw message text so existing callers (and tests) keep their prior a11y output.
  const bodyA11yLabel = accessibilityLabel ?? text;

  if (isOwn) {
    const failed = status === 'failed';
    const sending = status === 'sending';
    const body = (
      <View
        // The coral fill is an absoluteFillObject overlay BEHIND this content
        // (allowed by check-no-inline-cta). On send-failure we dim it so the
        // red alert tick + tap-to-retry affordance reads clearly.
        style={[styles.bubble, styles.ownBubble, shadows.glow(colors.accent.pink), (failed || sending) && styles.dim]}
        accessibilityRole="text"
        accessibilityLabel={bodyA11yLabel}
      >
        <LinearGradient
          // F46: use the darker coralCta gradient (not the brighter hero coral) so
          // the white body text + small timestamp clear the highest contrast we can
          // get on a coral fill — consistent with Button/CtaButton's accepted
          // coralCta + textShadow legibility mechanism (ChatBubble was the only coral
          // surface still on the brighter gradient).
          colors={colors.gradients.coralCta}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, styles.ownFill]}
        />
        <Text style={[typography.body, { color: colors.text.primary, lineHeight: 22 }]}>{text}</Text>
        <View style={styles.metaRow}>
          <Text style={[typography.caption, styles.ownTimestamp, { color: colors.text.primary, fontSize: 10 }]}>
            {timestamp}
          </Text>
          {status ? <StatusTick status={status} /> : null}
        </View>
      </View>
    );

    return (
      <View style={[styles.row, styles.ownRow]}>
        {failed && id && onRetry ? (
          <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Message failed to send. Tap to retry."
            onPress={() => onRetry(id)}
          >
            {body}
          </TouchableOpacity>
        ) : (
          body
        )}
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.otherRow]}>
      <View
        style={[styles.bubble, styles.otherBubble, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
        accessibilityRole="text"
        accessibilityLabel={bodyA11yLabel}
      >
        {senderName ? (
          <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700', marginBottom: 4 }]}>
            {senderName}
          </Text>
        ) : null}
        <Text style={[typography.body, { color: colors.text.primary, lineHeight: 22 }]}>{text}</Text>
        <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, marginTop: 6, alignSelf: 'flex-end' }]}>
          {timestamp}
        </Text>
      </View>
    </View>
  );
}

export const ChatBubble = React.memo(ChatBubbleComponent);

const styles = StyleSheet.create({
  row: { marginBottom: 16 },
  ownRow: { alignItems: 'flex-end' },
  otherRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', padding: 14, borderRadius: 22, overflow: 'hidden' },
  ownBubble: { borderBottomRightRadius: 8 },
  // The overlay fill must inherit the bubble's rounded corners (it's clipped by
  // the bubble's overflow:'hidden', but matching the radius keeps Android crisp).
  ownFill: { borderRadius: 22, borderBottomRightRadius: 8 },
  otherBubble: { borderWidth: 1, borderBottomLeftRadius: 8 },
  dim: { opacity: 0.7 },
  // Own-bubble timestamp sits on the bright coral fill. Full-opacity white plus a
  // dark textShadow (mirroring the CtaButton label) lifts it clear for AA — the
  // previous white@0.7 (~1.95:1) failed.
  ownTimestamp: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  tick: { marginLeft: 1 },
});
