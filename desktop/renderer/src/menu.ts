// Janela de menu do pet — estilo Windows 98 (frame:false + chrome falso em
// menu.html/win98.css). Título tem 3 botões: engrenagem (configurações),
// minimizar (só esta janela) e fechar (o app inteiro — overlay + bandeja).
import './win98.css';
import { petSprite, petLabel, PET_NAMES } from './sprites';
import {
  loadState, saveState, feedsLeft, todayKey, newTaskId,
  type DesktopState,
} from './state';
import { fetchRemoteSnapshot } from './cloudSync';
import { eventPhrase } from './phrases';

const state: DesktopState = loadState();
const persist = () => {
  saveState(state);
  window.digiDesktop?.notifyStateChanged();
};
const t = (pt: string, en: string) => (state.language === 'pt-BR' ? pt : en);

const content = document.getElementById('content')!;

document.getElementById('btn-settings')!.addEventListener('click', () => { panel = 'settings'; render(); });
document.getElementById('btn-minimize')!.addEventListener('click', () => window.digiDesktop?.minimizeMenu());
document.getElementById('btn-close')!.addEventListener('click', () => window.digiDesktop?.quit());

type Panel = 'main' | 'tasks' | 'newTask' | 'settings';
let panel: Panel = 'main';
let status = '';

function heartsLabel(): string {
  const full = Math.floor(state.hearts);
  const half = state.hearts - full >= 0.5;
  return '❤️'.repeat(full) + (half ? '💗' : '') + '🖤'.repeat(Math.max(0, state.maxHearts - full - (half ? 1 : 0)));
}

function button(label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `win98-btn ${extraClass}`.trim();
  b.innerHTML = label;
  b.addEventListener('click', onClick);
  return b;
}

function addBackHeader(title: string) {
  const header = document.createElement('div');
  header.className = 'panel-header';
  const back = document.createElement('button');
  back.className = 'back-btn';
  back.textContent = '‹';
  back.addEventListener('click', () => { panel = 'main'; render(); });
  const span = document.createElement('span');
  span.className = 'panel-title';
  span.textContent = title;
  header.append(back, span);
  content.appendChild(header);
}

function render() {
  content.innerHTML = '';
  if (panel === 'main') renderMain();
  else if (panel === 'tasks') renderTasks();
  else if (panel === 'newTask') renderNewTask();
  else renderSettings();
}

function renderMain() {
  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = `<span class="panel-title">${petLabel(state.pet)}</span>` +
    `<span class="panel-stats">${heartsLabel()} · ⚡${state.energy}/${state.maxEnergy} · 🍎×${state.food}</span>`;
  content.appendChild(header);

  const img = document.createElement('img');
  img.src = petSprite(state.pet);
  img.alt = petLabel(state.pet);
  img.style.cssText = 'width:64px;height:64px;image-rendering:pixelated;display:block;margin:0 auto;';
  content.appendChild(img);

  if (status) {
    const s = document.createElement('div');
    s.className = 'field-hint ok';
    s.style.textAlign = 'center';
    s.textContent = status;
    content.appendChild(s);
  }

  const pending = state.tasks.filter((task) => !task.completed).length;
  content.append(
    button(`🫶 ${t('Fazer carinho', 'Pet')}`, doPet),
    button(`🍎 ${t('Alimentar', 'Feed')}`, doFeed),
    button(`🚿 ${t('Dar banho', 'Bath')}`, doShower),
    button(
      state.sleeping ? `☀️ ${t('Acordar', 'Wake up')}` : `💤 ${t('Colocar pra dormir', 'Sleep')}`,
      doSleepToggle,
    ),
    button(`✅ ${t('Tarefas', 'Tasks')}${pending ? ` <span class="badge">${pending}</span>` : ''}`, () => { panel = 'tasks'; render(); }),
    button(`➕ ${t('Nova tarefa', 'New task')}`, () => { panel = 'newTask'; render(); }),
  );
}

function renderTasks() {
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
      render();
    });
    row.append(toggle, name, del);
    list.appendChild(row);
  }
  content.appendChild(list);
  content.appendChild(button(`➕ ${t('Nova tarefa', 'New task')}`, () => { panel = 'newTask'; render(); }));
}

function renderNewTask() {
  addBackHeader(t('Nova tarefa', 'New task'));
  const form = document.createElement('form');
  form.className = 'field-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 60;
  input.placeholder = t('O que precisa fazer?', 'What needs doing?');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'win98-btn';
  submit.textContent = t('Criar', 'Create');
  form.append(input, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    state.tasks.push({ id: newTaskId(), name, completed: false, createdAt: new Date().toISOString() });
    persist();
    panel = 'tasks';
    render();
  });
  content.appendChild(form);
  input.focus();
}

function renderSettings() {
  addBackHeader(t('Configurações', 'Settings'));

  content.appendChild(button(
    `🌐 ${t('Idioma: Português', 'Language: English')}`,
    () => { state.language = state.language === 'pt-BR' ? 'en' : 'pt-BR'; persist(); render(); },
  ));

  const syncBox = document.createElement('div');
  syncBox.className = 'field-row';
  const label = document.createElement('div');
  label.className = 'panel-title';
  label.style.fontSize = '11px';
  label.textContent = t('E-mail sincronizado (mesmo do app/APK)', 'Sync email (same as the app/APK)');
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.placeholder = 'voce@email.com';
  emailInput.value = state.syncEmail ?? '';
  const syncBtn = button(`🔄 ${t('Sincronizar agora', 'Sync now')}`, () => syncNow(emailInput.value));
  const hint = document.createElement('div');
  hint.className = 'field-hint';
  hint.textContent = state.lastSyncAt
    ? t(`Última sincronização: ${new Date(state.lastSyncAt).toLocaleString('pt-BR')}`, `Last sync: ${new Date(state.lastSyncAt).toLocaleString()}`)
    : t('Ainda não sincronizado.', 'Not synced yet.');
  syncBox.append(label, emailInput, syncBtn, hint);
  content.appendChild(syncBox);

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
      render();
    });
    grid.appendChild(cell);
  }
  content.appendChild(grid);

  content.appendChild(button(`📱 ${t('Abrir DigiApp completo', 'Open full DigiApp')}`, () => window.digiDesktop?.openFullApp()));
}

async function syncNow(email: string) {
  const trimmed = email.trim();
  if (!trimmed) {
    status = '';
    render();
    const hint = content.querySelector('.field-hint') as HTMLDivElement | null;
    if (hint) { hint.textContent = t('Digite um e-mail primeiro.', 'Type an email first.'); hint.className = 'field-hint error'; }
    return;
  }
  const hint = content.querySelector('.field-hint') as HTMLDivElement | null;
  if (hint) hint.textContent = t('Sincronizando...', 'Syncing...');
  try {
    const snapshot = await fetchRemoteSnapshot(trimmed);
    if (!snapshot) {
      if (hint) { hint.textContent = t('Nenhum save encontrado com esse e-mail ainda.', 'No save found for that email yet.'); hint.className = 'field-hint error'; }
      return;
    }
    state.syncEmail = trimmed;
    state.pet = snapshot.pet;
    state.hearts = snapshot.hearts;
    state.maxHearts = snapshot.maxHearts;
    state.lastSyncAt = new Date().toISOString();
    persist();
    panel = 'main';
    status = t('Sincronizado com sucesso!', 'Synced successfully!');
    render();
  } catch {
    if (hint) { hint.textContent = t('Falha de conexão — tente de novo.', 'Connection failed — try again.'); hint.className = 'field-hint error'; }
  }
}

// ----------------------------------------------------------------- ações
// Cada ação também manda um "efeito" (emoji + fala) pro overlay: o pet
// visível é a faixa que anda na barra de tarefas, não esta janela.
function doPet() {
  const day = todayKey();
  if (state.rubHealDay !== day && state.hearts < state.maxHearts) {
    state.hearts = Math.min(state.maxHearts, state.hearts + 0.5);
    state.rubHealDay = day;
    persist();
    status = eventPhrase('petHealed', state.language);
  } else {
    status = eventPhrase('pet', state.language);
  }
  window.digiDesktop?.sendEffect('💗', status);
  render();
}

function doFeed() {
  if (state.food <= 0) {
    status = eventPhrase('noFood', state.language);
    render();
    return;
  }
  if (feedsLeft(state) <= 0) {
    status = eventPhrase('full', state.language);
    render();
    return;
  }
  state.food -= 1;
  state.feedTimes.push(Date.now());
  state.energy = Math.min(state.maxEnergy, state.energy + 1);
  persist();
  status = eventPhrase('feed', state.language);
  window.digiDesktop?.sendEffect('🍖', status);
  render();
}

function doShower() {
  status = eventPhrase('shower', state.language);
  window.digiDesktop?.sendEffect('🫧', status);
  render();
}

function doSleepToggle() {
  state.sleeping = !state.sleeping;
  persist();
  status = eventPhrase(state.sleeping ? 'sleep' : 'wake', state.language);
  render();
}

function toggleTask(id: string) {
  const task = state.tasks.find((other) => other.id === id);
  if (!task) return;
  task.completed = !task.completed;
  if (task.completed) {
    state.food += 1;
    status = eventPhrase('taskDone', state.language);
    window.digiDesktop?.sendEffect('🍎', status);
  }
  persist();
  render();
}

render();
