// Overlay do pet: anda numa faixa rente à barra de tarefas, solta frases e,
// ao ser clicado, abre o menu de ações (carinho/alimentar/banho/dormir +
// tarefas). A janela inteira é click-through; só pet e menu são interativos
// (ver set-interactive no main.js do Electron).
import './style.css';
import { petSprite, petLabel, PET_NAMES } from './sprites';
import {
  loadState, saveState, feedsLeft, todayKey, newTaskId,
  type DesktopState,
} from './state';
import { idlePhrase, eventPhrase } from './phrases';

const state: DesktopState = loadState();
const persist = () => saveState(state);
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

const menu = document.createElement('div');
menu.id = 'menu';
menu.dataset.hit = '1';
stage.appendChild(menu);

const petImg = pet.querySelector<HTMLImageElement>('#pet-img')!;
const petFx = pet.querySelector<HTMLDivElement>('#pet-fx')!;

// ------------------------------------------------------------- caminhada
const PET_SIZE = 96;
const SPEED = 28; // px/s
let x = Math.random() * Math.max(1, window.innerWidth - PET_SIZE);
let dir: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
let walking = true;
let behaviorUntil = 0;
let menuOpen = false;
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

  if (walking && !menuOpen && !state.sleeping) {
    x += dir * SPEED * dt;
    const max = window.innerWidth - PET_SIZE;
    if (x <= 0) { x = 0; dir = 1; }
    if (x >= max) { x = max; dir = -1; }
  }

  pet.style.transform = `translateX(${x}px)`;
  // Sprites DMC olham para a ESQUERDA — andar para a direita = flip.
  petImg.style.transform = dir === 1 ? 'scaleX(-1)' : '';
  pet.classList.toggle('walking', walking && !menuOpen && !state.sleeping);

  positionFloaters();
  requestAnimationFrame(tick);
}

function positionFloaters() {
  const center = x + PET_SIZE / 2;
  for (const el of [bubble, menu]) {
    if (!el.classList.contains('open')) continue;
    const w = el.offsetWidth;
    const left = Math.min(Math.max(4, center - w / 2), window.innerWidth - w - 4);
    el.style.left = `${left}px`;
  }
}

// ----------------------------------------------------------------- falas
let bubbleTimer: number | undefined;
function say(text: string, ms = 6000) {
  bubble.textContent = text;
  bubble.classList.add('open');
  positionFloaters();
  window.clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => bubble.classList.remove('open'), ms);
}

function scheduleIdleTalk() {
  const delay = 120_000 + Math.random() * 180_000; // 2–5 min
  window.setTimeout(() => {
    if (!document.hidden && !menuOpen && !state.sleeping) say(idlePhrase(state.language));
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

// ------------------------------------------------------------------ menu
type Panel = 'main' | 'tasks' | 'newTask' | 'settings';
let panel: Panel = 'main';

function openMenu(target: Panel = 'main') {
  panel = target;
  menuOpen = true;
  bubble.classList.remove('open'); // balão atrás do menu fica estranho
  menu.classList.add('open');
  renderMenu();
  positionFloaters();
}

function closeMenu() {
  menuOpen = false;
  menu.classList.remove('open');
}

function heartsLabel(): string {
  const full = Math.floor(state.hearts);
  const half = state.hearts - full >= 0.5;
  return '❤️'.repeat(full) + (half ? '💗' : '') + '🖤'.repeat(Math.max(0, state.maxHearts - full - (half ? 1 : 0)));
}

function button(label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `menu-btn ${extraClass}`.trim();
  b.innerHTML = label;
  b.addEventListener('click', onClick);
  return b;
}

function renderMenu() {
  menu.innerHTML = '';
  if (panel === 'main') renderMainPanel();
  else if (panel === 'tasks') renderTasksPanel();
  else if (panel === 'newTask') renderNewTaskPanel();
  else renderSettingsPanel();
  positionFloaters();
}

function renderMainPanel() {
  const header = document.createElement('div');
  header.className = 'menu-header';
  header.innerHTML = `<span class="menu-title">${petLabel(state.pet)}</span>` +
    `<span class="menu-stats">${heartsLabel()} · ⚡${state.energy}/${state.maxEnergy} · 🍎×${state.food}</span>`;
  menu.appendChild(header);

  const pending = state.tasks.filter((task) => !task.completed).length;
  menu.append(
    button(`🫶 ${t('Fazer carinho', 'Pet')}`, doPet),
    button(`🍎 ${t('Alimentar', 'Feed')}`, doFeed),
    button(`🚿 ${t('Dar banho', 'Bath')}`, doShower),
    button(
      state.sleeping ? `☀️ ${t('Acordar', 'Wake up')}` : `💤 ${t('Colocar pra dormir', 'Sleep')}`,
      doSleepToggle,
    ),
    button(`✅ ${t('Tarefas', 'Tasks')}${pending ? ` <span class="badge">${pending}</span>` : ''}`, () => { panel = 'tasks'; renderMenu(); }),
    button(`➕ ${t('Nova tarefa', 'New task')}`, () => { panel = 'newTask'; renderMenu(); }),
    button(`⚙️ ${t('Opções', 'Options')}`, () => { panel = 'settings'; renderMenu(); }, 'muted'),
  );
}

function renderTasksPanel() {
  addBackHeader(t('Tarefas de hoje', "Today's tasks"));
  const list = document.createElement('div');
  list.className = 'task-list';
  if (state.tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'task-empty';
    empty.textContent = t('Nenhuma tarefa ainda.', 'No tasks yet.');
    list.appendChild(empty);
  }
  for (const task of state.tasks) {
    const row = document.createElement('div');
    row.className = `task-row${task.completed ? ' done' : ''}`;
    const toggle = document.createElement('button');
    toggle.className = 'task-toggle';
    toggle.textContent = task.completed ? '☑' : '☐';
    toggle.addEventListener('click', () => toggleTask(task.id));
    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = task.name;
    const del = document.createElement('button');
    del.className = 'task-del';
    del.textContent = '✕';
    del.title = t('Excluir', 'Delete');
    del.addEventListener('click', () => {
      state.tasks = state.tasks.filter((other) => other.id !== task.id);
      persist();
      renderMenu();
    });
    row.append(toggle, name, del);
    list.appendChild(row);
  }
  menu.appendChild(list);
  menu.appendChild(button(`➕ ${t('Nova tarefa', 'New task')}`, () => { panel = 'newTask'; renderMenu(); }));
}

function renderNewTaskPanel() {
  addBackHeader(t('Nova tarefa', 'New task'));
  const form = document.createElement('form');
  form.className = 'new-task';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 60;
  input.placeholder = t('O que precisa fazer?', 'What needs doing?');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'menu-btn';
  submit.textContent = t('Criar', 'Create');
  form.append(input, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    state.tasks.push({ id: newTaskId(), name, completed: false, createdAt: new Date().toISOString() });
    persist();
    say(eventPhrase('taskNew', state.language));
    panel = 'tasks';
    renderMenu();
  });
  menu.appendChild(form);
  input.focus();
}

function renderSettingsPanel() {
  addBackHeader(t('Opções', 'Options'));

  const langBtn = button(
    `🌐 ${t('Idioma: Português', 'Language: English')}`,
    () => {
      state.language = state.language === 'pt-BR' ? 'en' : 'pt-BR';
      persist();
      renderMenu();
    },
  );

  const grid = document.createElement('div');
  grid.className = 'pet-grid';
  for (const name of PET_NAMES) {
    const cell = document.createElement('button');
    cell.className = `pet-cell${name === state.pet ? ' active' : ''}`;
    cell.title = petLabel(name);
    const img = document.createElement('img');
    img.src = petSprite(name);
    img.alt = petLabel(name);
    img.draggable = false;
    cell.appendChild(img);
    cell.addEventListener('click', () => {
      state.pet = name;
      persist();
      applyPetVisual();
      renderMenu();
    });
    grid.appendChild(cell);
  }

  menu.append(
    langBtn,
    grid,
    button(`📱 ${t('Abrir DigiApp completo', 'Open full DigiApp')}`, () => window.digiDesktop?.openFullApp()),
    button(`🚪 ${t('Fechar overlay', 'Quit overlay')}`, () => window.digiDesktop?.quit(), 'muted'),
  );
}

function addBackHeader(title: string) {
  const header = document.createElement('div');
  header.className = 'menu-header';
  const back = document.createElement('button');
  back.className = 'back-btn';
  back.textContent = '‹';
  back.addEventListener('click', () => { panel = 'main'; renderMenu(); });
  const span = document.createElement('span');
  span.className = 'menu-title';
  span.textContent = title;
  header.append(back, span);
  menu.appendChild(header);
}

// ----------------------------------------------------------------- ações
function doPet() {
  burst('💗', 8);
  const day = todayKey();
  if (state.rubHealDay !== day && state.hearts < state.maxHearts) {
    state.hearts = Math.min(state.maxHearts, state.hearts + 0.5);
    state.rubHealDay = day;
    persist();
    say(eventPhrase('petHealed', state.language));
  } else {
    say(eventPhrase('pet', state.language));
  }
  renderMenu();
}

function doFeed() {
  if (state.food <= 0) {
    say(eventPhrase('noFood', state.language));
    return;
  }
  if (feedsLeft(state) <= 0) {
    say(eventPhrase('full', state.language));
    return;
  }
  state.food -= 1;
  state.feedTimes.push(Date.now());
  state.energy = Math.min(state.maxEnergy, state.energy + 1);
  persist();
  burst('🍖', 4);
  say(eventPhrase('feed', state.language));
  renderMenu();
}

function doShower() {
  burst('🫧', 8);
  say(eventPhrase('shower', state.language));
}

function doSleepToggle() {
  state.sleeping = !state.sleeping;
  persist();
  applyPetVisual();
  say(eventPhrase(state.sleeping ? 'sleep' : 'wake', state.language));
  renderMenu();
}

function toggleTask(id: string) {
  const task = state.tasks.find((other) => other.id === id);
  if (!task) return;
  task.completed = !task.completed;
  if (task.completed) {
    state.food += 1;
    burst('🍎', 3);
    say(eventPhrase('taskDone', state.language));
  }
  persist();
  renderMenu();
}

// ------------------------------------------------- interação / click-through
pet.addEventListener('click', () => {
  if (menuOpen) closeMenu();
  else openMenu();
});

// A janela é click-through por padrão; quando o mouse passa sobre pet/menu
// (elementos [data-hit]) avisamos o main process para aceitar cliques.
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

// Clique fora do menu (na área transparente, quando interativa) fecha o menu.
// Comparamos com o próprio #stage: botões do menu podem ser destruídos pelo
// re-render antes de o evento subir (ficariam "fora" num closest()).
stage.addEventListener('click', (e) => {
  if (menuOpen && e.target === stage) closeMenu();
});

// ------------------------------------------------------------------- boot
applyPetVisual();
requestAnimationFrame(tick);
scheduleIdleTalk();
window.setTimeout(() => say(t('Oi! Clica em mim pra ver o menu.', 'Hi! Click me to see the menu.')), 2500);
