# DigiApp Desktop — pet overlay na barra de tarefas (Windows)

Versão desktop do DigiApp no estilo **Bongo Cat / Taskbar Hero**: o pet vive
numa faixa transparente rente à barra de tarefas do Windows, **sempre por cima
de todas as janelas**, andando de um lado para o outro e soltando frases de vez
em quando. A janela é *click-through* — cliques atravessam para o que estiver
embaixo — **exceto** quando o mouse está sobre o pet ou sobre o menu.

Clicar no pet abre o menu de ações:

- 🫶 **Fazer carinho** (chuva de corações; cura +0.5 ❤️, máx. 1×/dia — mesma regra do mobile)
- 🍎 **Alimentar** (gasta 1 comida do bolso; +1 ⚡; máx. 5/hora — mesma regra do mobile)
- 🚿 **Dar banho**
- 💤 **Colocar pra dormir / Acordar**
- ✅ **Tarefas** — marcar como feita (**dá +1 comida**) / desmarcar / excluir
- ➕ **Nova tarefa**
- ⚙️ **Opções** — trocar o Digimon (25 sprites DMC), idioma PT/EN, abrir o
  DigiApp completo, fechar o overlay

Na bandeja do sistema (ícone ao lado do relógio): mostrar/ocultar o pet, abrir
o DigiApp completo e sair.

## Rodar em desenvolvimento (Windows)

```bash
cd desktop
npm install
npm run dev        # builda o renderer (Vite) e abre o Electron
```

## Gerar o instalador

```bash
cd desktop
npm run dist       # gera NSIS installer + portable em desktop/release/
```

Também há CI: o workflow `.github/workflows/desktop-build.yml` builda no push
(quando `desktop/**` muda) e publica os `.exe` como artefato em
`github.com/HexerVoodoom/DigiApp/actions`.

## Arquitetura

```
desktop/
├── electron/
│   ├── main.js      # janela overlay (transparente, always-on-top, click-through) + bandeja
│   └── preload.js   # expõe window.digiDesktop (setInteractive/openFullApp/quit)
└── renderer/        # UI do pet (Vite + TS puro, sem React — é só uma faixa)
    └── src/
        ├── main.ts     # caminhada, balão de falas, menu de ações
        ├── state.ts    # estado local (localStorage digiapp_desktop_v1)
        ├── phrases.ts  # falas PT-BR + EN
        └── sprites.ts  # importa os *_dmc.png reais de src/assets (inline base64)
```

Pontos técnicos:

- A faixa cobre a largura do monitor primário, altura 360px, ancorada no topo
  da barra de tarefas (`screen.workArea`). Reposiciona sozinha se a resolução
  ou a barra mudarem (`display-metrics-changed`).
- `setIgnoreMouseEvents(true, { forward: true })` mantém o overlay
  atravessável; o renderer detecta *hover* sobre `[data-hit]` (pet/menu) e
  liga a interatividade via IPC. O `forward: true` é um recurso do Windows —
  por isso o alvo v1 é só Windows, como combinado.
- Sprites DMC olham para a esquerda; andar para a direita = `scaleX(-1)`.
- "Abrir DigiApp completo" abre o app web de produção
  (`digiapp-a5e.pages.dev`) numa janela normal — logando com o mesmo e-mail,
  o **cloud save já sincroniza** essa janela com o celular hoje.

## 📡 Radar / Roadmap

### Sincronização mobile ↔ desktop (prioridade do dono do projeto)

O objetivo: progresso contínuo — mexeu num, continua no outro. O caminho já
existe no backend e **não precisa de servidor novo**:

1. **Fonte da verdade**: o cloud save atual (`functions/api/save.js`,
   Cloudflare KV `DIGIAPP_SAVES`). `saveId = SHA-256 do e-mail`
   (`src/utils/cloudSave.ts`) — mesmo e-mail = mesmo save em qualquer aparelho.
2. **Overlay lê/escreve o GameState real**: o renderer passa a carregar o
   GameState via `GET /api/save?id=…` na abertura (e num intervalo), e as
   ações do menu (carinho/comida/tarefas) aplicam mutações compatíveis com as
   regras do jogo e salvam via `POST` (com debounce, como o app faz).
3. **Pré-requisito de engenharia**: extrair as regras usadas pelo overlay
   (alimentar, carinho, tarefa concluída → comida) para módulos puros
   compartilhados (hoje parte disso vive em `src/App.tsx`), para mobile e
   desktop aplicarem exatamente a mesma lógica.
4. **Conflitos**: last-write-wins é o comportamento atual do KV; para o
   overlay basta recarregar o estado antes de aplicar uma ação. Se um dia
   houver edição simultânea de verdade, considerar um campo `updatedAt` e
   merge por seção.
5. Enquanto isso, o estado do overlay é **local e separado**
   (`digiapp_desktop_v1`) de propósito, para nunca corromper o save real.

### Outras ideias no radar

- Reagir ao teclado/mouse como o Bongo Cat (contagem de teclas = pontinhos de
  atributo?) — precisa de hook global (ex.: `uiohook-napi`), avaliar custo.
- Notificações nativas do Windows (cocô/energia) via o mesmo push scheduler.
- Multi-monitor: escolher em qual tela o pet anda.
- Auto-start com o Windows (`app.setLoginItemSettings`).
- macOS/Linux depois (o `forward: true` do click-through é Windows-only;
  nos outros SOs a técnica é outra).
