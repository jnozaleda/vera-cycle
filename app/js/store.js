// store.js
// Modelos de datos y persistencia (port de AppStore.swift).
// Todo se guarda en localStorage de este navegador: no hay servidor ni cuenta.

import {
  isoFromDN, todayDN, todayISO, dnFromISO, averageCycleLength,
} from './logic.js';
import { predict, clinicalAlerts } from './predict.js';

const STORAGE_KEY = 'vera-data-v1';

export function defaultSettings() {
  return {
    lastPeriod: isoFromDN(todayDN() - 9),
    cycleLen: 28,
    periodLen: 5,
    isRegular: true,
    pastPeriods: [],
  };
}

export function emptyLog() {
  return {
    flow: null, symptoms: [], mood: null, intimacy: [], meds: [],
    basalTemp: null, stressLevel: null, sleepHours: null, weight: null,
    lhTest: null, cervicalMucus: null,
  };
}

function defaultData() {
  return { settings: defaultSettings(), logs: {}, meds: [], profile: {} };
}

/** Normaliza datos importados/guardados para tolerar campos ausentes */
function normalize(raw) {
  if (!raw || typeof raw !== 'object' || !raw.settings || typeof raw.settings.lastPeriod !== 'string') {
    throw new Error('Formato de datos no válido');
  }
  const s = raw.settings;
  const logs = {};
  for (const [k, v] of Object.entries(raw.logs || {})) {
    if (dnFromISO(k) == null || !v || typeof v !== 'object') continue;
    logs[k] = { ...emptyLog(), ...v };
  }
  return {
    settings: {
      lastPeriod: s.lastPeriod,
      cycleLen: Number(s.cycleLen) || 28,
      periodLen: Number(s.periodLen) || 5,
      isRegular: s.isRegular !== false,
      pastPeriods: Array.isArray(s.pastPeriods) ? s.pastPeriods.filter((d) => dnFromISO(d) != null) : [],
    },
    logs,
    meds: Array.isArray(raw.meds) ? raw.meds.filter((m) => m && m.id && m.name) : [],
    profile: raw.profile && typeof raw.profile === 'object' ? raw.profile : {},
  };
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

class Store {
  constructor() {
    this.data = defaultData();
    this.needsOnboarding = false;
    this.listeners = new Set();
    this.storageOK = true;
    this.load();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this._pred = null; this._alerts = null; this.listeners.forEach((fn) => fn()); }

  // MARK: Persistencia

  load() {
    let json = null;
    try { json = localStorage.getItem(STORAGE_KEY); } catch { this.storageOK = false; }
    if (json) {
      try { this.data = normalize(JSON.parse(json)); return; } catch { /* datos corruptos → onboarding */ }
    }
    this.needsOnboarding = true;
  }

  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); this.storageOK = true; } catch { this.storageOK = false; }
    this.emit();
  }

  // MARK: Logs diarios

  log(date) { return this.data.logs[date] ?? emptyLog(); }

  updateLog(date, fn) {
    const log = { ...emptyLog(), ...this.log(date) };
    log.symptoms = [...log.symptoms]; log.intimacy = [...log.intimacy]; log.meds = [...log.meds];
    fn(log);
    this.data.logs[date] = log;
    this.save();
  }

  // MARK: Medicaciones

  addMed({ name, dose, hour }) {
    this.data.meds.push({ id: uuid(), name, dose, hour });
    this.save();
  }

  removeMed(id) {
    this.data.meds = this.data.meds.filter((m) => m.id !== id);
    this.save();
  }

  // MARK: Ajustes y perfil

  updateSettings(settings) { this.data.settings = settings; this.save(); }
  updateProfile(profile) { this.data.profile = profile; this.save(); }

  completeOnboarding(settings, profile = {}) {
    this.data = { settings, logs: {}, meds: [], profile };
    this.needsOnboarding = false;
    this.save();
  }

  // MARK: Recordatorios pendientes

  pendingMeds(date = todayISO()) {
    const taken = new Set(this.log(date).meds);
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    return this.data.meds.filter((m) => {
      if (taken.has(m.id)) return false;
      const [h, mm] = m.hour.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(mm)) return false;
      return mins >= h * 60 + mm;
    });
  }

  // MARK: Predicción (cacheada hasta el próximo cambio)

  get prediction() { return (this._pred ??= predict(this.data)); }
  get alerts() { return (this._alerts ??= clinicalAlerts(this.data)); }

  /** Último peso registrado: primero los logs (más reciente), luego el perfil */
  get defaultWeight() {
    const keys = Object.keys(this.data.logs).filter((k) => this.data.logs[k].weight != null).sort();
    if (keys.length) return this.data.logs[keys[keys.length - 1]].weight;
    return this.data.profile.weightKg ?? null;
  }

  /** "Positivo" si hubo un LH positivo desde la última regla */
  get lhTestForCurrentCycle() {
    const last = dnFromISO(this.data.settings.lastPeriod);
    if (last == null) return null;
    const has = Object.entries(this.data.logs).some(([k, l]) => {
      const d = dnFromISO(k);
      return d != null && d >= last && l.lhTest?.toLowerCase() === 'positivo';
    });
    return has ? 'Positivo' : null;
  }

  // MARK: Copia de seguridad (exclusivo de la versión web)

  exportJSON() {
    return JSON.stringify({ app: 'vera', version: 1, exportedAt: new Date().toISOString(), ...this.data }, null, 2);
  }

  importJSON(text) {
    this.data = normalize(JSON.parse(text));
    this.needsOnboarding = false;
    this.save();
  }

  resetAll() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nada que borrar */ }
    this.data = defaultData();
    this.needsOnboarding = true;
    this.emit();
  }

  // MARK: Datos de ejemplo (equivale a loadDummyData de la build DEBUG)

  loadDemoData() {
    const t = todayDN();
    const ago = (n) => t - n;

    const last = ago(10);
    const p1 = ago(10 + 31);
    const p2 = ago(10 + 31 + 24);
    const p3 = ago(10 + 31 + 24 + 33);
    const p4 = ago(10 + 31 + 24 + 33 + 28);
    const p5 = ago(10 + 31 + 24 + 33 + 28 + 30);
    const p6 = ago(10 + 31 + 24 + 33 + 28 + 30 + 26);

    const lastISO = isoFromDN(last);
    const pastISO = [p1, p2, p3, p4, p5, p6].map(isoFromDN).sort();
    const settings = {
      lastPeriod: lastISO,
      cycleLen: averageCycleLength([...pastISO, lastISO]),
      periodLen: 5,
      isRegular: false,
      pastPeriods: pastISO,
    };

    const logs = {};
    const add = (dn, fields) => { logs[isoFromDN(dn)] = { ...emptyLog(), ...fields }; };

    const flows = ['Moderado', 'Abundante', 'Abundante', 'Moderado', 'Escaso'];
    for (let i = 0; i < 5; i++) {
      add(last + i, {
        flow: flows[i],
        symptoms: i < 3 ? ['Cólicos', 'Fatiga'] : ['Fatiga'],
        mood: i === 0 ? 'Sensible' : 'Tranquila',
        basalTemp: 36.15 + i * 0.04, weight: 63.5, sleepHours: 6.5, stressLevel: 'Moderado',
      });
    }
    add(ago(2), { mood: 'Con energía', basalTemp: 36.35, sleepHours: 7.5, weight: 63.0 });
    add(ago(1), { mood: 'Con energía', basalTemp: 36.30, sleepHours: 8.0, stressLevel: 'Bajo' });
    add(t, { stressLevel: 'Bajo', sleepHours: 7.5 });

    for (let i = 0; i < 5; i++) {
      add(p1 + i, {
        flow: i === 0 ? 'Abundante' : (i < 4 ? 'Moderado' : 'Escaso'),
        symptoms: i < 2 ? ['Cólicos', 'Dolor de cabeza'] : ['Fatiga'],
        mood: i < 2 ? 'Irritable' : 'Tranquila', basalTemp: 36.10, sleepHours: 6.0,
      });
    }
    add(p1 + 16, { lhTest: 'Positivo', basalTemp: 36.45, cervicalMucus: 'Elástico', mood: 'Con energía' });
    for (let i = 18; i < 31; i++) {
      const f = { basalTemp: 36.70 + (i % 3) * 0.05 };
      if (i > 25) Object.assign(f, { symptoms: ['Hinchazón', 'Sensibilidad mamaria'], mood: 'Irritable', stressLevel: 'Moderado' });
      add(p1 + i, f);
    }
    for (let i = 0; i < 5; i++) {
      add(p2 + i, { flow: i < 2 ? 'Moderado' : 'Escaso', symptoms: ['Fatiga'], mood: 'Tranquila', basalTemp: 36.20 });
    }
    add(p2 + 10, { lhTest: 'Negativo', cervicalMucus: 'Cremoso' });
    add(p2 + 12, { lhTest: 'Positivo', cervicalMucus: 'Elástico', basalTemp: 36.40 });

    this.data = { settings, logs, meds: [], profile: { birthDate: '1993-04-12', weightKg: 63.0, hormonalCondition: null } };
    this.needsOnboarding = false;
    this.save();
  }
}

export const store = new Store();
