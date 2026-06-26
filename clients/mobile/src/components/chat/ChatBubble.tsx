/**
 * ChatBubble — a single transcript row for the unified chat screen.
 *
 * Owns BOTH the own-message and peer-message bubble (migrated out of
 * app/messages/[id].tsx so the screen's renderItem stays a thin, hoisted
 * function). The own bubble is a restrained lime TINT — a ~14% lime background
 * with a subtle lime hairline and near-white text — NOT a saturated lime fill,
 * so a thread that is mostly the user's own side never becomes a wall of solid
 * lime. Lime as the 10% accent stays reserved for the screen's one Send CTA.
 *
 * Status ticks (own bubbles only): 'sending' (clock) → 'sent' (single check) →
 * 'read' (double check, lime-tinted). Driven entirely by the `status` prop —
 * the bubble stores no state and derives the glyph from ground truth, so the
 * list can flip a bubble sending→sent→read by swapping the prop alone.
 *
 * Memoized: every prop is a primitive except the stable `onRetry` callback
 * (hoisted at the list root, keyed by id). Chat transcripts re-render the whole
 * list on each new message / tick change; memo keeps already-rendered bubbles
 * that didn't change from re-rendering.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { PressableScale } from '@/components/ui/PressableScale';

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
  // Own bubbles are now a DARK lime-TINT surface (no longer a saturated lime
  // fill), so ticks read as near-white on the dark tint — never white-on-lime.
  // Read = the brighter lime accent (legible on the dark tint, unlike the old
  // near-invisible coralLight lime-on-lime). Failed = red.
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
      color={read ? colors.accent.coral : withAlpha(colors.text.primary, 0.6)}
      style={styles.tick}
      accessibilityLabel={read ? 'Read' : 'Sent'}
    />
  );
}

function ChatBubbleComponent({ text, isOwn, timestamp, senderName, status, onRetry, id, accessibilityLabel }: ChatBubbleProps) {
  const { colors, typography } = useTheme();
  // Announce the speaker-qualified label when supplied; otherwise fall back to the
  // raw message text so existing callers (and tests) keep their prior a11y output.
  const bodyA11yLabel = accessibilityLabel ?? text;

  if (isOwn) {
    const failed = status === 'failed';
    const sending = status === 'sending';
    const body = (
      <View
        // Own bubbles are a restrained lime TINT (not a saturated lime fill): a
        // ~14% lime background with a subtle lime hairline and near-white text, so
        // a thread that is mostly the user's own side never becomes a wall of solid
        // lime. Lime as the 10% accent stays reserved for the one Send CTA. No glow
        // halo here — that is a peak/CTA cue, not a routine message row. On
        // send-failure we dim so the red alert tick + tap-to-retry reads clearly.
        style={[
          styles.bubble,
          styles.ownBubble,
          { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.32) },
          (failed || sending) && styles.dim,
        ]}
        accessibilityRole="text"
        accessibilityLabel={bodyA11yLabel}
      >
        <Text style={[typography.body, { color: colors.text.primary, lineHeight: 22 }]}>{text}</Text>
        <View style={styles.metaRow}>
          <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.7), fontSize: 10 }]}>
            {timestamp}
          </Text>
          {status ? <StatusTick status={status} /> : null}
        </View>
      </View>
    );

    return (
      <View style={[styles.row, styles.ownRow]}>
        {failed && id && onRetry ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Message failed to send. Tap to retry."
            onPress={() => onRetry(id)}
          >
            {body}
          </PressableScale>
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
          // Peer name reads in the brand lime — the peer here is Coach Ria, and the
          // Ria identity is lime-accented across the redesigned chat (mockup).
          <Text style={[typography.caption, { color: colors.accent.lime, fontWeight: '700', marginBottom: 4 }]}>
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
  // Own bubble carries a subtle lime hairline (color set inline from the theme tint).
  ownBubble: { borderWidth: 1, borderBottomRightRadius: 8 },
  otherBubble: { borderWidth: 1, borderBottomLeftRadius: 8 },
  dim: { opacity: 0.7 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  tick: { marginLeft: 1 },
});
