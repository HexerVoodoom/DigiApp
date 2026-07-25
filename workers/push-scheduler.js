// Cloudflare Worker — Scheduled push notifications for DigiApp
// Cron triggers: 10h, 16h, 21h (task reminders) + 22h (goodnight) — BRT (UTC-3)
// — plus a */15min cron dedicated to the 💩 poop system (see POOP_CRON below),
// which needs finer granularity since a user's poop tick can land at any minute.
//
// Sends to BOTH channels stored in the same KV namespace: `push:` keys via Web
// Push (browsers/PWA installs) and `fcm:` keys via Firebase Cloud Messaging
// (the native Android app — its WebView has no Web Push support).
//
// Required environment bindings (set in CF dashboard or wrangler.toml):
//   PUSH_SUBSCRIPTIONS       — KV namespace
//   VAPID_JWK                — Secret: full ECDSA P-256 private key as JSON string
//   VAPID_PUBLIC_KEY         — Plain text: base64url uncompressed public key
//   FIREBASE_SERVICE_ACCOUNT — Secret: full Firebase service account JSON string
//                              (Firebase Console → Project Settings → Service
//                              accounts → Generate new private key)

import { sendWebPush } from './webpush.js';
import { getFcmAccessToken, sendFcmPush } from './fcm.js';

const VAPID_PUBLIC_KEY = 'BOwIWjJK1kQkZTs6fhuIOYgBzYaDXVyRGIKY4Cu-lwn8kvpa-Whxaegn94MUga4bma85GLlUBLr3pNieFvEqUM4';
const CONTACT = 'mailto:contact@digiapp.app';

const POOP_CRON = '*/15 * * * *';
const SIX_HOURS = 6 * 3600000;

function getPoopNotification(kind, digimonName, language) {
  const ispt = language === 'pt-BR';
  if (kind === 'warn') {
    return {
      title: ispt ? '🚽 Seu Digimon está na sujeira!' : '🚽 Your Digimon is in a mess!',
      body: ispt
        ? 'Cocô não limpo tira 1 coração em breve. Dê um banho!'
        : 'Uncleaned poop will drain 1 heart soon. Give it a bath!',
      tag: 'poop-drain-warning',
    };
  }
  return {
    title: ispt ? '🚽 Hora de limpar!' : '🚽 Bathroom time!',
    body: ispt
      ? 'Seu Digimon fez cocô! Dê um banho para limpar. 🚿'
      : 'Your Digimon pooped! Give it a shower to clean up. 🚿',
    tag: 'poop-event',
  };
}

// Mirrors src/hooks/useCareSystem.ts (poop appearance) and the drain-warning
// effect in src/App.tsx — decides if `sub.poop` (synced by the client, see
// src/utils/notifications.ts) is due for a push right now, without ever
// mutating gameplay state itself (that stays client-authoritative).
export function computeDuePoopNotification(poop, now) {
  if (!poop) return null;
  if (poop.sleeping) return null;
  if (poop.stage === 'digiegg' || poop.stage === 'baby-i') return null;

  const scheduled = poop.scheduled || [];
  const shown = poop.shown || [];
  const completed = poop.completed || [];

  let appearAt = null;
  for (let i = 0; i < scheduled.length; i++) {
    if (shown.includes(i)) continue;
    if (now >= scheduled[i]) {
      appearAt = scheduled[i];
      break;
    }
  }
  // Dedupe by the scheduled TIMESTAMP, not the array index — indexes repeat
  // every day (the daily reset rebuilds the schedule as [0], [0,1]), so an
  // index marker surviving in KV would silently swallow the next day's push.
  if (appearAt !== null && poop.lastAppearNotifiedAt !== appearAt) {
    return { kind: 'appear', updates: { lastAppearNotifiedAt: appearAt } };
  }

  const hasUnclean = shown.some(i => !completed.includes(i));
  if (hasUnclean && poop.penaltyClockAt) {
    const clock = poop.penaltyClockAt;
    const periodStart = clock + Math.floor((now - clock) / SIX_HOURS) * SIX_HOURS;
    const msToNextTick = periodStart + SIX_HOURS - now;
    if (msToNextTick > 0 && msToNextTick <= 30 * 60000 && poop.lastDrainWarnPeriodStart !== periodStart) {
      return { kind: 'warn', updates: { lastDrainWarnPeriodStart: periodStart } };
    }
  }

  return null;
}

async function handlePoopCron(env, drainCounts) {
  const now = Date.now();

  let vapidJWK = null;
  try { vapidJWK = JSON.parse(env.VAPID_JWK); } catch { /* Web Push disabled */ }

  let serviceAccount = null;
  let fcmAccessToken = null;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    fcmAccessToken = await getFcmAccessToken(serviceAccount);
  } catch { /* FCM disabled */ }

  const sendAndMark = async (sub, name, due, channel) => {
    const notif = getPoopNotification(due.kind, sub.digimonName, sub.language);
    const result = channel === 'push'
      ? await sendWebPush({ endpoint: sub.endpoint, keys: sub.keys }, notif, vapidJWK, VAPID_PUBLIC_KEY, CONTACT)
      : await sendFcmPush(sub.token, notif, serviceAccount.project_id, fcmAccessToken);

    if (channel === 'push' && (result.status === 410 || result.status === 404)) {
      await env.PUSH_SUBSCRIPTIONS.delete(name);
      return 'removed';
    }
    if (channel === 'fcm' && !result.ok && result.error === 'UNREGISTERED') {
      await env.PUSH_SUBSCRIPTIONS.delete(name);
      return 'removed';
    }
    if (!result.ok) return 'failed';

    await env.PUSH_SUBSCRIPTIONS.put(name, JSON.stringify({
      ...sub,
      poop: { ...sub.poop, ...due.updates },
    }));
    return 'sent';
  };

  if (vapidJWK) {
    await drainPrefix(env, 'push:', async (sub, name) => {
      const due = computeDuePoopNotification(sub.poop, now);
      if (!due) return 'skipped';
      return sendAndMark(sub, name, due, 'push');
    }, drainCounts.webPush);
  }

  if (serviceAccount && fcmAccessToken) {
    await drainPrefix(env, 'fcm:', async (sub, name) => {
      const due = computeDuePoopNotification(sub.poop, now);
      if (!due) return 'skipped';
      return sendAndMark(sub, name, due, 'fcm');
    }, drainCounts.fcm);
  }
}

function getNotification(brtHour, digimonName, language) {
  const ispt = language === 'pt-BR';
  const name = digimonName || 'DigiMon';

  if (brtHour === 22) {
    return {
      title: `🌙 ${name} está desejando boa noite`,
      body: ispt ? 'Durma bem! Até amanhã 😴' : 'Sleep well! See you tomorrow 😴',
      tag: 'pet-goodnight',
    };
  }
  if (brtHour === 21) {
    return {
      title: ispt ? `⏰ ${name} está preocupado!` : `⏰ ${name} is worried!`,
      body: ispt
        ? 'Ainda dá tempo! Complete suas tarefas antes de dormir 🌙'
        : "Still time! Complete your tasks before bed 🌙",
      tag: 'pet-nudge-21',
    };
  }
  if (brtHour === 16) {
    return {
      title: ispt ? `📋 ${name} está te lembrando!` : `📋 ${name} is reminding you!`,
      body: ispt ? 'Suas tarefas ainda estão esperando! 🎯' : 'Your tasks are still waiting! 🎯',
      tag: 'pet-nudge-16',
    };
  }
  return {
    title: ispt ? `☀️ ${name} diz bom dia!` : `☀️ ${name} says good morning!`,
    body: ispt ? 'Vamos começar o dia com foco! 💪' : "Let's start the day focused! 💪",
    tag: 'pet-nudge-10',
  };
}

// Drains every key under `prefix`, running `handle(sub, name)` for each —
// `handle` returns 'sent' | 'failed' | 'removed' (and deletes the KV entry
// itself when 'removed', mirroring the stale-subscription cleanup).
async function drainPrefix(env, prefix, handle, counts) {
  let cursor;
  do {
    const list = await env.PUSH_SUBSCRIPTIONS.list({ prefix, cursor, limit: 100 });
    cursor = list.cursor;

    await Promise.allSettled(
      list.keys.map(async ({ name }) => {
        const raw = await env.PUSH_SUBSCRIPTIONS.get(name);
        if (!raw) return;

        let sub;
        try { sub = JSON.parse(raw); } catch { return; }

        try {
          const outcome = await handle(sub, name);
          counts[outcome] = (counts[outcome] || 0) + 1;
        } catch (err) {
          console.error(`${prefix} send failed for ${name}:`, err.message);
          counts.failed = (counts.failed || 0) + 1;
        }
      }),
    );
  } while (cursor);
}

export default {
  async scheduled(event, env) {
    if (event.cron === POOP_CRON) {
      const counts = {
        webPush: { sent: 0, failed: 0, removed: 0, skipped: 0 },
        fcm: { sent: 0, failed: 0, removed: 0, skipped: 0 },
      };
      await handlePoopCron(env, counts);
      console.log(
        `[poop cron] done — webpush: sent ${counts.webPush.sent}, failed ${counts.webPush.failed}, removed ${counts.webPush.removed} · ` +
        `fcm: sent ${counts.fcm.sent}, failed ${counts.fcm.failed}, removed ${counts.fcm.removed}`,
      );
      return;
    }

    const date = new Date(event.scheduledTime);
    const brtHour = (date.getUTCHours() - 3 + 24) % 24;

    const webPushCounts = { sent: 0, failed: 0, removed: 0 };
    const fcmCounts = { sent: 0, failed: 0, removed: 0 };

    // ── Web Push (browsers / installed PWA) ──────────────────────────────
    let vapidJWK;
    try {
      vapidJWK = JSON.parse(env.VAPID_JWK);
    } catch {
      console.error('VAPID_JWK not configured or invalid JSON — skipping Web Push');
      vapidJWK = null;
    }

    if (vapidJWK) {
      await drainPrefix(env, 'push:', async (sub, name) => {
        const notif = getNotification(brtHour, sub.digimonName, sub.language);
        const result = await sendWebPush(
          { endpoint: sub.endpoint, keys: sub.keys },
          notif,
          vapidJWK,
          VAPID_PUBLIC_KEY,
          CONTACT,
        );
        if (result.status === 410 || result.status === 404) {
          await env.PUSH_SUBSCRIPTIONS.delete(name);
          return 'removed';
        }
        return result.ok ? 'sent' : 'failed';
      }, webPushCounts);
    }

    // ── FCM (native Android app) ──────────────────────────────────────────
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    } catch {
      console.error('FIREBASE_SERVICE_ACCOUNT not configured or invalid JSON — skipping FCM');
      serviceAccount = null;
    }

    if (serviceAccount) {
      const accessToken = await getFcmAccessToken(serviceAccount);
      await drainPrefix(env, 'fcm:', async (sub, name) => {
        const notif = getNotification(brtHour, sub.digimonName, sub.language);
        const result = await sendFcmPush(sub.token, notif, serviceAccount.project_id, accessToken);
        if (result.ok) return 'sent';
        if (result.error === 'UNREGISTERED') {
          await env.PUSH_SUBSCRIPTIONS.delete(name);
          return 'removed';
        }
        return 'failed';
      }, fcmCounts);
    }

    console.log(
      `[BRT ${brtHour}h] Push scheduler done — ` +
      `webpush: sent ${webPushCounts.sent}, failed ${webPushCounts.failed}, removed ${webPushCounts.removed} · ` +
      `fcm: sent ${fcmCounts.sent}, failed ${fcmCounts.failed}, removed ${fcmCounts.removed}`,
    );
  },
};
