// push.js
// Avisos push semanales del embarazo (vera-backlog#9). El permiso y la suscripción viven en el navegador;
// el servicio (push-worker/) solo recibe la suscripción y la fecha probable de parto.

import { PUSH_URL, VAPID_PUBLIC } from './config.js';

const KEY = 'vera-push-due'; // fecha de parto ya enviada al servicio (para saber si hay que actualizarla)

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'unsupported' | 'needs-install' (iPhone sin instalar) | 'denied' | 'off' | 'on' */
export async function pushState() {
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return 'unsupported';
  if (isIOS && !standalone()) return 'needs-install';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

const urlB64ToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

async function post(path, body) {
  const res = await fetch(`${PUSH_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`push ${path} ${res.status}`);
}

/** Pide permiso, suscribe este navegador y envía la fecha de parto. Lanza si algo falla. */
export async function enablePush(due) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permiso denegado');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(VAPID_PUBLIC) });
  await post('/subscribe', { sub: sub.toJSON(), due });
  try { localStorage.setItem(KEY, due); } catch { /* sin almacenamiento */ }
  await reg.showNotification('Avisos activados', { body: 'Cada semana nueva te contaremos qué es lo normal en esos días.', icon: 'icons/icon-192.png', tag: 'vera-welcome' });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    try { await post('/unsubscribe', { endpoint: sub.endpoint }); } catch { /* el servicio la descartará al caducar */ }
    await sub.unsubscribe();
  }
  try { localStorage.removeItem(KEY); } catch { /* */ }
}

/** Mantiene el servicio al día si cambia la fecha de parto o la usuaria deja el embarazo (due = null). */
export async function syncPushDue(due) {
  let sent = null;
  try { sent = localStorage.getItem(KEY); } catch { /* */ }
  if ((due || null) === (sent || null)) return;
  if (!due) { await disablePush(); return; }
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post('/subscribe', { sub: sub.toJSON(), due });
  try { localStorage.setItem(KEY, due); } catch { /* */ }
}
