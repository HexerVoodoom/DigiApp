// API exposta pelo preload do Electron (ausente quando aberto num browser puro,
// ex.: teste com Playwright — por isso todo uso é opcional).
interface DigiDesktopApi {
  setInteractive(on: boolean): void;
  openMenu(): void;
  minimizeMenu(): void;
  openFullApp(): void;
  quit(): void;
  onUpdateReady(cb: () => void): void;
  notifyStateChanged(): void;
  onStateChanged(cb: () => void): void;
  sendEffect(emoji: string, phrase: string): void;
  onEffect(cb: (emoji: string, phrase: string) => void): void;
}

interface Window {
  digiDesktop?: DigiDesktopApi;
}
