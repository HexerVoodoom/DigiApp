// Server-side poop push pipeline — the cron decision logic in
// workers/push-scheduler.js and the KV merge in functions/api/subscribe.js.
// These mirror the client rules in useCareSystem.ts / App.tsx (CLAUDE.md 💩):
// poop appears at a synced scheduled time, and an uncleaned poop drains
// 1 heart every 6h with a warning push ~30min before each tick.
import { describe, it, expect } from 'vitest';
import { computeDuePoopNotification } from '../../workers/push-scheduler.js';
import { onRequestPost } from '../../functions/api/subscribe.js';

const HOUR = 3600000;
const SIX_HOURS = 6 * HOUR;

const basePoop = {
  scheduled: [] as number[],
  shown: [] as number[],
  completed: [] as number[],
  penaltyClockAt: 0,
  sleeping: false,
  stage: 'rookie',
};

describe('computeDuePoopNotification — appear push', () => {
  it('fires when a scheduled poop is due and not yet shown in-app', () => {
    const now = Date.now();
    const due = computeDuePoopNotification(
      { ...basePoop, scheduled: [now - 5 * 60000] },
      now,
    );
    expect(due).toEqual({ kind: 'appear', updates: { lastAppearNotifiedAt: now - 5 * 60000 } });
  });

  it('does not fire before the scheduled time', () => {
    const now = Date.now();
    expect(
      computeDuePoopNotification({ ...basePoop, scheduled: [now + 5 * 60000] }, now),
    ).toBeNull();
  });

  it('does not re-fire once the marker records the same scheduled timestamp', () => {
    const now = Date.now();
    const t = now - 5 * 60000;
    expect(
      computeDuePoopNotification(
        { ...basePoop, scheduled: [t], lastAppearNotifiedAt: t },
        now,
      ),
    ).toBeNull();
  });

  it("fires for the NEXT day's poop even though it reuses array index 0 (regression)", () => {
    // The daily reset rebuilds the schedule, so index 0 repeats every day —
    // dedupe must key off the timestamp, not the index.
    const now = Date.now();
    const yesterday = now - 26 * HOUR;
    const today = now - 10 * 60000;
    const due = computeDuePoopNotification(
      { ...basePoop, scheduled: [today], lastAppearNotifiedAt: yesterday },
      now,
    );
    expect(due).toEqual({ kind: 'appear', updates: { lastAppearNotifiedAt: today } });
  });

  it('skips poops already shown in-app (client synced shown[])', () => {
    const now = Date.now();
    expect(
      computeDuePoopNotification(
        { ...basePoop, scheduled: [now - HOUR], shown: [0], completed: [0] },
        now,
      ),
    ).toBeNull();
  });

  it('fires for the second poop of the day when only the first was shown', () => {
    const now = Date.now();
    const second = now - 60000;
    const due = computeDuePoopNotification(
      { ...basePoop, scheduled: [now - 9 * HOUR, second], shown: [0], completed: [0] },
      now,
    );
    expect(due).toEqual({ kind: 'appear', updates: { lastAppearNotifiedAt: second } });
  });

  it('never fires while sleeping or for digiegg/baby-i stages', () => {
    const now = Date.now();
    const duePoop = { ...basePoop, scheduled: [now - HOUR] };
    expect(computeDuePoopNotification({ ...duePoop, sleeping: true }, now)).toBeNull();
    expect(computeDuePoopNotification({ ...duePoop, stage: 'digiegg' }, now)).toBeNull();
    expect(computeDuePoopNotification({ ...duePoop, stage: 'baby-i' }, now)).toBeNull();
    expect(computeDuePoopNotification(null, now)).toBeNull();
  });
});

describe('computeDuePoopNotification — drain warning push', () => {
  it('warns inside the 30min window before a 6h drain tick', () => {
    const now = Date.now();
    const clock = now - (SIX_HOURS - 20 * 60000); // next tick in 20min
    const due = computeDuePoopNotification(
      { ...basePoop, scheduled: [clock], shown: [0], penaltyClockAt: clock },
      now,
    );
    expect(due).toEqual({ kind: 'warn', updates: { lastDrainWarnPeriodStart: clock } });
  });

  it('stays quiet outside the warning window', () => {
    const now = Date.now();
    const clock = now - 2 * HOUR; // next tick in 4h
    expect(
      computeDuePoopNotification(
        { ...basePoop, scheduled: [clock], shown: [0], penaltyClockAt: clock },
        now,
      ),
    ).toBeNull();
  });

  it('warns once per 6h period (dedupe by periodStart)', () => {
    const now = Date.now();
    const clock = now - (SIX_HOURS - 20 * 60000);
    expect(
      computeDuePoopNotification(
        {
          ...basePoop,
          scheduled: [clock],
          shown: [0],
          penaltyClockAt: clock,
          lastDrainWarnPeriodStart: clock,
        },
        now,
      ),
    ).toBeNull();
  });

  it('warns again for the SECOND 6h period of the same poop', () => {
    const now = Date.now();
    const clock = now - (2 * SIX_HOURS - 20 * 60000); // 20min before the 2nd tick
    const due = computeDuePoopNotification(
      {
        ...basePoop,
        scheduled: [clock],
        shown: [0],
        penaltyClockAt: clock,
        lastDrainWarnPeriodStart: clock, // warned for period 1 already
      },
      now,
    );
    expect(due).toEqual({
      kind: 'warn',
      updates: { lastDrainWarnPeriodStart: clock + SIX_HOURS },
    });
  });

  it('never warns for a cleaned poop or a stopped clock', () => {
    const now = Date.now();
    const clock = now - (SIX_HOURS - 20 * 60000);
    const cleaned = {
      ...basePoop, scheduled: [clock], shown: [0], completed: [0], penaltyClockAt: clock,
    };
    expect(computeDuePoopNotification(cleaned, now)).toBeNull();
    const stopped = { ...basePoop, scheduled: [clock], shown: [0], penaltyClockAt: 0 };
    expect(computeDuePoopNotification(stopped, now)).toBeNull();
  });
});

describe('/api/subscribe — poop resync merge', () => {
  function makeEnv(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    return {
      PUSH_SUBSCRIPTIONS: {
        get: async (k: string) => store.get(k) ?? null,
        put: async (k: string, v: string) => { store.set(k, v); },
        delete: async (k: string) => { store.delete(k); },
      },
      store,
    };
  }

  const sub = {
    endpoint: 'https://push.example/abc',
    keys: { p256dh: 'pk', auth: 'ak' },
  };

  async function postJSON(env: ReturnType<typeof makeEnv>, body: unknown) {
    const request = new Request('https://digiapp.test/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return onRequestPost({ request, env });
  }

  it("a poop-only resync keeps the worker's dedupe markers and the stored name/language", async () => {
    const env = makeEnv();
    // 1. full subscribe
    await postJSON(env, {
      ...sub,
      digimonName: 'Agumon',
      language: 'pt-BR',
      poop: { scheduled: [111], shown: [], completed: [] },
    });
    const key = [...env.store.keys()][0];

    // 2. worker stamps its dedupe markers into KV
    const withMarkers = JSON.parse(env.store.get(key)!);
    withMarkers.poop.lastAppearNotifiedAt = 111;
    withMarkers.poop.lastDrainWarnPeriodStart = 222;
    env.store.set(key, JSON.stringify(withMarkers));

    // 3. client resyncs poop state only (no name/language, no markers)
    await postJSON(env, {
      ...sub,
      poop: { scheduled: [111], shown: [0], completed: [], penaltyClockAt: 333 },
    });

    const stored = JSON.parse(env.store.get(key)!);
    expect(stored.digimonName).toBe('Agumon');
    expect(stored.language).toBe('pt-BR');
    expect(stored.poop.shown).toEqual([0]);
    expect(stored.poop.penaltyClockAt).toBe(333);
    expect(stored.poop.lastAppearNotifiedAt).toBe(111);
    expect(stored.poop.lastDrainWarnPeriodStart).toBe(222);
  });

  it('a subscribe without poop keeps the previously synced poop state', async () => {
    const env = makeEnv();
    await postJSON(env, { ...sub, poop: { scheduled: [111], shown: [0] } });
    const key = [...env.store.keys()][0];

    await postJSON(env, { ...sub, digimonName: 'Gabumon', language: 'en-US' });

    const stored = JSON.parse(env.store.get(key)!);
    expect(stored.digimonName).toBe('Gabumon');
    expect(stored.poop).toEqual({ scheduled: [111], shown: [0] });
  });
});
