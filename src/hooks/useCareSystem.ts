import { useEffect } from 'react';
import { CareEvent, getCareMessage } from '../components/CareSystem';
import { showNotification } from '../utils/notifications';
import type { Language } from '../utils/i18n';
import { getStageLevel } from '../types/progression';

interface CareGameState {
  lastResetDate: string;
  poopEventsScheduled: number[];
  poopEventsCompleted: number[];
  poopEventsShown: number[];
  evolutionStage: string;
  maxHealthPoints: number;
  energyPoints: number;
}

interface UseCareSystemProps {
  gameState: CareGameState;
  careEvent: CareEvent | null;
  setCareEvent: (event: CareEvent | null) => void;
  setMessageTrigger: (fn: (prev: number) => number) => void;
  setGameState: (fn: (prev: any) => any) => void;
  language: Language;
  /** While asleep, poop never appears (sleeping protects against the overnight penalty). */
  isSleeping: boolean;
}

export function useCareSystem({
  gameState,
  careEvent,
  setCareEvent,
  setMessageTrigger,
  setGameState,
  language,
  isSleeping,
}: UseCareSystemProps) {
  // Schedule the day's FIRST poop at a random morning/afternoon time.
  // The second poop is scheduled only once the first actually appears (see the
  // polling loop below), so the ≥8h gap counts from the first poop's appearance.
  useEffect(() => {
    if (['digiegg', 'baby-i'].includes(getStageLevel(gameState.evolutionStage))) return;
    if (gameState.lastResetDate !== new Date().toDateString()) return;

    if (!gameState.poopEventsScheduled || gameState.poopEventsScheduled.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = today.getTime();
      // First poop somewhere between 07:00 and 15:00 — leaves room for the
      // second (8-10h later) to still land within the same day.
      const firstPoopHour = 7 + Math.random() * 8;
      setGameState(prev => ({
        ...prev,
        poopEventsScheduled: [startOfDay + firstPoopHour * 3600000],
      }));
    }
  }, [gameState.lastResetDate, gameState.poopEventsScheduled, gameState.evolutionStage]);

  // careEvent is transient React state, but poopEventsShown/Completed persist.
  // Reconcile the two on load and whenever they change: an uncleaned poop that
  // was on screen when the app closed must come back visible (otherwise the 6h
  // heart drain keeps running on a poop the shower can't reach), and a poop
  // cleared elsewhere (daily reset, cloud load) must take the sprite with it.
  useEffect(() => {
    const scheduled = gameState.poopEventsScheduled || [];
    const shown = gameState.poopEventsShown || [];
    const completed = gameState.poopEventsCompleted || [];
    const uncleanIdx = shown.find(i => !completed.includes(i));

    if (careEvent?.type === 'poop') {
      if (uncleanIdx === undefined) setCareEvent(null);
      return;
    }
    if (!careEvent && uncleanIdx !== undefined) {
      setCareEvent({ type: 'poop', requestTime: scheduled[uncleanIdx] ?? 0, showSprite: true });
    }
  }, [
    careEvent,
    gameState.poopEventsScheduled,
    gameState.poopEventsShown,
    gameState.poopEventsCompleted,
  ]);

  // Check care events and trigger them
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const ispt = language === 'pt-BR';

      // ── Poop events (time-based, never while sleeping; NOT tied to tasks) ───
      // Sleeping holds poop back entirely, so an overnight sleep shields the
      // user from the day-turn penalty. Must run before the food early-return
      // below, which would otherwise block poop when there are no pending tasks.
      if (
        !isSleeping &&
        !['digiegg', 'baby-i'].includes(getStageLevel(gameState.evolutionStage)) &&
        !careEvent
      ) {
        const scheduled = gameState.poopEventsScheduled || [];
        const shown = gameState.poopEventsShown || [];
        for (let index = 0; index < scheduled.length; index++) {
          if (shown.includes(index)) continue;
          if (now >= scheduled[index]) {
            const poopTime = scheduled[index];
            setCareEvent({ type: 'poop', requestTime: poopTime, showSprite: true });
            setMessageTrigger(prev => prev + 1);
            showNotification(
              ispt ? '🚽 Hora de limpar!' : '🚽 Bathroom time!',
              {
                body: ispt
                  ? 'Seu Digimon fez cocô! Dê um banho para limpar. 🚿'
                  : 'Your Digimon pooped! Give it a shower to clean up. 🚿',
                // Same tag as the server push (workers/push-scheduler.js) so
                // the browser collapses the two into one notification.
                tag: 'poop-event',
              },
            );
            setGameState((prev: any) => {
              const newShown = [...(prev.poopEventsShown || []), index];
              let newScheduled = prev.poopEventsScheduled || [];
              // First poop just appeared → schedule the second 8-10h later, so
              // the minimum 8h gap is measured from the first poop's appearance.
              if (index === 0 && newScheduled.length < 2) {
                const secondGapHour = 8 + Math.random() * 2;
                newScheduled = [...newScheduled, now + secondGapHour * 3600000];
              }
              return { ...prev, poopEventsShown: newShown, poopEventsScheduled: newScheduled };
            });
            break; // at most one poop per tick
          }
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [
    gameState.poopEventsScheduled,
    gameState.poopEventsShown,
    gameState.evolutionStage,
    careEvent,
    language,
    isSleeping,
  ]);

  const getCompanionMessageWithCare = (fallbackMessage: string): string => {
    if (careEvent) {
      return getCareMessage(careEvent.type);
    }
    return fallbackMessage;
  };

  return { getCompanionMessageWithCare };
}
