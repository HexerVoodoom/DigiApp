// Reaproveita o mapa canônico de sprites do app principal (todas as formas,
// não só as 25 "_dmc") — assim qualquer Digimon que o mobile mostra (ex.:
// triceramon, ultimate da linha principal) também aparece certo no desktop.
// Precisa do alias figma:asset/<hash>.png gerado em vite.config.ts.
import { STAGE_SPRITES } from '../../../src/utils/sprites';
// GIF animado enviado pelo dono do projeto especificamente pro pet do
// desktop (substitui o estático usado no app mobile só nessa tela).
import triceramonGif from '../../../src/assets/triceramon_dpc.gif';

export const PET_SPRITES: Record<string, string> = {
  ...STAGE_SPRITES,
  triceramon: triceramonGif,
};
export const PET_NAMES = Object.keys(PET_SPRITES).sort();

// Pet padrão do overlay antes de sincronizar (ou se a sincronização falhar).
export const DEFAULT_PET = 'triceramon';

export function petSprite(name: string): string {
  return PET_SPRITES[name] ?? PET_SPRITES[DEFAULT_PET];
}

/** Nome de exibição: "agumon" → "Agumon". */
export function petLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
