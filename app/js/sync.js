// sync.js
// Sincronización opcional con el Google Drive de la usuaria.
//
// - Sin servidor propio: el navegador habla directamente con Google.
// - Los datos se guardan en la carpeta oculta de datos de la app (appDataFolder) de SU Drive:
//   no aparece entre sus archivos y solo Hera puede leerla.
// - El script de Google solo se carga si la usuaria activa la sincronización.
// - Cada cambio lleva una marca de tiempo (_u); al sincronizar se combinan ambos lados
//   quedándose con la versión más reciente de cada día, de los ajustes, del perfil y de cada medicación.

import { GOOGLE_CLIENT_ID, SYNC_BETA_ONLY } from './config.js';
import { store } from './store.js';
import { isBeta } from './beta.js';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPES = `${DRIVE_SCOPE} openid email`;
const FILE_NAME = 'vera-data.json';
const PREFS_KEY = 'vera-sync';        // localStorage: { enabled, email }
const TOKEN_KEY = 'vera-sync-token';  // sessionStorage: { token, exp }

const available = !!GOOGLE_CLIENT_ID && (!SYNC_BETA_ONLY || isBeta());
export const syncAvailable = () => available;

// MARK: - Estado

export const sync = {
  enabled: false,
  email: null,
  status: 'off',       // off | idle | syncing | ok | needs-auth | offline | error
  lastSync: null,      // Date.now() de la última sincronización correcta
  error: null,
};

const listeners = new Set();
export const onSyncChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());
function setStatus(status, error = null) { sync.status = status; sync.error = error; emit(); }

function readJSON(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}
function writeJSON(storage, key, value) {
  try { value == null ? storage.removeItem(key) : storage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}

// MARK: - Combinar datos (función pura)

const u = (x) => Number(x?._u) || 0;

export function mergeData(local, remote) {
  const out = { ...local };
  if ((remote.settingsU || 0) > (local.settingsU || 0)) { out.settings = remote.settings; out.settingsU = remote.settingsU; }
  if ((remote.profileU || 0) > (local.profileU || 0)) { out.profile = remote.profile; out.profileU = remote.profileU; }
  if ((remote.stageU || 0) > (local.stageU || 0)) { out.stage = remote.stage; out.stageU = remote.stageU; }

  out.logs = { ...local.logs };
  for (const [date, log] of Object.entries(remote.logs || {})) {
    if (!out.logs[date] || u(log) > u(out.logs[date])) out.logs[date] = log;
  }

  const deleted = { ...(local.deletedMeds || {}) };
  for (const [id, ts] of Object.entries(remote.deletedMeds || {})) deleted[id] = Math.max(deleted[id] || 0, ts);
  out.deletedMeds = deleted;

  const meds = new Map();
  for (const m of [...(local.meds || []), ...(remote.meds || [])]) {
    const prev = meds.get(m.id);
    if (!prev || u(m) > u(prev)) meds.set(m.id, m);
  }
  out.meds = [...meds.values()].filter((m) => !(deleted[m.id] >= u(m)));
  return out;
}

/** JSON con claves ordenadas, para comparar contenidos */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
const payloadOf = (d) => ({ settings: d.settings, logs: d.logs, meds: d.meds, profile: d.profile, settingsU: d.settingsU, profileU: d.profileU, deletedMeds: d.deletedMeds, stage: d.stage, stageU: d.stageU });

// MARK: - Google Identity Services (se carga bajo demanda)

let gisPromise = null;
/** Precarga el script de Google (se llama al mostrar el botón, para que el toque abra la ventana al instante) */
export function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error('No se pudo conectar con Google')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

let token = null;
let tokenExp = 0;

function restoreToken() {
  const t = readJSON(sessionStorage, TOKEN_KEY);
  if (t && t.exp > Date.now() + 60000) { token = t.token; tokenExp = t.exp; }
}
const tokenValid = () => token && tokenExp > Date.now() + 60000;

/** Pide un token a Google. Debe llamarse desde un toque de la usuaria (abre una ventana de Google). */
function requestToken({ consent = false } = {}) {
  // Si el script ya está cargado, la ventana de Google se abre en el mismo toque
  // (Safari bloquea ventanas abiertas después de una espera).
  if (!window.google?.accounts?.oauth2) return loadGis().then(() => requestToken({ consent }));
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
          reject(new Error('Para sincronizar, marca el permiso de Google Drive al iniciar sesión.'));
          return;
        }
        token = resp.access_token;
        tokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
        writeJSON(sessionStorage, TOKEN_KEY, { token, exp: tokenExp });
        resolve();
      },
      error_callback: (err) => reject(new Error(
        err?.type === 'popup_closed' ? 'Has cerrado la ventana de Google.'
          : err?.type === 'popup_failed_to_open' ? 'Tu navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes para esta web y vuelve a intentarlo.'
            : 'No se pudo iniciar sesión con Google.')),
    });
    client.requestAccessToken({ prompt: consent ? 'consent' : '', login_hint: sync.email || undefined });
  });
}

// MARK: - Google Drive (appDataFolder)

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (res.status === 401) { token = null; writeJSON(sessionStorage, TOKEN_KEY, null); throw Object.assign(new Error('auth'), { auth: true }); }
  if (!res.ok) throw new Error(`Google Drive respondió ${res.status}`);
  return res;
}

let fileId = null;
async function findFile() {
  if (fileId) return fileId;
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const res = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
  const { files } = await res.json();
  fileId = files?.[0]?.id ?? null;
  return fileId;
}

async function download() {
  const id = await findFile();
  if (!id) return null;
  const res = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  const json = await res.json();
  return json?.settings ? json : null;
}

async function upload(data) {
  const body = JSON.stringify({ app: 'vera', version: 1, savedAt: new Date().toISOString(), ...payloadOf(data) });
  const id = await findFile();
  if (id) {
    await api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
    });
    return;
  }
  const boundary = `vera${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  });
  fileId = (await res.json()).id;
}

async function fetchEmail() {
  try {
    const res = await api('https://www.googleapis.com/oauth2/v3/userinfo');
    return (await res.json()).email || null;
  } catch { return null; }
}

// MARK: - Ciclo de sincronización

let applyingRemote = false;
let running = null;
let again = false;

export function syncNow() {
  if (!sync.enabled) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    if (!tokenValid()) { setStatus('needs-auth'); return; }
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('syncing');
    try {
      const remote = await download();
      const merged = remote ? mergeData(store.data, remote) : store.data;
      if (canonical(payloadOf(merged)) !== canonical(payloadOf(store.data))) {
        applyingRemote = true;
        try { store.replaceData(merged); } finally { applyingRemote = false; }
      }
      if (!remote || canonical(payloadOf(merged)) !== canonical(payloadOf(remote))) await upload(store.data);
      sync.lastSync = Date.now();
      writeJSON(localStorage, PREFS_KEY, { enabled: true, email: sync.email, lastSync: sync.lastSync });
      setStatus('ok');
    } catch (err) {
      if (err.auth) setStatus('needs-auth');
      else if (!navigator.onLine) setStatus('offline');
      else setStatus('error', err.message);
    }
  })().finally(() => {
    running = null;
    if (again) { again = false; syncNow(); }
  });
  return running;
}

let debounce = null;
store.subscribe(() => {
  if (!sync.enabled || applyingRemote) return;
  clearTimeout(debounce);
  debounce = setTimeout(syncNow, 2000);
});

// MARK: - Acciones de la usuaria

/**
 * Activa la sincronización. `chooseMode(remoteExists)` se llama si hay datos en ambos lados
 * la primera vez y debe devolver 'merge' | 'drive' | null (cancelar).
 */
export async function connect(chooseMode) {
  const auth = requestToken({ consent: !sync.email });
  setStatus('syncing');
  try {
    await auth;
    const email = await fetchEmail();
    fileId = null;
    const remote = await download();
    if (remote && !store.needsOnboarding) {
      const mode = await chooseMode();
      if (!mode) { token = null; writeJSON(sessionStorage, TOKEN_KEY, null); setStatus('off'); return false; }
      if (mode === 'drive') {
        applyingRemote = true;
        try { store.replaceData(remote); } finally { applyingRemote = false; }
      }
    } else if (remote && store.needsOnboarding) {
      applyingRemote = true;
      try { store.replaceData(remote); } finally { applyingRemote = false; }
    }
    sync.enabled = true;
    sync.email = email;
    writeJSON(localStorage, PREFS_KEY, { enabled: true, email });
    await syncNow();
    return true;
  } catch (err) {
    setStatus(sync.enabled ? 'error' : 'off', err.message);
    return false;
  }
}

/** Vuelve a pedir permiso a Google (tras caducar la sesión de 1 hora) y sincroniza */
export async function reauthorize() {
  const auth = requestToken();
  try {
    await auth;
    await syncNow();
  } catch (err) {
    setStatus('needs-auth', err.message);
  }
}

/** Deja de sincronizar en este dispositivo. Los datos siguen en el navegador y en Drive. */
export function disconnect() {
  try { if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {}); } catch { /* ya revocado */ }
  token = null; tokenExp = 0; fileId = null;
  writeJSON(sessionStorage, TOKEN_KEY, null);
  writeJSON(localStorage, PREFS_KEY, null);
  Object.assign(sync, { enabled: false, email: null, lastSync: null });
  setStatus('off');
}

/** Borra el archivo de Hera del Drive de la usuaria y desconecta */
export async function deleteRemote() {
  if (!tokenValid()) await requestToken();
  const id = await findFile();
  if (id) await api(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' });
  disconnect();
}

// MARK: - Arranque

export function initSync() {
  if (!syncAvailable()) return;
  const prefs = readJSON(localStorage, PREFS_KEY);
  if (!prefs?.enabled) return;
  sync.enabled = true;
  sync.email = prefs.email || null;
  sync.lastSync = prefs.lastSync || null;
  restoreToken();
  if (tokenValid()) {
    loadGis().catch(() => {});
    syncNow();
  } else {
    setStatus('needs-auth');
  }
}

window.addEventListener('online', () => syncNow());
document.addEventListener('visibilitychange', () => { if (!document.hidden && tokenValid()) syncNow(); });
