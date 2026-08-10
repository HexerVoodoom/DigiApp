import type { GameState } from '../contexts/GameStateContext';
import type { Language } from '../utils/i18n';

interface ActivityConfirmModalProps {
  pending: NonNullable<GameState['pendingActivityCheck']>;
  onConfirm: (confirmed: boolean) => void;
  language: Language;
  theme?: 'default' | 'win98' | 'glitch';
}

/**
 * "Did you do yesterday's activities?" — shown at the day turn ONLY when
 * hearts would be lost, so forgetting to open the app and check tasks off
 * doesn't cost HP unfairly. Only ever asks about the single day right
 * before it appeared; see useDailyReset.ts for the resolution rules.
 * Layout uses INLINE styles — see CLAUDE.md footgun #1 (index.css is the
 * only bundled CSS; arbitrary Tailwind utilities don't apply).
 */
export function ActivityConfirmModal({ pending, onConfirm, language, theme = 'default' }: ActivityConfirmModalProps) {
  const isPt = language === 'pt-BR';
  const isWin98 = theme === 'win98';
  const isGlitch = theme === 'glitch';
  const mono = { fontFamily: 'monospace' as const };

  const palette = isGlitch
    ? { bg: '#0a0a0a', border: '2px solid #00ffff', text: '#00ffff', sub: '#5fbcbc', headBg: '#0a0a0a' }
    : isWin98
      ? { bg: '#c0c0c0', border: '2px solid #000080', text: '#000000', sub: '#444444', headBg: '#000080' }
      : { bg: '#ffffff', border: '1px solid #e5e7eb', text: '#111827', sub: '#6b7280', headBg: '#f9fafb' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 205, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 320, background: palette.bg, border: palette.border, borderRadius: isWin98 ? 0 : 14, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 14px', background: palette.headBg, textAlign: 'center' }}>
          <span style={{ ...mono, fontSize: '1rem', fontWeight: 700, color: isWin98 ? '#ffffff' : palette.text }}>
            {isPt ? '🤔 Você fez as atividades ontem?' : "🤔 Did you do yesterday's activities?"}
          </span>
        </div>

        <div style={{ padding: '16px 20px 4px' }}>
          <p style={{ ...mono, fontSize: '0.78rem', color: palette.sub, lineHeight: 1.5, margin: 0 }}>
            {isPt
              ? `Você marcou ${pending.dailyDone} de ${pending.dailyGoal} tarefas ontem. Se você fez de verdade mas esqueceu de marcar no app, toque em "Sim" — assim seu Digimon não perde coração injustamente.`
              : `You checked off ${pending.dailyDone} of ${pending.dailyGoal} tasks yesterday. If you actually did them but forgot to mark them in the app, tap "Yes" so your Digimon doesn't lose hearts unfairly.`}
          </p>
          {pending.heartsLost > 0 && (
            <p style={{ ...mono, fontSize: '0.7rem', color: palette.sub, paddingTop: 8, margin: 0 }}>
              {isPt
                ? `Se você responder "não fiz", seu Digimon perde ${pending.heartsLost} ${pending.heartsLost === 1 ? 'coração' : 'corações'}.`
                : `If you answer "no", your Digimon loses ${pending.heartsLost} heart${pending.heartsLost === 1 ? '' : 's'}.`}
            </p>
          )}
        </div>

        <div style={{ padding: '14px 20px 18px', display: 'flex', gap: 10 }}>
          <button
            onClick={() => onConfirm(false)}
            style={{
              ...mono, flex: 1, padding: '11px 0', borderRadius: isWin98 ? 0 : 8,
              border: isWin98 ? '2px outset #ffffff' : '1px solid #d1d5db',
              background: isGlitch ? 'transparent' : isWin98 ? '#c0c0c0' : '#f3f4f6',
              color: isGlitch ? '#00ffff' : isWin98 ? '#000000' : '#374151',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            }}
          >
            {isPt ? 'Não fiz' : "Didn't do it"}
          </button>
          <button
            onClick={() => onConfirm(true)}
            style={{
              ...mono, flex: 1, padding: '11px 0', borderRadius: isWin98 ? 0 : 8,
              border: isWin98 ? '2px outset #ffffff' : 'none',
              background: isGlitch ? '#00ffff' : isWin98 ? '#c0c0c0' : '#0d9488',
              color: isGlitch ? '#0a0a0a' : isWin98 ? '#000000' : '#ffffff',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            }}
          >
            {isPt ? 'Sim, fiz!' : 'Yes, I did!'}
          </button>
        </div>
      </div>
    </div>
  );
}
