const DB_NAME = 'daily-money';
const DB_VERSION = 1;
const BUCKETS = ['breakfast', 'lunch', 'dinner'];
const LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const state = { settings: null, date: todayKey(), day: null, daySaved: false, writeQueue: Promise.resolve(), lastKnownToday: todayKey() };

const $ = (selector) => document.querySelector(selector);
const money = (value) => `$${Math.abs(Math.round(Number(value) || 0))}`;

document.addEventListener('DOMContentLoaded', async () => {
  try { bindActions(); state.settings = await dbGet('settings', 'default'); if (!state.settings) showView('onboarding-view'); else { await loadDay(state.date); showView('daily-view'); } }
  catch (error) { showStorageError(error); }
});

function bindActions() {
  document.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'settings') { renderSettings(); showView('settings-view'); }
    if (action === 'today') { state.date = todayKey(); await loadDay(state.date); showView('daily-view'); }
    if (action === 'previous-day') { state.date = shiftDate(state.date, -1); await loadDay(state.date); showView('daily-view'); window.scrollTo(0, 0); }
    if (action === 'next-day' && state.date < todayKey()) { state.date = shiftDate(state.date, 1); await loadDay(state.date); showView('daily-view'); window.scrollTo(0, 0); }
  });
  $('#onboarding-form').addEventListener('submit', saveOnboarding);
  $('#settings-form').addEventListener('submit', saveSettings);
  $('#day-form').addEventListener('input', saveDayInput);
  let startX = null;
  $('#daily-view').addEventListener('touchstart', (event) => { startX = event.changedTouches[0].screenX; }, { passive: true });
  $('#daily-view').addEventListener('touchend', async (event) => {
    if (startX === null) return;
    const delta = event.changedTouches[0].screenX - startX; startX = null;
    if (Math.abs(delta) < 55) return;
    if (delta < 0 && state.date < todayKey()) { state.date = shiftDate(state.date, 1); await loadDay(state.date); }
    if (delta > 0) { state.date = shiftDate(state.date, -1); await loadDay(state.date); }
    window.scrollTo(0, 0);
  }, { passive: true });
}

async function saveOnboarding(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const defaults = Object.fromEntries(BUCKETS.map((bucket) => [bucket, wholeDollar(data.get(bucket))]));
  if (Object.values(defaults).some((value) => value === null)) { $('#onboarding-error').textContent = 'Enter a whole-dollar amount for all three buckets.'; return; }
  state.settings = { id: 'default', defaults, updatedAt: Date.now() };
  try { await dbPut('settings', state.settings); await loadDay(todayKey()); showView('daily-view'); } catch (error) { showStorageError(error); }
}

function renderSettings() {
  $('#settings-fields').innerHTML = BUCKETS.map((bucket) => `<label>${LABELS[bucket]}<input required min="0" step="1" type="number" inputmode="numeric" name="${bucket}" value="${state.settings.defaults[bucket]}"></label>`).join('');
}

async function saveSettings(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const defaults = Object.fromEntries(BUCKETS.map((bucket) => [bucket, wholeDollar(data.get(bucket))]));
  if (Object.values(defaults).some((value) => value === null)) { $('#settings-error').textContent = 'Use whole-dollar amounts only.'; return; }
  state.settings = { ...state.settings, defaults, updatedAt: Date.now() };
  try { await dbPut('settings', state.settings); state.date = todayKey(); await loadDay(state.date); showView('daily-view'); } catch (error) { showStorageError(error); }
}

async function loadDay(date) {
  state.day = await dbGet('days', date);
  state.daySaved = Boolean(state.day);
  if (!state.day) state.day = { date, defaults: { ...state.settings.defaults }, overrides: {}, spent: {}, touched: {}, createdAt: Date.now() };
  else if (!state.day.defaults) state.day.defaults = { ...state.settings.defaults };
  renderDay();
}

function renderDay() {
  const date = parseDateKey(state.date);
  $('#date-relative').textContent = relativeDate(date);
  $('#date-full').textContent = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
  $('[data-action="next-day"]').disabled = state.date >= todayKey();
  BUCKETS.forEach((bucket) => {
    const planned = state.day.overrides[bucket] ?? state.day.defaults[bucket];
    const spent = state.day.touched[bucket] ? state.day.spent[bucket] : '';
    $(`#bucket-${bucket}`).innerHTML = `<div class="bucket-header"><span class="bucket-name">${LABELS[bucket]}</span><span class="bucket-plan">planned ${money(planned)}</span></div><div class="bucket-fields"><label>Planned today<input required min="0" step="1" inputmode="numeric" type="number" data-bucket="${bucket}" data-kind="planned" value="${planned}" aria-label="${LABELS[bucket]} planned today"></label><label>Actually spent<input min="0" step="1" inputmode="numeric" type="number" data-bucket="${bucket}" data-kind="spent" value="${spent}" placeholder="$ 0" aria-label="${LABELS[bucket]} actually spent"></label></div>`;
  });
  renderTotal();
}

async function saveDayInput(event) {
  const input = event.target.closest('input[data-bucket]'); if (!input) return;
  const bucket = input.dataset.bucket; const value = wholeDollar(input.value); if (input.dataset.kind === 'spent' && input.value === '') { state.day.spent[bucket] = 0; state.day.touched[bucket] = true; renderTotal(); try { await saveDay(state.day); state.daySaved = true; renderTotal(); } catch (error) { showStorageError(error); } return; } if (value === null) return;
  if (input.dataset.kind === 'planned') {
    state.day.overrides[bucket] = value;
    if (value === state.day.defaults[bucket]) delete state.day.overrides[bucket];
  } else { const actual = input.value === '' ? 0 : value; state.day.spent[bucket] = actual; state.day.touched[bucket] = true; }
  renderTotal();
  try { await saveDay(state.day); state.daySaved = true; renderTotal(); } catch (error) { showStorageError(error); }
}

function renderTotal() {
  let planned = 0; let spent = 0;
  BUCKETS.forEach((bucket) => { planned += state.day.overrides[bucket] ?? state.day.defaults[bucket]; spent += state.day.touched[bucket] ? state.day.spent[bucket] : 0; });
  const scraps = planned - spent; const summary = $('#scrap-summary');
  summary.classList.remove('is-unsaved', 'is-positive', 'is-negative');
  summary.classList.add(!state.daySaved ? 'is-unsaved' : scraps < 0 ? 'is-negative' : 'is-positive');
  $('#scrap-total').textContent = `${scraps < 0 ? '-' : ''}${money(scraps)}`;
  $('#scrap-caption').textContent = !state.daySaved ? 'No entry saved for this day' : scraps < 0 ? `You are ${money(scraps)} over your plan` : scraps === 0 ? 'Right on your meal plan' : `You kept ${money(scraps)} under your plan`;
}

function showView(id) { document.querySelectorAll('.view').forEach((view) => view.classList.toggle('is-hidden', view.id !== id)); }
function wholeDollar(value) { if (value === '' || value === null || !/^\d+$/.test(String(value))) return null; return Number(value); }
function todayKey() { return dateKey(new Date()); }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function parseDateKey(key) { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day); }
function shiftDate(key, amount) { const date = parseDateKey(key); date.setDate(date.getDate() + amount); return dateKey(date); }
function relativeDate(date) { const diff = Math.round((parseDateKey(todayKey()) - date) / 86400000); if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday'; if (diff === -1) return 'Tomorrow'; return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date); }

function showStorageError(error) { console.error(error); $('#storage-error').classList.remove('is-hidden'); }
function saveDay(day) { const snapshot = JSON.parse(JSON.stringify(day)); state.writeQueue = state.writeQueue.then(() => dbPut('days', snapshot)); return state.writeQueue; }
function openDb() { return new Promise((resolve, reject) => { if (!window.indexedDB) { reject(new Error('IndexedDB is unavailable')); return; } const request = indexedDB.open(DB_NAME, DB_VERSION); request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' }); if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function dbGet(store, key) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(store, 'readonly').objectStore(store).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function dbPut(store, value) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(store, 'readwrite').objectStore(store).put(value); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }

document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && todayKey() !== state.lastKnownToday) { state.lastKnownToday = todayKey(); if (state.date === shiftDate(state.lastKnownToday, -1) || state.date === state.lastKnownToday) { state.date = state.lastKnownToday; await loadDay(state.date); showView('daily-view'); } } });
if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((error) => console.error(error)));
