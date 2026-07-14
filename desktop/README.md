# DigiApp Desktop — pet overlay na barra de tarefas (Windows)

Versão desktop do DigiApp no estilo **Bongo Cat / Taskbar Hero**: o pet vive
numa faixa transparente rente à barra de tarefas do Windows, **sempre por cima
de todas as janelas**, andando de um lado para o outro e soltando frases de vez
em quando. A janela é *click-through* — cliques atravessam para o que estiver
embaixo — **exceto** quando o mouse está sobre o pet.

Clicar no pet abre uma **janela separada, estilo Windows 98** (`menu.html`),
com uma barra de título de verdade (⚙ configurações, `_` minimizar, `✕`
fechar o app):

- 🫶 **Fazer carinho** (chuva de corações; cura +0.5 ❤️, máx. 1×/dia — mesma regra do mobile)
- 🍎 **Alimentar** (gasta 1 comida do bolso; +1 ⚡; máx. 5/hora — mesma regra do mobile)
- 🚿 **Dar banho**
- 💤 **Colocar pra dormir / Acordar**
- ✅ **Tarefas** — marcar como feita (**dá +1 comida**) / desmarcar / excluir
- ➕ **Nova tarefa**
- ⚙️ **Configurações** — e-mail de sincronização (leitura do save real), trocar
  o Digimon manualmente, idioma PT/EN, abrir o DigiApp completo

Os botões da barra de título:

- **⚙ (engrenagem)** — atalho pro painel de Configurações.
- **`_` (minimizar)** — minimiza só essa janela pra barra de tarefas do Windows.
- **`✕` (fechar)** — fecha o **app inteiro** (overlay + bandeja), não só a janela.

Na bandeja do sistema (ícone ao lado do relógio): mostrar/ocultar o pet, abrir
o menu, abrir o DigiApp completo e sair.

## Rodar em desenvolvimento (Windows)

```bash
cd desktop
npm install
npm run dev        # builda o renderer (Vite) e abre o Electron
```

## Gerar o instalador

```bash
cd desktop
npm run dist            # gera o NSIS installer em desktop/release/ (não publica)
npm run dist:publish    # idem, e publica/atualiza o GitHub Release (fonte do auto-update)
```

Também há CI: o workflow `.github/workflows/desktop-build.yml` builda no push
(quando `desktop/**` muda), publica/atualiza um GitHub Release (precisa de
`permissions: contents: write`, já configurado) e sobe o `.exe` como artefato
em `github.com/HexerVoodoom/DigiApp/actions` também, pra conferência manual.

**Auto-update**: o app usa `electron-updater` — baixa uma versão nova sozinho
em segundo plano e instala na próxima vez que o app fechar
(`autoInstallOnAppQuit`). Nunca é preciso baixar o instalador manualmente de
novo. O updater só considera "nova" uma versão cujo número seja maior que o
instalado — **bump o campo `version` em `desktop/package.json`** antes de um
push que deva chegar como atualização aos usuários.

## Arquitetura

```
desktop/
├── electron/
│   ├── main.js      # overlay (transparente, always-on-top, click-through) + janela de menu + bandeja + auto-update
│   └── preload.js   # expõe window.digiDesktop (setInteractive/openMenu/minimizeMenu/openFullApp/quit/eventos)
└── renderer/
    ├── index.html   # janela do overlay (faixa que anda)
    ├── menu.html     # janela de menu (estilo Windows 98)
    └── src/
        ├── main.ts      # overlay: caminhada, balão de falas, escuta efeitos/updates
        ├── menu.ts      # janela de menu: painéis (ações/tarefas/configurações)
        ├── win98.css    # tema visual Windows 98 (só da janela de menu)
        ├── style.css    # estilos do overlay (pet/balão/fx)
        ├── state.ts     # estado local (localStorage digiapp_desktop_v1)
        ├── cloudSync.ts # leitura do GameState real via /api/save?id=sha256(email)
        ├── phrases.ts   # falas PT-BR + EN
        └── sprites.ts   # reaproveita STAGE_SPRITES de src/utils/sprites.ts (+ GIF próprio do desktop)
```

Overlay e menu são **janelas/processos separados** — só se falam por IPC via
`window.digiDesktop`: `state-changed` avisa a outra janela pra recarregar o
localStorage (ex.: trocou o Digimon nas Configurações, o overlay atualiza o
sprite na hora); `pet-effect` manda o menu pedir pro overlay tocar a animação
de uma ação (o pet visível é a faixa, a janela de menu não anima nada sozinha).

Pontos técnicos:

- A faixa cobre a largura do monitor primário, ancorada no topo da barra de
  tarefas (`screen.workArea`). Reposiciona sozinha se a resolução ou a barra
  mudarem (`display-metrics-changed`).
- `setIgnoreMouseEvents(true, { forward: true })` mantém o overlay
  atravessável; o renderer detecta *hover* sobre `[data-hit]` (o pet) e liga a
  interatividade via IPC. O `forward: true` é um recurso do Windows — por isso
  o alvo v1 é só Windows, como combinado.
- A janela de menu usa `frame: false` + chrome desenhado em CSS (`win98.css`);
  arrasta pela barra de título via `-webkit-app-region: drag` (com `no-drag`
  nos botões).
- Sprites olham para a esquerda por padrão; andar para a direita = `scaleX(-1)`.
- `sprites.ts` importa `STAGE_SPRITES` de `../../../src/utils/sprites.ts`
  (todas as formas do jogo, não só um subconjunto) — precisa do alias
  `figma:asset/<hash>.png`, gerado automaticamente em `vite.config.ts` a
  partir dos arquivos hash-nomeados em `src/assets/` (evita duplicar a lista
  gigante que existe no `vite.config.ts` da raiz).
- "Abrir DigiApp completo" abre o app web de produção
  (`digiapp-a5e.pages.dev`) numa janela normal — logando com o mesmo e-mail,
  o **cloud save já sincroniza** essa janela com o celular hoje.

## 📡 Radar / Roadmap

### Sincronização mobile ↔ desktop (parcial — leitura já existe)

A aba Configurações já lê o save real (`cloudSync.ts` → `GET
/api/save?id=sha256(email)`, mesmo mecanismo do `src/utils/cloudSave.ts`) e
usa `evolutionStage`/`healthPoints` só pra mostrar o Digimon e o HP corretos.
O que falta pra sincronização **completa** (mexeu num, continua no outro):

1. **Overlay escreve de volta**: as ações do menu (carinho/comida/tarefas)
   ainda mexem só no estado local (`digiapp_desktop_v1`) — falta aplicar
   mutações compatíveis com as regras do jogo e salvar via `POST` (com
   debounce, como o app faz).
2. **Pré-requisito de engenharia**: extrair as regras usadas pelo overlay
   (alimentar, carinho, tarefa concluída → comida) para módulos puros
   compartilhados (hoje parte disso vive em `src/App.tsx`), para mobile e
   desktop aplicarem exatamente a mesma lógica.
3. **Conflitos**: last-write-wins é o comportamento atual do KV; pro overlay
   basta recarregar o estado antes de aplicar uma ação. Se um dia houver
   edição simultânea de verdade, considerar um campo `updatedAt` e merge por
   seção.
4. Enquanto isso, o estado de ações do overlay continua **local e separado**
   de propósito, para nunca corromper o save real com uma mutação incompatível.

### Outras ideias no radar

- Reagir ao teclado/mouse como o Bongo Cat (contagem de teclas = pontinhos de
  atributo?) — precisa de hook global (ex.: `uiohook-napi`), avaliar custo.
- Notificações nativas do Windows (cocô/energia) via o mesmo push scheduler.
- Multi-monitor: escolher em qual tela o pet anda.
- Auto-start com o Windows (`app.setLoginItemSettings`).
- Assinatura de código (`CSC_*`) pra sumir com o aviso de "editor desconhecido"
  do SmartScreen — hoje o build é intencionalmente não assinado.
- macOS/Linux depois (o `forward: true` do click-through é Windows-only;
  nos outros SOs a técnica é outra).
