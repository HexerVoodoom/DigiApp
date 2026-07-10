// API exposta pelo preload do Electron (ausente quando aberto num browser puro,
// ex.: teste com Playwright — por isso todo uso é opcional).
interface DigiDesktopApi {
  setInteractive(on: boolean): void;
  openFullApp(): void;
  quit(): void;
}

interface Window {
  digiDesktop?: DigiDesktopApi;
}
