# Sprites animados (GIF) — Digimon Pendulum Color

101 GIFs animados, um por Digimon do dataset `dmc` (Digimon Pendulum Color / "Colored").

Fonte: repo [furudbat/wayland-vpets](https://github.com/furudbat/wayland-vpets),
`assets/dmc/<Nome>.png` — strips de sprite (1 linha × N colunas, N e a largura de
cada frame variam por Digimon; contagem de colunas replicada de
`include/embedded_assets/dmc/dmc.hpp`). Cada strip foi recortado frame a frame e
remontado em GIF animado (150ms/frame, loop infinito, fundo transparente
preservado via paleta indexada).

Estes GIFs não estão importados em nenhum componente ainda — os sprites estáticos
já usados no app (`src/assets/*_dmc.png`, frame 0 de cada strip) continuam sendo
a fonte usada em `src/utils/sprites.ts`.
