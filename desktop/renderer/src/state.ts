// Estado local do overlay (v1). Fica num namespace PRÓPRIO do desktop
// (digiapp_desktop_v1) de propósito: quando a sincronização chegar (ver
// desktop/README.md), a fonte da verdade passa a ser o GameState do cloud
// save (functions/api/save.js) e este módulo vira só um cache.
import { DEFAULT_PET } from './sprites';

export interface DesktopTask {
  id: string;
  name: string;
  completed: boolean;
  createdAt: string;
}

export interface DesktopState {
  pet: string;
  language: 'pt-BR' | 'en';
  tasks: DesktopTask[];
  sleeping: boolean;
  /** Timestamps (ms) das últimas comidas — janela deslizante de 5/hora, igual ao mobile. */
  feedTimes: number[];
  /** Comida no bolso: ganha 1 por tarefa concluída, gasta 1 ao alimentar. */
  food: number;
  hearts: number;
  maxHearts: number;
  energy: number;
  maxEnergy: number;
  /** Dia (YYYY-MM-DD) em que o carinho já curou — máx. 1×/dia, igual ao mobile. */
  rubHealDay: string | null;
  /** E-mail usado pro cloud save (mesmo do app mobile/web) — null = nunca configurado. */
  syncEmail: string | null;
  /** ISO da última vez que puxamos o GameState real da nuvem. */
  lastSyncAt: string | null;
}

const KEY = 'digiapp_desktop_v1';

// Regras espelhadas do mobile (CLAUDE.md): 5 comidas/hora, carinho cura 1×/dia.
export const FOOD_LIMIT_PER_HOUR = 5;
const HOUR = 60 * 60 * 1000;

function defaults(): DesktopState {
  return {
    pet: DEFAULT_PET,
    language: 'pt-BR',
    tasks: [],
    sleeping: false,
    feedTimes: [],
    food: 3,
    hearts: 3,
    maxHearts: 3,
    energy: 0,
    maxEnergy: 4,
    rubHealDay: null,
    syncEmail: null,
    lastSyncAt: null,
  };
}

export function loadState(): DesktopState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<DesktopState>;
    // Campos novos entram com fallback (mesma convenção do cloud save do app).
    return { ...defaults(), ...parsed };
  } catch {
    return defaults();
  }
}

export function saveState(state: DesktopState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Sem espaço/modo privado: segue só em memória.
  }
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Quantas comidas ainda cabem na janela de 1h. */
export function feedsLeft(state: DesktopState, now = Date.now()): number {
  state.feedTimes = state.feedTimes.filter((t) => now - t < HOUR);
  return Math.max(0, FOOD_LIMIT_PER_HOUR - state.feedTimes.length);
}

export function newTaskId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
