// Overlay do pet: anda numa faixa rente à barra de tarefas e solta frases.
// A janela inteira é click-through; só o pet é interativo (ver
// set-interactive no main.js do Electron). Clicar no pet abre a janela de
// menu (estilo Windows 98, ver menu.ts/menu.html) num processo separado.
import './style.css';
import { petSprite } from './sprites';
import { loadState, type DesktopState } from './state';
import { idlePhrase } from './phrases';

let state: DesktopState = loadState();
const t = (pt: string, en: string) => (state.language === 'pt-BR' ? pt : en);

// ---------------------------------------------------------------- DOM base
const stage = document.getElementById('stage')!;

const pet = document.createElement('div');
pet.id = 'pet';
pet.dataset.hit = '1';
pet.innerHTML = `<img id="pet-img" alt="pet" draggable="false" /><div id="pet-fx"></div><div id="pet-zzz">💤</div>`;
stage.appendChild(pet);

const bubble = document.createElement('div');
bubble.id = 'bubble';
stage.appendChild(bubble);

const petImg = pet.querySelector<HTMLImageElement>('#pet-img')!;
const petFx = pet.querySelector<HTMLDivElement>('#pet-fx')!;

// ------------------------------------------------------------- caminhada
const PET_SIZE = 96;
const SPEED = 28; // px/s
let x = Math.random() * Math.max(1, window.innerWidth - PET_SIZE);
let dir: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
let walking = true;
let behaviorUntil = 0;
let lastTs = performance.now();

function applyPetVisual() {
  petImg.src = petSprite(state.pet);
  pet.classList.toggle('sleeping', state.sleeping);
}

function tick(ts: number) {
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;

  if (ts > behaviorUntil) {
    // Alterna andar/pausar com durações aleatórias; às vezes vira de lado.
    walking = Math.random() < 0.65;
    if (walking && Math.random() < 0.4) dir = dir === 1 ? -1 : 1;
    behaviorUntil = ts + 2000 + Math.random() * 5000;
  }

  if (walking && !state.sleeping) {
    x += dir * SPEED * dt;
    const max = window.innerWidth - PET_SIZE;
    if (x <= 0) { x = 0; dir = 1; }
    if (x >= max) { x = max; dir = -1; }
  }

  pet.style.transform = `translateX(${x}px)`;
  // Sprites DMC olham para a ESQUERDA — andar para a direita = flip.
  petImg.style.transform = dir === 1 ? 'scaleX(-1)' : '';
  pet.classList.toggle('walking', walking && !state.sleeping);

  positionBubble();
  requestAnimationFrame(tick);
}

function positionBubble() {
  if (!bubble.classList.contains('open')) return;
  const center = x + PET_SIZE / 2;
  const w = bubble.offsetWidth;
  bubble.style.left = `${Math.min(Math.max(4, center - w / 2), window.innerWidth - w - 4)}px`;
}

// ----------------------------------------------------------------- falas
let bubbleTimer: number | undefined;
function say(text: string, ms = 6000) {
  bubble.textContent = text;
  bubble.classList.add('open');
  positionBubble();
  window.clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => bubble.classList.remove('open'), ms);
}

function scheduleIdleTalk() {
  const delay = 120_000 + Math.random() * 180_000; // 2–5 min
  window.setTimeout(() => {
    if (!document.hidden && !state.sleeping) say(idlePhrase(state.language));
    scheduleIdleTalk();
  }, delay);
}

// --------------------------------------------------------------- efeitos
function burst(emoji: string, count = 6) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'fx';
    el.textContent = emoji;
    el.style.left = `${20 + Math.random() * 56}px`;
    el.style.animationDelay = `${Math.random() * 0.4}s`;
    petFx.appendChild(el);
    window.setTimeout(() => el.remove(), 1600);
  }
}

// ------------------------------------------------- interação / click-through
pet.addEventListener('click', () => window.digiDesktop?.openMenu(x + PET_SIZE / 2));

// A janela é click-through por padrão; quando o mouse passa sobre o pet
// ([data-hit]) avisamos o main process para aceitar cliques.
let lastHit = false;
document.addEventListener('mousemove', (e) => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const hit = !!el?.closest('[data-hit]');
  if (hit !== lastHit) {
    lastHit = hit;
    window.digiDesktop?.setInteractive(hit);
  }
});
document.addEventListener('mouseleave', () => {
  if (lastHit) {
    lastHit = false;
    window.digiDesktop?.setInteractive(false);
  }
});

// Menu (noutra janela) mudou o estado — recarrega e atualiza o sprite na hora.
window.digiDesktop?.onStateChanged(() => {
  state = loadState();
  applyPetVisual();
});

// Ação feita no menu (carinho/comida/banho/tarefa) — toca a animação aqui,
// já que o pet visível é o overlay (o menu é só a janela de controle).
window.digiDesktop?.onEffect((emoji, phrase) => {
  burst(emoji, 8);
  say(phrase);
});

// Atualização baixada em segundo plano — instala sozinha ao fechar o app.
window.digiDesktop?.onUpdateReady(() => {
  say(t('Baixei uma atualização! Já aplico da próxima vez que eu abrir.', 'I downloaded an update! I will apply it next time I start.'), 8000);
});

// ------------------------------------------------------------------- boot
applyPetVisual();
requestAnimationFrame(tick);
scheduleIdleTalk();
window.setTimeout(() => say(t('Oi! Clica em mim pra ver o menu.', 'Hi! Click me to see the menu.')), 2500);
