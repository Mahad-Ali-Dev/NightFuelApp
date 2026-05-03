/**
 * PushService — Web Push (browser) and Expo (React Native) push notifications.
 *
 * Web Push uses the VAPID protocol (RFC 8030) via the `web-push` npm package.
 * Expo push uses the Expo Push API via a simple HTTP POST — no SDK required.
 *
 * Environment variables required:
 *   VAPID_PUBLIC_KEY   — generate with: npx web-push generate-vapid-keys
 *   VAPID_PRIVATE_KEY  — generate with: npx web-push generate-vapid-keys
 *   VAPID_SUBJECT      — mailto:admin@nightfuel.app or https://nightfuel.app
 *   EXPO_ACCESS_TOKEN  — optional, from expo.dev (for enhanced delivery rates)
 */

import webPush, { type PushSubscription as WebPushSubscription } from 'web-push';
import type { PrismaClient } from './generated/prisma';
import type { Logger } from 'pino';

// ─── VAPID setup ─────────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY = process.env['VAPID_PUBLIC_KEY'] ?? '';
const VAPID_PRIVATE_KEY = process.env['VAPID_PRIVATE_KEY'] ?? '';
const VAPID_SUBJECT = process.env['VAPID_SUBJECT'] ?? 'mailto:admin@nightfuel.app';

let vapidConfigured = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && !VAPID_PUBLIC_KEY.startsWith('VAPID_PLACEHOLDER')) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface RegisterWebPushInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface RegisterExpoPushInput {
  userId: string;
  expoPushToken: string; // stored as `endpoint`
}

// ─── PushService ─────────────────────────────────────────────────────────────

export class PushService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {
    if (!vapidConfigured) {
      this.logger.warn('[push] VAPID keys not configured — web push notifications are disabled');
    }
  }

  // ── registerWebPush ────────────────────────────────────────────────────────
  async registerWebPush(input: RegisterWebPushInput): Promise<{ id: string }> {
    const { userId, endpoint, p256dh, auth } = input;

    const sub = await (this.prisma as any).pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth, platform: 'WEB' },
      update: { userId, p256dh, auth },
    });

    this.logger.info({ userId, subId: sub.id }, '[push] web push subscription registered');
    return { id: sub.id };
  }

  // ── registerExpoPush ───────────────────────────────────────────────────────
  async registerExpoPush(input: RegisterExpoPushInput): Promise<{ id: string }> {
    const { userId, expoPushToken } = input;

    const sub = await (this.prisma as any).pushSubscription.upsert({
      where: { endpoint: expoPushToken },
      create: { userId, endpoint: expoPushToken, platform: 'EXPO' },
      update: { userId },
    });

    this.logger.info({ userId, subId: sub.id }, '[push] expo push subscription registered');
    return { id: sub.id };
  }

  // ── unregister ─────────────────────────────────────────────────────────────
  async unregister(userId: string, endpoint: string): Promise<void> {
    await (this.prisma as any).pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    this.logger.info({ userId }, '[push] push subscription removed');
  }

  // ── sendToUser ─────────────────────────────────────────────────────────────
  /** Send a push notification to ALL registered devices for a userId. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const subscriptions = await (this.prisma as any).pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      this.logger.debug({ userId }, '[push] no push subscriptions for user — skipping');
      return;
    }

    const results = await Promise.allSettled(
      subscriptions.map((sub: any) => this.sendToSubscription(sub, payload)),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn({ userId, failed: failed.length }, '[push] some push deliveries failed');
    }
  }

  // ── sendToSubscription ─────────────────────────────────────────────────────
  private async sendToSubscription(sub: any, payload: PushPayload): Promise<void> {
    if (sub.platform === 'WEB') {
      await this.sendWebPush(sub, payload);
    } else if (sub.platform === 'EXPO') {
      await this.sendExpoPush(sub.endpoint, payload);
    }
  }

  // ── sendWebPush ────────────────────────────────────────────────────────────
  private async sendWebPush(sub: any, payload: PushPayload): Promise<void> {
    if (!vapidConfigured) {
      this.logger.debug('[push] VAPID not configured, skipping web push');
      return;
    }

    const pushSub: WebPushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };

    try {
      await webPush.sendNotification(pushSub, JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon ?? '/icon-192.png',
        badge: payload.badge ?? '/badge-72.png',
        data: { url: payload.url ?? '/', ...payload.data },
      }));
    } catch (err: any) {
      // 410 Gone = subscription expired → remove it
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        this.logger.info({ endpoint: sub.endpoint }, '[push] expired web push subscription removed');
        await (this.prisma as any).pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
      } else {
        throw err;
      }
    }
  }

  // ── sendExpoPush ───────────────────────────────────────────────────────────
  private async sendExpoPush(expoPushToken: string, payload: PushPayload): Promise<void> {
    const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    const expoToken = process.env['EXPO_ACCESS_TOKEN'];
    if (expoToken) {
      headers['Authorization'] = `Bearer ${expoToken}`;
    }

    const body = JSON.stringify({
      to: expoPushToken,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: 'default',
      priority: 'high',
    });

    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body });
    if (!res.ok) {
      throw new Error(`Expo push failed: ${res.status} ${await res.text()}`);
    }
  }

  // ── getVapidPublicKey ──────────────────────────────────────────────────────
  getVapidPublicKey(): string {
    return VAPID_PUBLIC_KEY;
  }
}
