// Sincronização (somente leitura, v1) com o cloud save do app mobile/web —
// mesmo mecanismo de src/utils/cloudSave.ts: e-mail -> SHA-256 -> saveId, GET
// em /api/save. Aqui só LEMOS o GameState real para mostrar o Digimon e o HP
// corretos no overlay; escrever ações de volta (comida/tarefas/carinho) fica
// pro roadmap descrito em desktop/README.md.
const FULL_APP_URL = 'https://digiapp-a5e.pages.dev';

// Espelha getMaxHPForStage (src/contexts/GameStateContext.tsx) — ver tabela
// "Estágios/HP máx" no CLAUDE.md raiz.
const MAX_HP_BY_LEVEL: Record<string, number> = {
  digiegg: 1,
  'baby-i': 1,
  'baby-ii': 2,
  rookie: 3,
  champion: 3,
  ultimate: 3,
  mega: 4,
  ultra: 5,
};

// Não importamos types/progression.ts (o desktop é TS puro, sem depender do
// bundle do app web) — replicamos só o mapeamento estágio de nome -> nível
// que já existe em CLAUDE.md/progression.ts, o suficiente pro HP máximo.
const LEVEL_BY_STAGE: Record<string, string> = {
  digiegg: 'digiegg',
  botamon: 'baby-i', poyomon: 'baby-i', punimon: 'baby-i', yuramon: 'baby-i',
  koromon: 'baby-ii', tsunomon: 'baby-ii', tanemon: 'baby-ii', pyokomon: 'baby-ii', tokomon: 'baby-ii',
  agumon: 'rookie', gabumon: 'rookie', patamon: 'rookie', piyomon: 'rookie', tentomon: 'rookie', palmon: 'rookie', betamon: 'rookie',
  greymon: 'champion', garurumon: 'champion', meramon: 'champion', devimon: 'champion', angemon: 'champion', birdramon: 'champion', kabuterimon: 'champion', seadramon: 'champion', airdramon: 'champion', ogremon: 'champion', kuwagamon: 'champion', numemon: 'champion',
  metalgreymon: 'ultimate', weregarurumon: 'ultimate', monzaemon: 'ultimate', etemon: 'ultimate', andromon: 'ultimate', megadramon: 'ultimate', vademon: 'ultimate', nanimon: 'ultimate',
  wargreymon: 'mega', metalgarurumon: 'mega',
};

export async function emailToSaveId(email: string): Promise<string> {
  const norm = email.trim().toLowerCase();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`digiapp:${norm}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export interface RemotePetSnapshot {
  pet: string;
  hearts: number;
  maxHearts: number;
}

/** Busca o save real na nuvem e extrai só o que o overlay precisa mostrar. */
export async function fetchRemoteSnapshot(email: string): Promise<RemotePetSnapshot | null> {
  const saveId = await emailToSaveId(email);
  const res = await fetch(`${FULL_APP_URL}/api/save?id=${saveId}`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.found || !data.state) return null;

  const state = data.state as { evolutionStage?: string; healthPoints?: number };
  const stage = state.evolutionStage ?? 'digiegg';
  const level = LEVEL_BY_STAGE[stage] ?? 'rookie';
  return {
    pet: stage,
    hearts: typeof state.healthPoints === 'number' ? state.healthPoints : 1,
    maxHearts: MAX_HP_BY_LEVEL[level] ?? 3,
  };
}
