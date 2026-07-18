# DigiApp Desktop na Steam — guia de preparação

Este documento cobre o que já está pronto no código e o que ainda depende de
você (conta Steamworks, upload do build, assets da loja). Nada aqui foi
publicado — é só a preparação.

## O que já está pronto

- **`npm run dist:steam`** gera um build **desempacotado** (pasta
  `release/win-unpacked/`, não um instalador `.exe`) — é esse formato que o
  SteamPipe espera fazer upload como depot. Ele marca o build com
  `steamBuild: true` (injetado no `package.json` empacotado via
  `extraMetadata` do electron-builder) e **nunca publica no GitHub Releases**
  (`--publish never`).
- **Auto-update desligado nessa variante**: `main.js` só chama
  `autoUpdater.checkForUpdatesAndNotify()` quando `steamBuild` NÃO está
  presente. Isso é essencial — a Steam distribui e atualiza o jogo sozinha
  via SteamPipe; se o app também tentasse se auto-atualizar puxando do
  GitHub, os dois mecanismos brigariam pelo mesmo binário instalado.
- Tudo mais (overlay do pet, janela de menu, sincronização por e-mail) segue
  idêntico — nenhuma lógica de jogo muda pra rodar na Steam.

## O que NÃO está incluso (por escolha, ver conversa)

- **Sem Steamworks API** (`steamworks.js`/`greenworks`): não há
  `steam_appid.txt`, não há inicialização de `SteamAPI_Init`, não há
  conquistas, Steam Cloud ou overlay do Steam (Shift+Tab). O app roda como
  "software" na biblioteca, mas sem nenhum recurso da plataforma. Isso é
  comum pra apps/ferramentas simples na Steam e é reversível — dá pra
  adicionar depois se quiser conquistas etc.

## Passo a passo pra você (fora deste repositório)

### 1. Conta Steamworks + App ID

1. Crie/acesse uma conta em [partner.steamgames.com](https://partner.steamgames.com).
2. Pague a taxa de registro do app (US$100, reembolsável após certas
   condições de vendas).
3. Reserve o **App ID** do DigiApp Desktop no painel. Você vai usar esse
   número nos scripts VDF do passo 3.

### 2. Gerar o build

No Windows (o alvo desse app é Windows-only, ver footguns no `README.md`):

```bash
cd desktop
npm install
npm run dist:steam
```

Isso gera `desktop/release/win-unpacked/` — essa pasta inteira é o conteúdo
do depot.

### 3. Configurar o SteamPipe

Baixe o [SteamCMD](https://developer.valvesoftware.com/wiki/SteamCMD) e crie
dois arquivos VDF (fora deste repo, ou em `desktop/steam-build/` se preferir
versionar — não crie ainda porque dependem do seu App ID real):

**`app_build_<APPID>.vdf`**:
```vdf
"AppBuild"
{
	"AppID" "<SEU_APP_ID>"
	"Desc" "DigiApp Desktop"
	"ContentRoot" "..\release\win-unpacked\"
	"BuildOutput" "..\steam-build-output\"
	"Depots"
	{
		"<SEU_DEPOT_ID>" "depot_build_<DEPOTID>.vdf"
	}
}
```

**`depot_build_<DEPOTID>.vdf`**:
```vdf
"DepotBuild"
{
	"DepotID" "<SEU_DEPOT_ID>"
	"FileMapping"
	{
		"LocalPath" "*"
		"DepotPath" "."
		"recursive" "1"
	}
}
```

O App ID e o Depot ID vêm do painel Steamworks (Steamworks > seu app >
"Steam Pipe" > Depots). Depois:

```bash
steamcmd +login <seu_usuario> +run_app_build ..\app_build_<APPID>.vdf +quit
```

Isso sobe o build pra um branch (geralmente `default` fica em preview até
você promover pra `public` no painel).

### 4. Executável de lançamento

No Steamworks, em "Application > Installation > General Installation", aponte
o launch executable para `DigiApp Desktop.exe` (nome do `productName` no
`package.json`) dentro do depot.

### 5. Assets da loja (você precisa fornecer/produzir)

A Steam exige tamanhos exatos — posso ajudar a redigir texto/descrição, mas
a arte final (capsules, header, biblioteca) precisa ser desenhada:

| Asset | Tamanho |
|---|---|
| Header capsule | 460×215 |
| Small capsule | 231×87 |
| Main capsule | 616×353 |
| Library capsule | 600×900 |
| Library hero | 3840×1240 |
| Library logo | 1280×720 (fundo transparente) |
| Screenshots | mín. 1280×720 |

### 6. Coisas pra decidir/preencher você mesmo

- Preço (ou gratuito) e regiões de venda.
- Faixa etária / classificação de conteúdo (formulário da Steam).
- EULA, se quiser um custom.
- Se algum dia quiser conquistas/Steam Cloud: adicionar `steamworks.js`,
  criar `steam_appid.txt` com o App ID real (só usado em dev fora da Steam;
  em produção a Steam injeta isso sozinha) e chamar `SteamAPI_Init()` no
  `main.js`.

## Um heads-up de produto (não é obrigatório mudar nada)

O DigiApp Desktop roda como um bichinho que anda na barra de tarefas, sem uma
janela "principal" tradicional ao abrir — um usuário da Steam pode achar
estranho não ver uma janela de jogo comum ao clicar em "Jogar". Isso não
impede a publicação (existem vários apps assim na Steam), só vale considerar
se quer ajustar a primeira impressão (ex.: abrir a janela de menu
automaticamente no primeiro lançamento).
