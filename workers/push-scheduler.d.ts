// Hand-written declarations so vitest/tsc can import the worker's exported
// poop logic from src tests (allowJs is off in tsconfig).
export interface PoopPushRecord {
  scheduled?: number[];
  shown?: number[];
  completed?: number[];
  penaltyClockAt?: number;
  sleeping?: boolean;
  stage?: string;
  lastAppearNotifiedAt?: number;
  lastDrainWarnPeriodStart?: number;
}

export function computeDuePoopNotification(
  poop: PoopPushRecord | null | undefined,
  now: number,
): { kind: 'appear' | 'warn'; updates: Partial<PoopPushRecord> } | null;

declare const worker: {
  scheduled(event: { cron: string; scheduledTime: number }, env: unknown): Promise<void>;
};
export default worker;
