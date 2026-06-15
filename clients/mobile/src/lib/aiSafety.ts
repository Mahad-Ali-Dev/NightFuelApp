/**
 * Client-side guardrails for AI requests.
 *
 * The real defense lives server-side in `ai-pipeline` (tool_use API with
 * strict JSON schema, server-side rate limits, content moderation). This
 * file is a *first* line of defense: cheap checks that prevent the obvious
 * cases from costing money or hitting the backend at all.
 *
 * Read PRODUCTION_READINESS.md → S5 + M2 + M5 for context.
 */

/**
 * Maximum characters we send to the AI. Sonnet's context limit is 200K tokens
 * but for chat-style turns we cap aggressively:
 *   - 2000 chars ≈ 500 tokens — fits comfortable normal-user questions
 *   - Blocks prompt-injection essays ("ignore previous instructions, here are
 *     5000 words of new ones…")
 *   - Keeps Sonnet token spend predictable
 */
export const AI_MAX_INPUT_CHARS = 2000;

/** Injection-pattern signals — we strip / flag, never silently allow. */
const INJECTION_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'ignore_previous',     re: /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|context|rules?)/i },
  { name: 'system_prompt_dump',  re: /(reveal|show|print|repeat|output)\s+(the\s+|your\s+)?((system|original|initial)\s+)?(prompt|instructions?|rules?)/i },
  { name: 'role_override',       re: /\byou\s+are\s+now\s+(?:a|an)?\s*\w+/i },
  { name: 'role_assume',         re: /\b(act|pretend|behave)\s+as\s+(?:a|an|if)\b/i },
  { name: 'forget_persona',      re: /forget\s+(everything|your\s+(role|persona|instructions|rules))/i },
  { name: 'jailbreak_token',     re: /\b(DAN|jailbreak|do\s+anything\s+now|developer\s+mode)\b/i },
  { name: 'tool_injection',      re: /<\s*\/?\s*(tool_use|function_call|system|user|assistant)\s*>/i },
  { name: 'prompt_leak_guard',   re: /(api[_\s-]?key|secret[_\s-]?key|bearer\s+[a-z0-9._\-/+]{16,})/i },
];

export interface SanitizedInput {
  /** Cleaned input safe to send. Empty string means input was rejected. */
  text: string;
  /** True if input was modified or flagged. */
  modified: boolean;
  /** Specific reasons (for analytics / Sentry breadcrumbs, never shown to user). */
  flags: string[];
  /** True if the input was effectively rejected (empty after cleaning). */
  rejected: boolean;
}

/**
 * Clean a user-provided AI prompt:
 *  1. Trim and collapse runs of whitespace
 *  2. Strip ASCII control characters except \n, \t, \r
 *  3. Strip zero-width / bidi-override / private-use Unicode (common in
 *     copy-paste prompt-injection payloads)
 *  4. Hard-cap length at AI_MAX_INPUT_CHARS
 *  5. Flag (don't block) recognized injection patterns
 *
 * Always succeeds: we don't block in step 5, we just record flags. The server
 * can decide what to do with flagged inputs (e.g. lower temperature, log to
 * moderation queue, or refuse with a 400). Blocking client-side is hostile
 * UX for the 99% of legitimate users who happen to write something matching
 * a heuristic.
 */
export function sanitizeAiInput(raw: string | null | undefined): SanitizedInput {
  if (raw == null) {
    return { text: '', modified: false, flags: ['empty'], rejected: true };
  }

  const flags: string[] = [];
  const original = raw;

  // 1. Trim + normalize whitespace
  let text = raw.trim().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');

  // 2. Strip ASCII control chars except newline/tab/carriage-return
  // eslint-disable-next-line no-control-regex
  const before = text;
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (text !== before) flags.push('control_chars');

  // 3. Strip zero-width / bidi-override / private-use unicode
  const before2 = text;
  text = text.replace(/[​-‏‪-‮⁦-⁩﻿-]/g, '');
  if (text !== before2) flags.push('invisible_unicode');

  // 4. Length cap
  if (text.length > AI_MAX_INPUT_CHARS) {
    text = text.slice(0, AI_MAX_INPUT_CHARS);
    flags.push('truncated');
  }

  // 5. Pattern detection (flag, don't block)
  for (const { name, re } of INJECTION_PATTERNS) {
    if (re.test(text)) flags.push(`pattern:${name}`);
  }

  return {
    text,
    modified: text !== original,
    flags,
    rejected: text.length === 0,
  };
}

/**
 * Per-AI-endpoint timeout overrides (axios `timeout` in ms).
 *
 * The default apiClient timeout is 15s — too short for plan generation
 * which routinely takes 20-30s on Sonnet, and unnecessarily long for the
 * fast endpoints. This map gives every call site the right ceiling.
 */
export const AI_TIMEOUTS = {
  /** Conversational chat — single turn, tight loop, but Sonnet can be slow. */
  chat: 30_000,
  /** Full-week plan generation — biggest call, runs through all 3 layers. */
  generatePlan: 60_000,
  /** Quick deterministic scoring, mostly Layer 2 (rules). */
  mealScore: 15_000,
  /** Single meal swap, mostly Layer 2 + brief Layer 3 narrative. */
  mealSwap: 20_000,
  /** Weekly audit summary — slow, multi-step. */
  weeklyAudit: 45_000,
} as const;

/** Generic fallback reply when the AI service is unavailable. */
export const AI_FALLBACK_CHAT_REPLY =
  "I'm having trouble reaching the coach right now — your message wasn't sent. " +
  "Please check your connection and try again in a moment.";
