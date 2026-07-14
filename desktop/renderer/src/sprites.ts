// Sprites DMC (128×128, frame único, virados para a ESQUERDA) — os mesmos
// arquivos reais do app web em src/assets/*_dmc.png.
const modules = import.meta.glob<string>('../../../src/assets/*_dmc.png', {
  eager: true,
  import: 'default',
});

export const PET_SPRITES: Record<string, string> = {};
for (const [file, url] of Object.entries(modules)) {
  const name = file.replace(/^.*\//, '').replace(/_dmc\.png$/, '');
  PET_SPRITES[name] = url;
}

export const PET_NAMES = Object.keys(PET_SPRITES).sort();

export const DEFAULT_PET = 'triceramon';

export function petSprite(name: string): string {
  return PET_SPRITES[name] ?? PET_SPRITES[DEFAULT_PET];
}

/** Nome de exibição: "triceramon" → "Triceramon". */
export function petLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
