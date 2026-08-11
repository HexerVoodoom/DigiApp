import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { DigiAlarm } from '../plugins/DigiAlarmPlugin';
import {
  checkAndShowNotifications, showNotification, subscribeToPush, syncActivityAlarms, syncTaskAlarms,
  unsubscribeFromPush, registerForPushNotifications, unregisterFromPushNotifications,
  syncPushPoopState, syncFcmPoopState, type PoopPushState,
} from '../utils/notifications';
import { getSpriteForStage } from '../utils/sprites';

interface Activity {
  id: string;
  name: string;
  alarm?: { time: string };
  weekDays?: number[];
}

interface Task {
  id: string;
  name: string;
  alarm?: { type: '2h' | '1h' | '30min' | 'custom'; time?: string };
  deadline?: { date: string; time: string };
}

interface NotificationManagerProps {
  activities: Activity[];
  tasks: Task[];
  userName: string;
  digimonName: string;
  evolutionStage: string;
  language: 'pt-BR' | 'en-US';
  enabled: boolean;
  healthPoints: number;
  maxHealthPoints: number;
  completedSteps: number;
  totalRequired: number;
  poop: PoopPushState;
}

export function NotificationManager({
  activities,
  tasks,
  userName,
  digimonName,
  evolutionStage,
  language,
  enabled,
  healthPoints,
  maxHealthPoints,
  completedSteps,
  totalRequired,
  poop,
}: NotificationManagerProps) {
  const petIcon = getSpriteForStage(evolutionStage);
  const lastEveningWarnDate = useRef<string>('');
  const lastNudge10Date = useRef<string>('');
  const lastNudge16Date = useRef<string>('');
  const lastNudge21Date = useRef<string>('');
  const lastGoodnightDate = useRef<string>('');

  // Push subscription — register/unregister when notifications toggle. Native
  // Android uses FCM (the WebView has no Web Push support); browsers/PWA use
  // Web Push VAPID.
  useEffect(() => {
    try {
      const isNativeAndroid = Capacitor.getPlatform() === 'android';

      if (enabled) {
        if (isNativeAndroid) {
          registerForPushNotifications(digimonName, language, (title, body) => {
            toast(title, { description: body });
          }).catch((err) => console.error('registerForPushNotifications failed:', err));
        } else {
          subscribeToPush(digimonName, language, poop).catch((err) => console.error('subscribeToPush failed:', err));
        }
      } else {
        if (isNativeAndroid) {
          unregisterFromPushNotifications().catch((err) => console.error('unregisterFromPushNotifications failed:', err));
        } else {
          unsubscribeFromPush().catch((err) => console.error('unsubscribeFromPush failed:', err));
        }
      }
    } catch (err) {
      // Any native-bridge hiccup here must never crash the whole app render.
      console.error('Push subscription toggle failed:', err);
    }
    // poop is intentionally excluded — the dedicated resync effect below
    // handles it so the pushManager subscription isn't re-created every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, digimonName, language]);

  // Resync poop timing on the server so workers/push-scheduler.js can warn
  // the user (~30min before a heart-drain tick, and when poop appears) even
  // when the app is closed — see CLAUDE.md's 💩 Cocô rule. Keyed off a
  // serialized snapshot (not the array refs, which are new every render).
  const poopKey = JSON.stringify(poop);
  useEffect(() => {
    if (!enabled) return;
    try {
      const isNativeAndroid = Capacitor.getPlatform() === 'android';
      if (isNativeAndroid) {
        syncFcmPoopState(poop).catch((err) => console.error('syncFcmPoopState failed:', err));
      } else {
        syncPushPoopState(poop).catch((err) => console.error('syncPushPoopState failed:', err));
      }
    } catch (err) {
      console.error('Poop push resync failed:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, poopKey]);

  // Sync alarms when activities or tasks change
  useEffect(() => {
    if (!enabled) return;
    try {
      syncActivityAlarms(activities, language);
      syncTaskAlarms(tasks, language);
    } catch (err) {
      console.error('Alarm sync failed:', err);
    }
  }, [activities, tasks, language, enabled]);

  // Check notifications every minute
  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      try {
        checkAndShowNotifications(userName, language, petIcon);
      } catch (err) {
        console.error('checkAndShowNotifications failed:', err);
      }
    };

    run();
    const interval = setInterval(run, 60000);

    return () => clearInterval(interval);
  }, [userName, language, enabled]);

  // Evening HP risk warning — fires once at 20:00 if HP critical and day not complete
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const now = new Date();
      const hh = now.getHours();
      const mm = now.getMinutes();
      const today = now.toDateString();

      if (hh !== 20 || mm !== 0) return;
      if (lastEveningWarnDate.current === today) return;

      const halfRequired = Math.ceil(totalRequired / 2);
      const atRisk = healthPoints <= 1 && healthPoints > 0 && completedSteps < halfRequired;

      if (atRisk) {
        lastEveningWarnDate.current = today;
        const ispt = language === 'pt-BR';
        showNotification(
          ispt ? '⚠️ Seu Digimon está em perigo!' : '⚠️ Your Digimon is in danger!',
          {
            body: ispt
              ? `Complete ao menos ${halfRequired} tarefa(s) hoje ou seu parceiro vai regredir amanhã!`
              : `Complete at least ${halfRequired} task(s) today or your partner will degenerate tomorrow!`,
            tag: 'hp-critical-evening',
            icon: petIcon,
            image: petIcon,
          },
        );
      } else if (!atRisk && healthPoints < maxHealthPoints) {
        lastEveningWarnDate.current = today;
        const ispt = language === 'pt-BR';
        showNotification(
          ispt ? '🌙 Fim do dia!' : '🌙 End of day!',
          {
            body: ispt
              ? `Você tem ${completedSteps}/${totalRequired} tarefas. Continue assim!`
              : `You have ${completedSteps}/${totalRequired} tasks done. Keep it up!`,
            tag: 'evening-reminder',
            icon: petIcon,
            image: petIcon,
          },
        );
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [enabled, healthPoints, maxHealthPoints, completedSteps, totalRequired, language]);

  // Pet reminder notifications — 10h, 16h, 21h (incomplete tasks) + 22h goodnight
  useEffect(() => {
    if (!enabled) return;

    // Native Android: schedule via AlarmManager so they fire even with app closed
    if (Capacitor.isNativePlatform()) {
      try {
        const ispt = language === 'pt-BR';
        const nudgeTitle = ispt ? `📋 ${digimonName} está te chamando!` : `📋 ${digimonName} is calling you!`;
        const nudgeBody = ispt ? 'Você ainda tem tarefas pendentes hoje! Vem cumprir! 💪' : 'You still have pending tasks today! Come finish them! 💪';

        if (completedSteps < totalRequired) {
          DigiAlarm.scheduleAlarm({ id: 'pet-nudge-10', title: nudgeTitle, body: nudgeBody, scheduledTime: '10:00' }).catch(() => {});
          DigiAlarm.scheduleAlarm({ id: 'pet-nudge-16', title: nudgeTitle, body: nudgeBody, scheduledTime: '16:00' }).catch(() => {});
          DigiAlarm.scheduleAlarm({ id: 'pet-nudge-21', title: nudgeTitle, body: nudgeBody, scheduledTime: '21:00' }).catch(() => {});
        } else {
          DigiAlarm.cancelAlarm({ id: 'pet-nudge-10' }).catch(() => {});
          DigiAlarm.cancelAlarm({ id: 'pet-nudge-16' }).catch(() => {});
          DigiAlarm.cancelAlarm({ id: 'pet-nudge-21' }).catch(() => {});
        }

        DigiAlarm.scheduleAlarm({
          id: 'pet-goodnight',
          title: `🌙 ${digimonName} está desejando boa noite`,
          body: ispt ? 'Durma bem! Até amanhã! 😴' : 'Sleep well! See you tomorrow! 😴',
          scheduledTime: '22:00',
        }).catch(() => {});

        // Zera o contador de tarefas do widget na virada do dia (00:01), mesmo com o app fechado.
        // Silencioso (sem notificação) — o receiver nativo já se re-agenda pro dia seguinte sozinho.
        DigiAlarm.scheduleAlarm({
          id: 'widget-daily-reset',
          title: '',
          body: '',
          scheduledTime: '00:01',
          widgetReset: true,
        }).catch(() => {});
      } catch (err) {
        console.error('Native alarm scheduling failed:', err);
      }
    }

    // Web/PWA: poll every minute and fire when the clock hits the target hour
    const checkPetNotifications = () => {
      const now = new Date();
      const hh = now.getHours();
      const mm = now.getMinutes();
      const today = now.toDateString();
      const ispt = language === 'pt-BR';

      // Allow a 1-minute grace window so we don't miss if the interval fires at :01
      if (mm > 1) return;

      // 10:00 — incomplete tasks nudge
      if (hh === 10 && completedSteps < totalRequired && lastNudge10Date.current !== today) {
        lastNudge10Date.current = today;
        showNotification(
          ispt ? `📋 ${digimonName} está te chamando!` : `📋 ${digimonName} is calling you!`,
          { body: ispt ? 'Você ainda tem tarefas pendentes hoje! Vem cumprir! 💪' : 'You still have pending tasks today! Come finish them! 💪', tag: 'pet-nudge-10', icon: petIcon, image: petIcon },
        );
      }

      // 16:00 — incomplete tasks nudge
      if (hh === 16 && completedSteps < totalRequired && lastNudge16Date.current !== today) {
        lastNudge16Date.current = today;
        showNotification(
          ispt ? `📋 ${digimonName} está te chamando!` : `📋 ${digimonName} is calling you!`,
          { body: ispt ? 'Suas tarefas ainda estão esperando! Vem cumprir! 🎯' : 'Your tasks are still waiting! Come finish them! 🎯', tag: 'pet-nudge-16', icon: petIcon, image: petIcon },
        );
      }

      // 21:00 — incomplete tasks nudge (more urgent)
      if (hh === 21 && completedSteps < totalRequired && lastNudge21Date.current !== today) {
        lastNudge21Date.current = today;
        showNotification(
          ispt ? `⏰ ${digimonName} está te chamando!` : `⏰ ${digimonName} is calling you!`,
          { body: ispt ? 'Ainda dá tempo! Complete suas tarefas antes de dormir. 🌙' : 'Still time! Complete your tasks before bed. 🌙', tag: 'pet-nudge-21', icon: petIcon, image: petIcon },
        );
      }

      // 22:00 — goodnight (always fires regardless of tasks)
      if (hh === 22 && lastGoodnightDate.current !== today) {
        lastGoodnightDate.current = today;
        showNotification(
          `🌙 ${digimonName} está desejando boa noite`,
          { body: ispt ? 'Durma bem! Até amanhã! 😴' : 'Sleep well! See you tomorrow! 😴', tag: 'pet-goodnight', icon: petIcon, image: petIcon },
        );
      }
    };

    const runCheckPetNotifications = () => {
      try {
        checkPetNotifications();
      } catch (err) {
        console.error('checkPetNotifications failed:', err);
      }
    };

    runCheckPetNotifications();
    const interval = setInterval(runCheckPetNotifications, 60000);
    return () => clearInterval(interval);
  }, [enabled, digimonName, language, completedSteps, totalRequired]);

  return null;
}
