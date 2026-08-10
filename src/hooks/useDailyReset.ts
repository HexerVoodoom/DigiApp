import { useEffect, useCallback } from 'react';
import { FORM_REQUIREMENTS, MAX_HP_BY_FORM, getStageLevel, canSelectWeekdays, GUARDIAN_HEART_CHARGE_NEEDED } from '../types/progression';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { getNextEvolution } from '../utils/dailyReset';
import { EVO_ITEMS } from '../utils/shop';

interface Step { id: string; label: string; completed: boolean; }
interface Activity {
  id: string;
  category: string;
  steps: Step[];
  weekDays: number[];
  completedToday?: boolean;
  lastCompletedDate?: string;
}
interface Task { id: string; completed: boolean; steps?: Step[]; }

// Snapshot of "yesterday"'s completion, frozen the moment the day turns.
// Kept on GameState (pendingActivityCheck) until the player confirms whether
// they actually did the activities but forgot to check them off — only ever
// refers to the single day immediately before the check, never older ones.
export interface PendingActivityCheck {
  date: string;
  dailyDone: number;
  totalTasks: number;
  dailyGoal: number;
  requiredToday: number;
  heartsLost: number;
  energyWasFull: boolean;
}

interface ResetGameState {
  activities: Activity[];
  tasks: Task[];
  healthPoints: number;
  maxHealthPoints: number;
  energyPoints: number;
  perfectDays: number;
  totalXP: number;
  virusPoints: number;
  dataPoints: number;
  vaccinePoints: number;
  evolutionStage: string;
  eggType?: 'tapirmon' | 'veemon' | 'salamon';
  unlockedEvolutions: string[];
  currentBranch: 'virus' | 'data' | 'vaccine';
  maxActivityCap: number;
  lastResetDate: string;
  attributesSinceLastEvolution: { virus: number; data: number; vaccine: number };
  poopEventsShown: number[];
  poopEventsCompleted: number[];
  equippedEvoItem?: string | null;
  guardianHeartCharge?: number;
  pendingActivityCheck?: PendingActivityCheck | null;
  evolutionLocked?: boolean;
  totalPerfectDays?: number;
  foodInventory?: Record<string, number>;
}

type Attr = 'virus' | 'data' | 'vaccine';
type EggLine = 'tapirmon' | 'veemon' | 'salamon';

// Estágios por linha, agrupados por tier e atributo — usados na degeneração
const LINE_STAGES: Record<EggLine, {
  babyI: string; babyII: string; rookie: string;
  champion: Record<Attr, string>;
  ultimate: Record<Attr, string>;
  mega: Record<Attr, string>;
  ultra: string;
}> = {
  tapirmon: {
    babyI: 'pichimon', babyII: 'pukamon', rookie: 'tapirmon',
    champion: { virus: 'tuskmon', data: 'monochromon', vaccine: 'bakemon' },
    ultimate: { virus: 'gigadramon', data: 'triceramon', vaccine: 'digitamamon' },
    mega: { virus: 'gaioumon', data: 'ultimatebrachiomon', vaccine: 'titamon' },
    ultra: 'gaioumon-itto',
  },
  veemon: {
    babyI: 'chicomon', babyII: 'chibimon', rookie: 'veemon',
    champion: { data: 'exveemon', virus: 'veedramon', vaccine: 'flamedramon' },
    ultimate: { data: 'paildramon', virus: 'aeroveedramon', vaccine: 'raidramon' },
    mega: { data: 'imperialdramon', virus: 'ulforceveedramon', vaccine: 'magnamon' },
    ultra: 'imperialdramon-paladin',
  },
  salamon: {
    babyI: 'yukimibotamon', babyII: 'nyaromon', rookie: 'plotmon',
    champion: { vaccine: 'gatomon', virus: 'gatomon-black', data: 'mikemon' },
    ultimate: { vaccine: 'angewomon', virus: 'ladydevimon', data: 'nefertimon' },
    mega: { vaccine: 'ophanimon', virus: 'lilithmon', data: 'holydramon' },
    ultra: 'mastemon',
  },
};

// Degeneração: retorna a forma anterior, ciente da linha (eggType) e do atributo da forma atual
function getDegeneratedStage(stage: string, eggType: EggLine | undefined, currentBranch: Attr): string {
  const line = LINE_STAGES[eggType ?? 'tapirmon'] ?? LINE_STAGES.tapirmon;
  const level = getStageLevel(stage);
  const attrOf = (s: string): Attr => {
    for (const a of ['virus', 'data', 'vaccine'] as Attr[]) {
      if (line.champion[a] === s || line.ultimate[a] === s || line.mega[a] === s) return a;
    }
    return currentBranch;
  };
  switch (level) {
    case 'ultra':     return line.mega[currentBranch];
    case 'mega':      return line.ultimate[attrOf(stage)];
    case 'ultimate':  return line.champion[attrOf(stage)];
    case 'champion':  return line.rookie;
    case 'rookie':    return line.babyII;
    case 'baby-ii':   return line.babyI;
    case 'baby-i':    return 'digiegg';
    default:          return 'digiegg';
  }
}

// Pure computation of "yesterday"'s completion stats — no state mutation.
// Always evaluates the single calendar day immediately before "now", exactly
// like before: if the app wasn't opened for several days, only the most
// recent one is ever assessed.
function computeYesterdayStats(prev: ResetGameState): PendingActivityCheck {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = yesterday.toDateString();
  const yesterdayWeekDay = yesterday.getDay();

  const currentLevel = getStageLevel(prev.evolutionStage);
  const requirements = FORM_REQUIREMENTS[currentLevel];
  const requiredToday = requirements.required;

  let dailyDone = 0;
  const availableActivities = !canSelectWeekdays(prev.evolutionStage)
    ? prev.activities
    : prev.activities.filter((a: Activity) => a.weekDays?.includes(yesterdayWeekDay));

  availableActivities.forEach((activity: Activity) => {
    let isComplete = false;
    if (activity.steps.length > 0) {
      isComplete = activity.steps.every(s => s.completed);
    } else {
      isComplete = !!activity.completedToday && activity.lastCompletedDate === yesterdayString;
    }
    if (isComplete) dailyDone++;
  });

  dailyDone += prev.tasks.filter((t: Task) => t.completed).length;

  // Daily goal = min(registered, stage requirement) — finishing everything you
  // registered counts, and the stage requirement is the ceiling.
  const totalTasks = availableActivities.length + prev.tasks.length;
  const dailyGoal = Math.min(totalTasks, requiredToday);
  const energyWasFull = (prev.energyPoints ?? 0) >= requiredToday;

  const completionRatio = dailyGoal > 0 ? Math.min(1, dailyDone / dailyGoal) : 1;
  const heartsLost = Math.floor((1 - completionRatio) * prev.maxHealthPoints);

  return { date: yesterdayString, dailyDone, totalTasks, dailyGoal, requiredToday, heartsLost, energyWasFull };
}

interface PopupHandlers {
  hasShownRookiePopup: boolean;
  setShowRookieUnlockPopup: (v: boolean) => void;
  setHasShownRookiePopup: (v: boolean) => void;
}

// Applies the consequences of a day's outcome (HP loss, perfect-day streak,
// evolution, HP-0 degeneration, 💚 Coração Verde) on top of `prev`, given a
// frozen stats snapshot. When `confirmed` is true (player confirmed they DID
// do yesterday's activities, just forgot to check them off) the day is
// treated as if the daily goal had been met — no heart loss, and it can still
// count as perfect if energy was also full that day.
function applyDayOutcome(
  prev: ResetGameState,
  stats: PendingActivityCheck,
  confirmed: boolean,
  { hasShownRookiePopup, setShowRookieUnlockPopup, setHasShownRookiePopup }: PopupHandlers,
) {
  const { requiredToday, dailyGoal, totalTasks, energyWasFull } = stats;
  const dailyDone = confirmed ? Math.max(stats.dailyDone, dailyGoal) : stats.dailyDone;
  const requirements = FORM_REQUIREMENTS[getStageLevel(prev.evolutionStage)];

  const dayWasPerfect = totalTasks > 0 && dailyDone >= dailyGoal && energyWasFull;

  let newHP = prev.healthPoints;
  let newPerfectDays = prev.perfectDays;
  let newEvolutionStage = prev.evolutionStage;
  let finalUnlockedEvolutions = [...prev.unlockedEvolutions];
  let wasDegeneratedByHP = false;
  let guardianHeartUsed = false;
  let newGuardianHeartCharge = prev.guardianHeartCharge ?? 0;
  let usedEvoItem = false;
  let newMaxActivityCap = prev.maxActivityCap;
  let newCurrentBranch = prev.currentBranch as 'virus' | 'data' | 'vaccine';
  let newRecentAttrs = {
    virus: prev.attributesSinceLastEvolution?.virus ?? 0,
    data: prev.attributesSinceLastEvolution?.data ?? 0,
    vaccine: prev.attributesSinceLastEvolution?.vaccine ?? 0,
  };

  // HP penalty: proportional to the tasks NOT done, measured against the
  // same daily goal. A confirmed "I actually did it" clears it to 0.
  const completionRatio = dailyGoal > 0 ? Math.min(1, dailyDone / dailyGoal) : 1;
  const heartsLost = Math.floor((1 - completionRatio) * prev.maxHealthPoints);
  if (heartsLost > 0) {
    newHP = Math.max(0, prev.healthPoints - heartsLost);
  }

  if (dayWasPerfect) {
    newPerfectDays++;
    newGuardianHeartCharge = Math.min(GUARDIAN_HEART_CHARGE_NEEDED, newGuardianHeartCharge + 1);
  } else {
    newPerfectDays = Math.max(0, prev.perfectDays - 1);
  }

  let returnedDigimentalEmoji: string | null = null;
  if (!prev.evolutionLocked && newPerfectDays >= requirements.required) {
    newPerfectDays = 0;

    const recentV = newRecentAttrs.virus;
    const recentD = newRecentAttrs.data;
    const recentVac = newRecentAttrs.vaccine;
    const dominantAttr = Math.max(recentV, recentD, recentVac);
    let branch = prev.currentBranch as 'virus' | 'data' | 'vaccine';
    if (dominantAttr > 0) {
      if (recentV === dominantAttr) branch = 'virus';
      else if (recentD === dominantAttr) branch = 'data';
      else branch = 'vaccine';
    }
    newCurrentBranch = branch;

    newRecentAttrs = { virus: 0, data: 0, vaccine: 0 };

    const isBabyII = ['pukamon', 'chibimon', 'nyaromon'].includes(prev.evolutionStage);
    newEvolutionStage = getNextEvolution(
      prev.evolutionStage,
      prev.eggType ?? 'tapirmon',
      branch,
      prev.unlockedEvolutions,
    );
    const naturalNext = newEvolutionStage;
    const evoItem = prev.equippedEvoItem ? EVO_ITEMS[prev.equippedEvoItem] : null;
    if (evoItem?.evoTarget && getStageLevel(naturalNext) === evoItem.evoLevel && naturalNext !== prev.evolutionStage) {
      newEvolutionStage = evoItem.evoTarget;
      usedEvoItem = true;
      if (evoItem.consumedOnEvolve === false && evoItem.inventoryEmoji) {
        returnedDigimentalEmoji = evoItem.inventoryEmoji;
      }
    }
    if (isBabyII && !hasShownRookiePopup) {
      setShowRookieUnlockPopup(true);
      setHasShownRookiePopup(true);
      localStorage.setItem(STORAGE_KEYS.ROOKIE_POPUP_SHOWN, 'true');
    }

    const newStageLevel = getStageLevel(newEvolutionStage);
    newHP = MAX_HP_BY_FORM[newStageLevel];
    const newCap = FORM_REQUIREMENTS[newStageLevel].cap;
    if (newCap > newMaxActivityCap) newMaxActivityCap = newCap;

    if (!finalUnlockedEvolutions.includes(naturalNext)) {
      finalUnlockedEvolutions.push(naturalNext);
    }
  }

  if (newHP === 0) {
    if (newGuardianHeartCharge >= GUARDIAN_HEART_CHARGE_NEEDED) {
      guardianHeartUsed = true;
      newGuardianHeartCharge = 0;
      newHP = 1;
    } else {
      wasDegeneratedByHP = true;
      newEvolutionStage = getDegeneratedStage(prev.evolutionStage, prev.eggType, newCurrentBranch);

      const degeneratedLevel = getStageLevel(newEvolutionStage);
      newHP = MAX_HP_BY_FORM[degeneratedLevel];
      newPerfectDays = Math.floor(FORM_REQUIREMENTS[degeneratedLevel].required / 2);
      newRecentAttrs = { virus: 0, data: 0, vaccine: 0 };
    }
  }

  const finalStageLevel = getStageLevel(newEvolutionStage);
  const newMaxHP = MAX_HP_BY_FORM[finalStageLevel];

  return {
    healthPoints: newHP,
    maxHealthPoints: newMaxHP,
    perfectDays: newPerfectDays,
    evolutionStage: newEvolutionStage,
    currentBranch: newCurrentBranch,
    unlockedEvolutions: finalUnlockedEvolutions,
    degeneratedByHP: wasDegeneratedByHP,
    guardianHeartCharge: newGuardianHeartCharge,
    lastDayWasPerfect: dayWasPerfect,
    totalPerfectDays: (prev.totalPerfectDays ?? 0) + (dayWasPerfect ? 1 : 0),
    maxActivityCap: newMaxActivityCap,
    attributesSinceLastEvolution: newRecentAttrs,
    equippedEvoItem: usedEvoItem ? null : (prev.equippedEvoItem ?? null),
    ...(returnedDigimentalEmoji && {
      foodInventory: {
        ...prev.foodInventory,
        [returnedDigimentalEmoji]: (prev.foodInventory?.[returnedDigimentalEmoji] ?? 0) + 1,
      },
    }),
    lastDayReport: {
      date: stats.date,
      done: dailyDone,
      total: totalTasks,
      required: dailyGoal,
      heartsLost,
      wasPerfect: dayWasPerfect,
      energyWasFull,
      perfectDays: newPerfectDays,
      degenerated: wasDegeneratedByHP,
      guardianHeartUsed,
      activityCheckConfirmed: confirmed && stats.heartsLost > 0 ? true : undefined,
    },
  };
}

interface UseDailyResetProps {
  gameState: ResetGameState;
  setGameState: (fn: (prev: any) => any) => void;
  hasShownRookiePopup: boolean;
  setShowRookieUnlockPopup: (v: boolean) => void;
  setHasShownRookiePopup: (v: boolean) => void;
}

export function useDailyReset({
  gameState,
  setGameState,
  hasShownRookiePopup,
  setShowRookieUnlockPopup,
  setHasShownRookiePopup,
}: UseDailyResetProps) {
  const popupHandlers = { hasShownRookiePopup, setShowRookieUnlockPopup, setHasShownRookiePopup };

  const performDailyReset = useCallback(() => {
    setGameState(prev => {
      // Mechanical reset — always happens on the calendar day turn, whether
      // or not yesterday's outcome is still awaiting confirmation.
      const resetActivities = prev.activities.map((activity: Activity) => ({
        ...activity,
        steps: activity.steps.map(step => ({ ...step, completed: false })),
        completedToday: false,
      }));
      const resetTasks = prev.tasks.map((task: Task) => ({ ...task, completed: false }));
      const mechanical = {
        activities: resetActivities,
        tasks: resetTasks,
        lastResetDate: new Date().toDateString(),
        digivolutionSegments: 0,
        digivolutionSegmentsNeeded: 999,
        poopEventsScheduled: [],
        poopEventsCompleted: [],
        poopEventsShown: [],
        poopPenaltyClockAt: 0,
        energyPoints: 0,
      };

      // A pending "did you do yesterday's activities?" check only ever covers
      // the single day right before it was raised. If the player didn't
      // answer before ANOTHER day turn happened, that window is gone — settle
      // it now as "not confirmed" (the originally computed penalty applies)
      // before evaluating the new "yesterday".
      let base: ResetGameState = prev;
      if (prev.pendingActivityCheck) {
        base = { ...prev, ...applyDayOutcome(prev, prev.pendingActivityCheck, false, popupHandlers) };
      }

      const stats = computeYesterdayStats(base);

      if (stats.heartsLost > 0) {
        return { ...base, ...mechanical, pendingActivityCheck: stats };
      }

      const outcome = applyDayOutcome(base, stats, false, popupHandlers);
      return { ...base, ...mechanical, ...outcome, pendingActivityCheck: null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShownRookiePopup, setShowRookieUnlockPopup, setHasShownRookiePopup]);

  // Answers the "did you do yesterday's activities?" modal: confirmed=true
  // means the player says they actually did them (avoids the heart loss),
  // confirmed=false accepts the originally computed penalty.
  const confirmActivityCheck = useCallback((confirmed: boolean) => {
    setGameState(prev => {
      if (!prev.pendingActivityCheck) return prev;
      const outcome = applyDayOutcome(prev, prev.pendingActivityCheck, confirmed, popupHandlers);
      return { ...prev, ...outcome, pendingActivityCheck: null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShownRookiePopup, setShowRookieUnlockPopup, setHasShownRookiePopup]);

  // Day-rollover check. A 30s cadence is plenty (the reset just needs to land
  // shortly after midnight) and avoids the old 1s ticker that re-rendered the
  // whole app every second for a countdown string nothing displayed.
  useEffect(() => {
    const checkRollover = () => {
      if (new Date().toDateString() !== gameState.lastResetDate) {
        performDailyReset();
      }
    };

    checkRollover();
    const interval = setInterval(checkRollover, 30000);
    return () => clearInterval(interval);
  }, [gameState.lastResetDate, performDailyReset]);

  return { confirmActivityCheck };
}
