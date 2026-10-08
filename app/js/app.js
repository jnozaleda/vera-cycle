// app.js
// Interfaz de Hera web: navegación, pestañas Hoy / Ciclo / Patrones, ajustes, calendario y onboarding.
// Port de ContentView, TodayView, CycleView, TrendsView, SettingsView y OnboardingView (SwiftUI).

import {
  PHASES, PHASE_TIPS, PHASE_SYMPTOMS, BLEEDING_SYMPTOMS, FLOW_OPTIONS, SYMPTOMS, MOODS, INTIMACY,
  STRESS_LEVELS, CERVICAL_MUCUS, LH_TEST_RESULTS, HORMONAL_CONDITIONS,
  cycleInfo, nextPeriodDN, dnFromISO, isoFromDN, todayDN, todayISO, partsFromDN, dnFromParts,
  fmtDayMonthShort, fmtDayMonthLong, fmtDayMonthYear, fmtMonthYear, fmtMonthShort, fmtWeekdayLong, fmtWeekdayNarrow,
  averageCycleLength, settingsFromIrregularPeriods,
} from './logic.js';
import { QUALITY, BASIS, windowText, predictionNotices } from './predict.js';
import { store } from './store.js';
import { icon } from './icons.js';
import {
  gestation, sinceBirth, TRIMESTER_LABEL, TRIMESTER_TEXT, timelineFor, pastItems, fluCampaign, dueFromLmp,
  PREGNANCY_SYMPTOMS, PREGNANCY_ALARMS, BABY_MOVEMENT, POSTPARTUM_SYMPTOMS, POSTPARTUM_ALARMS,
  URGENT_PREGNANCY, URGENT_POSTPARTUM, pregnancyMedWarnings,
} from './pregnancy.js';
import { babyWeek, babyCompare, BABY_MEDIA, mediaFor } from './baby.js';
import { mountFetus, FETUS_MIN_WEEK } from './fetus3d.js';
import { FOODS, FOOD_CATEGORIES, FOOD_STATUS, foodFor, bmi, gainRange, gainBandAt, appointmentICS } from './care.js';
import { GUIDE_INTRO, PREGNANCY_GUIDE, POSTPARTUM_GUIDE, guideSectionFor } from './guide.js';
import { PREGNANCY_LINE, pregnancyNormal, pregnancyFaqs, postpartumLine, postpartumNormal, postpartumBabyNormal, postpartumFaqs } from './today.js';
import { spansPregnancy } from './predict.js';
import { PREGNANCY_BETA_ONLY, CONSULT, CONSULTS, TAGLINE, CONSULT_API, CONSULT_FORM } from './config.js';
import { suggestContact } from './contacts.js';
import { isBeta } from './beta.js';
import { pushState, enablePush, disablePush, syncPush, testPush } from './push.js';
import { sync, syncAvailable, onSyncChange, initSync, connect, reauthorize, disconnect, deleteRemote, syncNow, loadGis } from './sync.js';

const CONTACT_EMAIL = 'contacto@hera-gine.com';
const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Consulta desde Hera web')}`;

// MARK: - Utilidades

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = esc;
const plural = (n, one, many) => (n === 1 ? one : many);
const fmtNum = (x, d) => x.toFixed(d).replace('.', ',');
const fmtKg = (x) => (Number.isInteger(x) ? String(x) : fmtNum(x, 1));

const PHASE_COLOR = { menstrual: 'period', ovulation: 'ovu', fertile: 'sage' };

function firstOfMonth(dn) {
  const p = partsFromDN(dn);
  return dnFromParts(p.y, p.m, 1);
}
function addMonths(firstDN, n) {
  const p = partsFromDN(firstDN);
  const idx = p.y * 12 + (p.m - 1) + n;
  return dnFromParts(Math.floor(idx / 12), (idx % 12) + 1, 1);
}
function daysInMonth(firstDN) {
  return addMonths(firstDN, 1) - firstDN;
}
/** 0 = lunes … 6 = domingo */
const mondayIndex = (dn) => (partsFromDN(dn).wd + 6) % 7;

// MARK: - Estado de la interfaz

function initialOnboarding() {
  const t = todayDN();
  const p = partsFromDN(t);
  return {
    step: 0,
    isRegular: true,
    lastPeriod: isoFromDN(t - 9),
    month: firstOfMonth(t - 9),
    cycleLen: 28,
    periodLen: 5,
    pastPeriods: [],
    pickerDate: todayISO(),
    profileSubStep: 0,
    birthDate: `${p.y - 28}-${String(p.m).padStart(2, '0')}-${String(Math.min(p.d, 28)).padStart(2, '0')}`,
    weightKg: 60,
    hormonalCondition: 'Ninguna',
    stageChosen: false,     // ya ha elegido qué seguir (ciclo / embarazo / posparto)
    flow: 'cycle',
    dueDate: '',
    lmp: '',
    birthDate2: '',         // fecha del parto (posparto)
  };
}

const ui = {
  tab: 0,
  sheet: null,            // 'settings' | 'calendar' | null
  selectedDate: todayISO(),
  weekOffset: 0,
  showMoreSymptoms: false,
  showMedForm: false,
  newMed: { name: '', dose: '', hour: '09:00' },
  calMonth: firstOfMonth(todayDN()),
  draft: null,            // copia editable de settings en el sheet de ajustes
  draftPicker: todayISO(),
  ob: initialOnboarding(),
  syncChoice: null,       // resolver del diálogo "combinar datos" al conectar Google
  draftStage: null,       // borrador de la etapa (ciclo / embarazo / posparto) en ajustes
  draftLmp: '',
  dueMode: 'lmp',         // campo de fecha del embarazo: 'lmp' (última regla, por defecto) o 'due' (fecha de parto)
  guideQuery: '',
  openDetails: new Set(), // preguntas abiertas en la guía
  babyWeek: null,         // semana que se está viendo en «Mi bebé» (null = la actual)
  babyMedia: 'illustration',
  careSection: 'agenda',
  newAppt: { title: '', date: '', time: '' },
  careForm: { height: '', preWeight: '', weight: '' },
  foodQuery: '',
  foodCat: 'Todos',
  ask: { context: '', include: true, text: '', sent: null, to: null, manual: false, email: (() => { try { return localStorage.getItem('hera-ask-email') || ''; } catch { return ''; } })(), status: null, result: null, notify: null }, // hoja de consulta
  babyForm: { birth: '', date: '', weight: '' },          // peso del recién nacido
  pushState: 'unknown',   // avisos push: 'unknown' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'
  pushBusy: false,
  pushMsg: '',
  ppBabyWeek: null,       // posparto · semana de vida del bebé que se está viendo (null = la actual)
  hoyView: 'me',         // embarazo · Hoy: 'me' | 'baby' (el desarrollo del bebé vive dentro de Hoy)
};

// =========================================================================
// MARK: - Componentes
// =========================================================================

const eyebrow = (text) => `<div class="eyebrow">${esc(text)}</div>`;

function chip(label, active, action, data = {}, tone = 'deep') {
  const d = Object.entries(data).map(([k, v]) => `data-${k}="${attr(v)}"`).join(' ');
  return `<button class="chip tone-${tone} ${active ? 'on' : ''}" aria-pressed="${active}" data-action="${action}" ${d}>${esc(label)}</button>`;
}

function statCard(value, label, color = 'deep') {
  return `<div class="card stat"><div class="stat-v c-${color}">${esc(value)}</div><div class="stat-l">${label}</div></div>`;
}

function primaryButton(label, action, disabled = false, data = '') {
  return `<button class="btn-primary" data-action="${action}" ${data} ${disabled ? 'disabled' : ''}>${esc(label)}</button>`;
}

function rangeRow({ key, min, max, step, value, tone = 'deep', out }) {
  return `<input type="range" class="range tone-${tone}" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${value}" style="--p:${rangePct(value, min, max)}" aria-label="${attr(key)}">
    ${out != null ? `<output class="range-out" data-out="${key}">${esc(out)}</output>` : ''}`;
}

const rangePct = (v, min, max) => `${(((v - min) / (max - min)) * 100).toFixed(1)}%`;
const capFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Rejilla de mes (lunes primero). cellFn(dn) devuelve el HTML de cada día. */
function monthGrid(first, cellFn) {
  const head = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<div class="mg-h">${d}</div>`).join('');
  const offset = mondayIndex(first);
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="mg-empty"></div>';
  const total = daysInMonth(first);
  for (let i = 0; i < total; i++) cells += cellFn(first + i);
  return `<div class="month-grid">${head}${cells}</div>`;
}

// MARK: - Dial del ciclo

function cycleDial(settings, info) {
  const S = 290, cx = S / 2, cy = S / 2, r = 118;
  const len = settings.cycleLen;
  const ang = (day) => ((day / len) * 360 - 90) * Math.PI / 180;
  const pt = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  const arc = (from, to, color, w) => {
    const [x1, y1] = pt(ang(from), r);
    const [x2, y2] = pt(ang(to), r);
    const large = ((to - from) / len) * 360 > 180 ? 1 : 0;
    return `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" stroke="var(--${color})" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  };
  const ovu = len - 14;
  let ticks = '';
  for (let i = 0; i < len; i++) {
    const a = ang(i);
    const major = i % 7 === 0;
    const [x1, y1] = pt(a, r + 14);
    const [x2, y2] = pt(a, r + (major ? 24 : 19));
    ticks += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="var(--gold)" stroke-opacity="${major ? 0.9 : 0.45}" stroke-width="${major ? 1.6 : 0.8}" stroke-linecap="round"/>`;
  }
  const [dx, dy] = pt(ang(info.day - 1), r);
  return `
  <div class="dial" role="img" aria-label="Día ${info.day} del ciclo, ${attr(PHASES[info.phase].label)}">
    <svg viewBox="0 0 ${S} ${S}" width="100%" height="100%">
      <circle cx="${cx}" cy="${cy}" r="${r}" stroke="var(--mist)" stroke-width="10" fill="none"/>
      ${arc(0.15, settings.periodLen - 0.15, 'period', 10)}
      ${arc(ovu - 5, ovu + 1.4, 'sage', 10)}
      ${arc(ovu + 0.32, ovu + 0.72, 'ovu', 13)}
      ${ticks}
      <circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="9" fill="var(--st)" stroke="var(--ivory)" stroke-width="3"/>
    </svg>
    <div class="dial-center">
      <div class="dial-dia">DÍA</div>
      <div class="dial-num">${info.day}</div>
      <div class="dial-phase">${esc(PHASES[info.phase].label.toUpperCase())}</div>
    </div>
  </div>`;
}

// MARK: - Banner de recordatorios y nudge

function reminderBanner() {
  const pending = store.pendingMeds(todayISO());
  if (!pending.length) return '';
  return `<div class="stack-8 pad-x mb-8">${pending.map((m) => `
    <div class="reminder">
      <span class="reminder-bell" aria-hidden="true">🔔</span>
      <div class="grow">
        <div class="t-135 w-500">Toma pendiente · ${esc(m.name)}</div>
        <div class="t-12 soft">${m.dose ? esc(m.dose) + ' · ' : ''}programada a las ${esc(m.hour)}</div>
      </div>
      <button class="pill-dark" data-action="take-med" data-id="${attr(m.id)}">Tomada ✓</button>
    </div>`).join('')}</div>`;
}

function irregularNudge() {
  const s = store.data.settings;
  if (s.isRegular || s.pastPeriods.length >= 3) return '';
  return `<div class="pad-x mb-8"><button class="nudge" data-action="open-settings">
    <span class="nudge-ic">${icon('wave', 18)}</span>
    <span class="grow left">
      <span class="t-13 w-500 block">Mejora tus predicciones</span>
      <span class="t-12 soft block">Añade tus últimas reglas para que Hera calcule tu ciclo medio.</span>
    </span>
    ${icon('right', 12, 'soft')}
  </button></div>`;
}

// =========================================================================
// MARK: - Pestaña HOY
// =========================================================================

function qualityChip(label, q, suffix) {
  const tone = { insufficient: 'q0', low: 'q1', medium: 'q2', high: 'q3' }[q];
  const filled = QUALITY[q].fraction * 4;
  const dots = [0, 1, 2, 3].map((i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
  return `<span class="qchip ${tone}"><span class="qdots">${dots}</span><span class="soft">${label}</span><b>${QUALITY[q].label}</b>${suffix ? `<span class="soft t-10">${suffix}</span>` : ''}</span>`;
}

function irregularPredictionCard(p) {
  const ov = p.ovulationEstimate ?? (p.predictedDate - Math.round(p.lutealPhase.mean));
  const fStart = ov - 5, fEnd = ov + 1;
  let hint = null;
  if (p.ovulationQuality === 'insufficient') hint = 'Haz un test LH para predecir tu ventana fértil';
  else if (p.ovulationQuality === 'low') hint = 'Mejora con test LH en el ciclo actual';
  else if (p.periodQuality === 'insufficient' || p.periodQuality === 'low') hint = 'Registra más ciclos para mejorar la precisión';
  const high = BASIS[p.predictionBasis].high;

  return `<div class="stack-14 mt-6">
    <div class="card pad stack-10 preg-hero">
      ${eyebrow('Tu próxima regla')}
      <div class="row between center">
        <div class="row baseline gap-10">
          <span class="preg-weeks sm">${p.daysUntil}</span>
          <span class="stack-0"><span class="serif-22">${plural(p.daysUntil, 'día', 'días')}</span><span class="t-12 soft">para la regla</span></span>
        </div>
        <div class="text-right"><div class="t-11 soft">Prevista el</div><div class="t-14 w-500">${esc(fmtDayMonthShort(p.predictedDate))}</div><div class="t-11 soft">${esc(windowText(p))}</div></div>
      </div>
      <hr>
      <div class="hero-dates">
        <div>${icon('leaf', 14)}<div><div class="t-11 soft">Ventana fértil</div><div class="t-14 w-500">${esc(fmtDayMonthShort(fStart))} – ${esc(fmtDayMonthShort(fEnd))}</div></div></div>
        <div>${icon('ovum', 14)}<div><div class="t-11 soft">Ovulación</div><div class="t-14 w-500">${esc(fmtDayMonthShort(ov))}</div></div></div>
      </div>
    </div>
    <div class="card pad stack-10">
      <div class="row gap-10 center wrap">
        ${qualityChip('Regla', p.periodQuality, p.confidenceDays > 0 ? `±${p.confidenceDays}d` : null)}
        ${qualityChip('Fértil', p.ovulationQuality, null)}
        <span class="grow"></span>
        <span class="${high ? 'c-sage' : 'c-gold'}" title="${attr(BASIS[p.predictionBasis].label)}">${icon(high ? 'checkCircle' : 'bars', 14)}</span>
      </div>
      ${hint ? `<div class="row gap-5 t-12 soft"><span class="c-gold">${icon('arrowUp', 12)}</span>${esc(hint)}</div>` : ''}
      ${predictionNotices(p).map((n) => `<div class="row gap-6 top t-12 soft lh-3"><span class="c-gold mt-1">${icon('info', 12)}</span><span>${esc(n)}</span></div>`).join('')}
    </div>
  </div>`;
}

function todayView() {
  const settings = store.data.settings;
  const info = cycleInfo(settings);
  const phase = PHASES[info.phase];
  let top;

  if (settings.isRegular) {
    const last = dnFromISO(settings.lastPeriod) ?? todayDN();
    const ovDN = last + (settings.cycleLen - 14) - 1;
    const next = nextPeriodDN(settings);
    top = `
    <div class="stack-14 mt-6 center-x">
      ${cycleDial(settings, info)}
      <div class="row gap-18 justify-center">
        <span class="legend"><i class="bg-period"></i>Regla</span>
        <span class="legend"><i class="bg-sage"></i>Ventana fértil</span>
        <span class="legend"><i class="bg-ovu"></i>Ovulación</span>
      </div>
    </div>
    <div class="card pad stack-10 preg-hero">
      ${eyebrow('Tu próxima regla')}
      <div class="row between center">
        <div class="row baseline gap-10">
          <span class="preg-weeks sm">${info.daysToNext}</span>
          <span class="stack-0"><span class="serif-22">${plural(info.daysToNext, 'día', 'días')}</span><span class="t-12 soft">para la regla</span></span>
        </div>
        <div class="text-right"><div class="t-11 soft">Prevista el</div><div class="t-14 w-500">${esc(fmtDayMonthShort(next))}</div></div>
      </div>
      <hr>
      <div class="hero-dates">
        <div>${icon('leaf', 14)}<div><div class="t-11 soft">Ventana fértil</div><div class="t-14 w-500">${esc(fmtDayMonthShort(ovDN - 5))} – ${esc(fmtDayMonthShort(ovDN + 1))}</div></div></div>
        <div>${icon('ovum', 14)}<div><div class="t-11 soft">Ovulación estimada</div><div class="t-14 w-500">${esc(fmtDayMonthShort(ovDN))}</div></div></div>
      </div>
    </div>`;
  } else {
    top = irregularPredictionCard(store.prediction);
  }

  // Resumen de la semana
  const counts = {};
  const t = todayDN();
  for (let o = 0; o < 7; o++) for (const s of store.log(isoFromDN(t - o)).symptoms) counts[s] = (counts[s] || 0) + 1;
  const topWeek = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

  const meds = store.data.meds;
  let taken = 0, total = 0;
  if (meds.length) {
    for (let o = 0; o < 7; o++) {
      const l = store.log(isoFromDN(t - o));
      total += meds.length;
      taken += meds.filter((m) => l.meds.includes(m.id)).length;
    }
  }
  const pct = total ? taken / total : 0;

  return `<div class="stack-18">
    ${postpartumCycleNote()}
    ${top}
    <div class="card pad stack-14">
      <div class="row baseline between">${eyebrow(`Estás en fase ${phase.label.toLowerCase()}`)}<span class="t-11 soft nowrap">Día ${info.day}</span></div>
      <div class="serif-19">${esc(phase.insightTitle)}</div>
      <p class="t-13 light soft lh-5">${esc(phase.insightText)}</p>
      <hr>
      <ul class="tips">${PHASE_TIPS[info.phase].map((tip) => `<li>${esc(tip)}</li>`).join('')}</ul>
      ${askLink('¿Dudas sobre esta fase?', 'Pregúntanos', `${phase.label} · día ${info.day} del ciclo`)}
    </div>
    <div class="card pad stack-14">
      ${eyebrow('Esta semana')}
      ${topWeek.length ? `<div class="stack-6"><div class="t-12 soft">Síntomas más frecuentes</div>
        <div class="row gap-8 wrap">${topWeek.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div></div>`
        : '<div class="t-13 soft">Aún no hay síntomas registrados esta semana.</div>'}
      ${total > 0 ? `<hr><div class="row between center">
        <div><div class="t-12 soft">Medicación</div><div class="t-13 w-500">${taken} de ${total} tomas</div></div>
        <div class="minibar"><i class="${pct > 0.75 ? 'bg-sage' : 'bg-gold'}" style="width:${(pct * 100).toFixed(1)}%"></i></div>
      </div>` : ''}
    </div>
  </div>`;
}

// =========================================================================
// MARK: - Pestaña CICLO (diario)
// =========================================================================

function weekStrip(phaseColors = true) {
  const t = todayDN();
  const weekStart = t - mondayIndex(t) + ui.weekOffset * 7;
  const today = todayISO();
  let days = '';
  for (let i = 0; i < 7; i++) {
    const dn = weekStart + i;
    const ds = isoFromDN(dn);
    const isSel = ds === ui.selectedDate;
    const isToday = ds === today;
    const isFuture = ds > today;
    const info = cycleInfo(store.data.settings, dn);
    const l = store.log(ds);
    const hasLog = l.flow != null || l.symptoms.length > 0 || l.mood != null;
    const pc = phaseColors ? PHASE_COLOR[info.phase] : null;
    const cls = ['wday', isSel && 'sel', isToday && !isSel && 'today', isFuture && 'future', pc && `ph-${pc}`, hasLog && 'logged'].filter(Boolean).join(' ');
    days += `<button class="${cls}" data-action="select-day" data-date="${ds}" ${isFuture ? 'disabled' : ''} aria-label="${attr(fmtWeekdayLong(dn))}">
      <span class="wd-l">${esc(fmtWeekdayNarrow(dn))}</span>
      <span class="wd-n">${partsFromDN(dn).d}</span>
      <span class="wd-dot"></span>
    </button>`;
  }
  return `<div class="card pad stack-10">
    <div class="row between center">
      <button class="sq-btn" data-action="week-prev" aria-label="Semana anterior">${icon('left', 12)}</button>
      <div class="t-13 w-500 upper track-1 c-deep">${esc(fmtMonthYear(weekStart))}</div>
      <button class="sq-btn" data-action="week-next" aria-label="Semana siguiente" ${ui.weekOffset >= 0 ? 'disabled' : ''}>${icon('right', 12)}</button>
    </div>
    <div class="week">${days}</div>
    <button class="outline-gold" data-action="open-calendar">${icon('calendar', 11)} Ver mes completo</button>
  </div>`;
}

function symptomChip(s, log) {
  const tone = BLEEDING_SYMPTOMS.has(s) ? 'rose' : 'deep';
  return chip(s, log.symptoms.includes(s), 'toggle-symptom', { s }, tone);
}

// Campos numéricos del diario: se escribe el número o se ajusta con − / +
const NUM_FIELDS = {
  basalTemp: { unit: '°C', step: 0.1, min: 34, max: 42, round: 0.1, def: 36.5, fixed: 1 },
  sleepHours: { unit: 'h', step: 0.5, min: 0, max: 16, round: 0.5, def: 7 },
  weight: { unit: 'kg', step: 0.5, min: 30, max: 200, round: 0.1, def: 60 },
};
const fmtField = (key, v) => (NUM_FIELDS[key].fixed != null ? fmtNum(v, NUM_FIELDS[key].fixed)
  : Number.isInteger(v) ? String(v) : fmtNum(v, 1));
const numDefault = (key) => (key === 'weight' ? (store.defaultWeight ?? NUM_FIELDS.weight.def) : NUM_FIELDS[key].def);
const roundField = (key, v) => {
  const f = NUM_FIELDS[key];
  return Math.min(f.max, Math.max(f.min, Number((Math.round(v / f.round) * f.round).toFixed(2))));
};

function trackingSlider(label, ic, tone, key, value, def) {
  const f = NUM_FIELDS[key];
  return `<div class="stack-6">
    <div class="num-row">
      <div class="num-label grow"><span class="c-${tone === 'deep' ? 'deep' : tone}">${icon(ic, 13)}</span><span><span class="t-13 w-500 soft">${label}</span>${def.note ? `<span class="block">${def.note}</span>` : ''}</span></div>
      <div class="stepper">
        <button class="step-btn" data-action="num-step" data-key="${key}" data-dir="-1" aria-label="Menos ${attr(label.toLowerCase())}">−</button>
        <label class="num-box ${value != null ? 'filled' : ''}">
          <input class="num-input" data-num="${key}" inputmode="decimal" enterkeyhint="done" autocomplete="off"
            value="${value != null ? attr(fmtField(key, value)) : ''}" placeholder="${attr(fmtField(key, numDefault(key)))}" aria-label="${attr(label)} en ${f.unit}">
          <span>${f.unit}</span>
        </label>
        <button class="step-btn" data-action="num-step" data-key="${key}" data-dir="1" aria-label="Más ${attr(label.toLowerCase())}">+</button>
      </div>
    </div>
    ${value != null ? `<button class="link-soft self-end" data-action="clear-field" data-field="${key}">Borrar</button>` : ''}
  </div>`;
}

function cycleView() {
  const ds = ui.selectedDate;
  const isToday = ds === todayISO();
  const log = store.log(ds);
  const phaseInfo = cycleInfo(store.data.settings, dnFromISO(ds));
  const phaseSymptoms = PHASE_SYMPTOMS[phaseInfo.phase] ?? SYMPTOMS;
  const seen = new Set(phaseSymptoms);
  const extra = [];
  for (const s of [...Object.values(PHASE_SYMPTOMS).flat(), ...SYMPTOMS]) if (!seen.has(s)) { seen.add(s); extra.push(s); }
  const bleeding = log.symptoms.some((s) => BLEEDING_SYMPTOMS.has(s));
  const lhDefault = store.lhTestForCurrentCycle;
  const effLH = log.lhTest ?? lhDefault;
  const dw = store.defaultWeight;

  const mood = `<div class="card pad-0">
    <div class="px-20 pt-20">${eyebrow('Cómo te sentiste')}</div>
    <div class="hscroll-wrap"><div class="hscroll">${MOODS.map((m) => chip(m, log.mood === m, 'set-mood', { v: m })).join('')}</div></div>
  </div>`;

  const symptoms = `<div class="card pad stack-14">
    <div class="row baseline between">${eyebrow('Síntomas')}<span class="t-11 soft">${esc(PHASES[phaseInfo.phase].label)}</span></div>
    <div class="chips">${phaseSymptoms.map((s) => symptomChip(s, log)).join('')}</div>
    ${log.symptoms.length ? askLink('¿Te preocupa?', 'Pregúntanos', `${log.symptoms.join(', ')} · ${PHASES[phaseInfo.phase].label.toLowerCase()}`) : ''}
    ${bleeding ? `<div class="flow-picker">
      <div class="row gap-6 center wrap"><span class="c-rose">${icon('drop', 11)}</span><span class="t-12 w-500 soft">¿Cuánto estás usando?</span><span class="t-11 soft-70">(recambios de compresa/tampón)</span></div>
      <div class="hscroll">${FLOW_OPTIONS.map((o) => `<button class="flow-opt ${log.flow === o.id ? 'on' : ''}" aria-pressed="${log.flow === o.id}" data-action="set-flow" data-v="${o.id}"><span class="t-13">${o.label}</span><span class="t-10">${o.sublabel}</span></button>`).join('')}</div>
    </div>` : ''}
    <button class="link-soft w-500 row gap-6 center" data-action="toggle-more">${icon(ui.showMoreSymptoms ? 'up' : 'down', 10)} ${ui.showMoreSymptoms ? 'Ocultar síntomas adicionales' : 'Más síntomas'}</button>
    ${ui.showMoreSymptoms ? `<div class="stack-10"><hr><div class="chips">${extra.map((s) => symptomChip(s, log)).join('')}</div></div>` : ''}
  </div>`;

  const intimacy = `<div class="card pad stack-12">
    ${eyebrow('Intimidad y flujo')}
    <div class="chips">${INTIMACY.map((s) => chip(s, log.intimacy.includes(s), 'toggle-intimacy', { v: s }, 'gold')).join('')}</div>
  </div>`;

  const tracking = `<div class="card pad stack-16">
    ${eyebrow('Seguimiento')}
    <div class="stack-8">
      <div class="row gap-6 center"><span class="c-gold">${icon('dotted', 13)}</span><span class="t-13 w-500 soft">Test LH</span>
        ${lhDefault === 'Positivo' && log.lhTest == null ? '<span class="t-11 c-gold">· positivo este ciclo</span>' : ''}</div>
      <div class="row gap-8">${LH_TEST_RESULTS.map((v) => chip(v, effLH === v, 'set-lh', { v }, v === 'Positivo' ? 'gold' : 'inksoft')).join('')}</div>
    </div>
    <hr>
    ${trackingSlider('Temperatura basal', 'thermo', 'rose', 'basalTemp', log.basalTemp, { value: 36.5 }, 35.5, 38.5, 0.1, (v) => `${fmtNum(v, 1)} °C`)}
    <hr>
    <div class="stack-8">
      <div class="row gap-6 center"><span class="c-deep">${icon('heartPulse', 13)}</span><span class="t-13 w-500 soft">Nivel de estrés</span></div>
      <div class="row gap-8">${STRESS_LEVELS.map((v) => chip(v, log.stressLevel === v, 'set-stress', { v })).join('')}</div>
    </div>
    <hr>
    ${trackingSlider('Horas de sueño', 'moon', 'deep', 'sleepHours', log.sleepHours, { value: 7 }, 3, 12, 0.5, (v) => `${fmtNum(v, 1)} h`)}
    <hr>
    ${trackingSlider('Peso', 'scale', 'deep', 'weight', log.weight,
      { value: dw ?? 60, note: log.weight == null && dw != null ? `<span class="t-11 soft-70">· último: ${Math.trunc(dw)} kg</span>` : '' },
      35, 150, 1, (v) => `${Math.trunc(v)} kg`)}
    <hr>
    <div class="stack-8">
      <div class="row gap-6 center"><span class="c-sage">${icon('dropOutline', 13)}</span><span class="t-13 w-500 soft">Flujo cervical</span></div>
      <div class="chips">${CERVICAL_MUCUS.map((v) => chip(v, log.cervicalMucus === v, 'set-mucus', { v }, 'sage')).join('')}</div>
    </div>
  </div>`;

  return `<div class="stack-18">
    ${weekStrip()}
    ${!isToday ? `<div class="row gap-8 center px-4"><span class="c-gold">${icon('pencil', 14)}</span><span class="t-13 soft">Editando el ${esc(fmtWeekdayLong(dnFromISO(ds)))}</span></div>` : ''}
    ${mood}${symptoms}${intimacy}${tracking}
    ${isToday ? medicationSection(log) : ''}
  </div>`;
}

function medicationSection(log) {
  const meds = store.data.meds;
  const notifSupported = 'Notification' in window;
  const perm = notifSupported ? Notification.permission : 'unsupported';
  return `<div class="card pad stack-14">
    <div class="row between center">${eyebrow('Mi medicación')}
      <button class="pill-outline" data-action="toggle-med-form">${ui.showMedForm ? 'Cerrar' : '+ Añadir'}</button></div>
    ${ui.showMedForm ? `<div class="stack-10">
      <input class="field" data-model="newMed.name" placeholder="Nombre (p. ej. Anticonceptivo, hierro…)" value="${attr(ui.newMed.name)}" maxlength="80">
      <input class="field" data-model="newMed.dose" placeholder="Dosis (p. ej. 1 comprimido)" value="${attr(ui.newMed.dose)}" maxlength="80">
      <label class="field row between center"><span class="t-135 soft">Hora de la toma</span><input type="time" class="time" data-model="newMed.hour" value="${attr(ui.newMed.hour)}"></label>
      ${primaryButton('Guardar medicación', 'save-med')}
    </div>` : ''}
    ${!meds.length && !ui.showMedForm ? '<p class="t-14 soft">Añade tu anticonceptivo, suplementos o tratamientos para marcar cada toma diaria.</p>' : ''}
    ${meds.map((m) => {
      const taken = log.meds.includes(m.id);
      return `<div class="med-row ${taken ? 'taken' : ''}">
        <button class="med-check" data-action="toggle-med" data-id="${attr(m.id)}" aria-pressed="${taken}" aria-label="Marcar ${attr(m.name)} como tomada">${taken ? icon('check', 11) : ''}</button>
        <div class="grow"><div class="t-15 w-500">${esc(m.name)}</div><div class="t-125 soft">${m.dose ? esc(m.dose) : '—'} · ${esc(m.hour)}</div></div>
        <button class="icon-btn soft" data-action="delete-med" data-id="${attr(m.id)}" aria-label="Eliminar ${attr(m.name)}">${icon('x', 12)}</button>
      </div>`;
    }).join('')}
    ${meds.length && perm === 'default' ? `<button class="outline-sage" data-action="enable-notifs">${icon('bell', 14)} Activar avisos de toma</button>` : ''}
    ${meds.length && perm === 'granted' ? `<div class="t-125 c-sage text-center row gap-6 justify-center center">${icon('check', 12)} Avisos activados mientras Hera esté abierta</div>` : ''}
  </div>`;
}

// =========================================================================
// MARK: - Pestaña PATRONES
// =========================================================================

const BUBBLE_PHASES = [
  { label: 'Menstrual', keys: ['Fase menstrual'], color: 'var(--rose)' },
  { label: 'Folicular', keys: ['Fase folicular'], color: 'rgb(222,189,128)' },
  { label: 'Fértil', keys: ['Ventana fértil', 'Ovulación'], color: 'var(--sage)' },
  { label: 'Lútea', keys: ['Fase lútea'], color: 'rgb(173,135,102)' },
];

function computeStats() {
  const { logs, settings } = store.data;
  const symCounts = {}, moodCounts = {}, phaseSym = {};
  let bleedDays = 0, loggedDays = 0;
  for (const [ds, log] of Object.entries(logs)) {
    const has = log.flow != null || log.symptoms.length || log.mood != null || log.intimacy.length;
    if (!has) continue;
    loggedDays++;
    if (log.flow != null) bleedDays++;
    if (log.mood) moodCounts[log.mood] = (moodCounts[log.mood] || 0) + 1;
    const dn = dnFromISO(ds);
    if (dn == null) continue;
    const phase = PHASES[cycleInfo(settings, dn).phase].label;
    for (const s of log.symptoms) {
      symCounts[s] = (symCounts[s] || 0) + 1;
      phaseSym[s] ??= {};
      phaseSym[s][phase] = (phaseSym[s][phase] || 0) + 1;
    }
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
  const allDates = [...new Set([...settings.pastPeriods, settings.lastPeriod])].map(dnFromISO).filter((d) => d != null).sort((a, b) => a - b);
  const cycles = allDates
    .map((d, i) => ({ start: d, length: i + 1 < allDates.length ? allDates[i + 1] - d : null }))
    .filter((c) => c.length == null || !spansPregnancy(c.start, c.start + c.length, store.stage));
  return { loggedDays, bleedDays, topSymptoms: top(symCounts, 6), topMoods: top(moodCounts, 5), phaseSym, cycles };
}

function cycleLearnedCard(p) {
  const foll = p.follicularPhase, lut = p.lutealPhase;
  const total = foll.mean + lut.mean;
  const fw = total > 0 ? (foll.mean / total) * 100 : 50;
  const n = p.periodCycleCount;
  return `<div class="card pad stack-14">
    ${eyebrow('Tu ciclo')}
    <div class="row between center">
      <div><div class="serif-28">~${Math.round(total)} días</div><div class="t-12 soft">duración media de tu ciclo</div></div>
      ${n > 0 ? `<span class="t-12 soft">${n} ${plural(n, 'ciclo', 'ciclos')}</span>` : ''}
    </div>
    <div class="split-bar">
      <div class="bg-goldsoft" style="width:${fw.toFixed(1)}%">${Math.round(foll.mean)}d</div>
      <div class="bg-rose55" style="width:${(100 - fw).toFixed(1)}%">${Math.round(lut.mean)}d</div>
    </div>
    <div class="row gap-20">
      <div class="row gap-6 center"><i class="swatch bg-goldsoft"></i><div><div class="t-11 soft">Folicular</div><div class="t-11 w-500">~${Math.round(foll.mean)}d · ±${fmtNum(foll.sd, 1)}d</div></div></div>
      <div class="row gap-6 center"><i class="swatch bg-rose55"></i><div><div class="t-11 soft">Lútea</div><div class="t-11 w-500">~${Math.round(lut.mean)}d · ±${fmtNum(lut.sd, 1)}d</div></div></div>
    </div>
    ${n < 3 ? `<div class="row gap-6 top t-12 soft lh-3"><span class="c-gold mt-1">${icon('info', 11)}</span><span>${n === 0
      ? 'Usando datos generales. Registra más ciclos para personalizar.'
      : `Con ${n} ${plural(n, 'ciclo registrado', 'ciclos registrados')}. La precisión mejorará pronto.`}</span></div>` : ''}
    ${n >= 3 && foll.n < 2 ? `<div class="row gap-6 top t-12 soft lh-3"><span class="c-gold mt-1">${icon('info', 11)}</span><span>El reparto folicular/lútea es una estimación — mejora con test LH o temperatura basal.</span></div>` : ''}
  </div>`;
}

function cycleHistoryCard(cycles, periodLen, meanLength) {
  const completed = cycles.filter((c) => c.length != null).slice(-8);
  const current = [...cycles].reverse().find((c) => c.length == null);
  const maxLen = Math.max(Math.max(28, ...completed.map((c) => c.length)), 35);
  const pctOf = (d) => `${Math.max(0, Math.min(100, (d / maxLen) * 100)).toFixed(2)}%`;
  const meanPct = pctOf(meanLength);

  const bar = (c) => {
    const len = c.length;
    const bleed = Math.min(periodLen, len);
    const rest = Math.max(0, len - periodLen);
    return `<div class="hist-row">
      <span class="hist-d">${esc(fmtDayMonthShort(c.start))}</span>
      <div class="hist-track">
        <i class="bg-rose70" style="width:${pctOf(bleed)}"></i>${rest > 0 ? `<i class="bg-goldsoft" style="width:${pctOf(rest)}"></i>` : ''}
        ${meanLength <= maxLen ? `<b class="hist-mean" style="left:${meanPct}"></b>` : ''}
      </div>
      <span class="hist-n">${len}d</span>
    </div>`;
  };
  let cur = '';
  if (current) {
    const elapsed = todayDN() - current.start;
    const bleed = Math.min(periodLen, elapsed);
    const rest = Math.max(0, elapsed - periodLen);
    cur = `<div class="hist-row">
      <span class="hist-d">${esc(fmtDayMonthShort(current.start))}</span>
      <div class="hist-track current">
        <i class="bg-rose45" style="width:${pctOf(bleed)}"></i>${rest > 0 ? `<i class="bg-goldsoft60" style="width:${pctOf(rest)}"></i>` : ''}
        <b class="hist-now" style="left:${pctOf(bleed + rest)}"></b>
      </div>
      <span class="hist-n soft">→</span>
    </div>`;
  }
  return `<div class="card pad stack-12">
    <div class="row baseline between">${eyebrow('Historial de ciclos')}<span class="t-11 soft">${completed.length} ciclos</span></div>
    <div class="hist-row"><span class="hist-d"></span><div class="hist-meanlabel"><span style="left:${meanPct}">${icon('minus', 8)} Media · ${Math.round(meanLength)}d</span></div><span class="hist-n"></span></div>
    <div class="stack-7">${[...completed].reverse().map(bar).join('')}${cur}</div>
    <div class="row gap-14"><span class="legend small"><i class="bg-rose70 sq"></i>Regla</span><span class="legend small"><i class="bg-goldsoft sq"></i>Resto del ciclo</span></div>
  </div>`;
}

function bubbleCard(topSymptoms, phaseSym) {
  const countFor = (name, col) => col.keys.reduce((a, k) => a + (phaseSym[name]?.[k] || 0), 0);
  let mx = 1;
  for (const s of topSymptoms) for (const c of BUBBLE_PHASES) mx = Math.max(mx, countFor(s.name, c));
  const cell = (count, color) => {
    const size = count === 0 ? 6 : Math.max(6, 28 * count / mx);
    return `<span class="bubble" style="width:${size}px;height:${size}px;background:${color};opacity:${count === 0 ? 0.12 : 0.72}" title="${count}"></span>`;
  };
  let insight = '';
  const topS = topSymptoms[0];
  if (topS) {
    const dom = BUBBLE_PHASES.reduce((best, c) => (countFor(topS.name, c) > countFor(topS.name, best) ? c : best), BUBBLE_PHASES[0]);
    if (countFor(topS.name, dom) > 0) {
      insight = `<div class="row gap-6 top mt-12 t-12 soft italic lh-3"><span class="c-gold mt-1">${icon('leaf', 11)}</span><span>«${esc(topS.name)}» aparece más en tu fase ${dom.label.toLowerCase()}.</span></div>`;
    }
  }
  return `<div class="card pad">
    <div class="mb-14">${eyebrow('Cuándo aparecen tus síntomas')}</div>
    <div class="bubble-grid">
      <span></span>${BUBBLE_PHASES.map((c) => `<span class="bubble-h" style="color:${c.color};background:color-mix(in srgb, ${c.color} 12%, transparent)">${c.label}</span>`).join('')}
      ${topSymptoms.map((s) => `<span class="bubble-name">${esc(s.name)}</span>${BUBBLE_PHASES.map((c) => `<span class="bubble-cell">${cell(countFor(s.name, c), c.color)}</span>`).join('')}`).join('')}
    </div>
    <div class="row justify-center gap-20 mt-14 center">
      <span class="row gap-6 center t-10 soft"><span class="bubble" style="width:8px;height:8px;background:var(--ink-soft);opacity:.18"></span>poco frecuente</span>
      <span class="row gap-6 center t-10 soft"><span class="bubble" style="width:22px;height:22px;background:var(--ink-soft);opacity:.45"></span>muy frecuente</span>
    </div>
    ${insight}
  </div>`;
}

function alertsCard(alerts) {
  return `<div class="card pad stack-14">
    ${eyebrow('Alertas')}
    <div class="stack-12">
      ${alerts.flags.map((f) => `<div class="row gap-10 top"><span class="${f.severity === 'alta' ? 'c-rose' : 'c-gold'} mt-1">${icon(f.severity === 'alta' ? 'alertFill' : 'infoFill', 14)}</span><span class="t-13 lh-4">${esc(f.text)}</span></div>`).join('')}
      ${askLink('', 'Comentarlo con Gonzalo', 'Las alertas de mi ciclo')}
    </div>
  </div>`;
}

function trendsView() {
  const stats = computeStats();
  const p = store.prediction;
  const alerts = store.alerts;
  const maxMood = stats.topMoods[0]?.count || 1;
  return `<div class="stack-18">
    <div class="row gap-12">
      ${statCard(stats.loggedDays, 'DÍAS<br>REGISTRADOS')}
      ${statCard(stats.bleedDays, 'DÍAS DE<br>SANGRADO', 'rose')}
    </div>
    ${cycleLearnedCard(p)}
    ${stats.cycles.length >= 2 ? cycleHistoryCard(stats.cycles, store.data.settings.periodLen, p.follicularPhase.mean + p.lutealPhase.mean) : ''}
    ${stats.loggedDays === 0 ? `<div class="card empty">
      <div class="serif-22">Aún no hay registros</div>
      <p class="t-14 soft lh-4">Registra tus síntomas y estado de ánimo en el Diario y aquí descubrirás los patrones de tu ciclo.</p>
    </div>` : `
      ${stats.topSymptoms.length ? bubbleCard(stats.topSymptoms, stats.phaseSym) : ''}
      ${stats.topMoods.length ? `<div class="card pad stack-12">${eyebrow('Estado de ánimo')}
        ${stats.topMoods.map((m) => `<div class="stack-6"><div class="row between"><span class="t-135">${esc(m.name)}</span><span class="t-125 soft">${m.count} ${plural(m.count, 'día', 'días')}</span></div>
          <div class="vbar"><i style="width:${((m.count / maxMood) * 100).toFixed(1)}%"></i></div></div>`).join('')}
      </div>` : ''}`}
    ${alerts.flags.length ? alertsCard(alerts) : ''}
  </div>`;
}

// =========================================================================
// MARK: - Sheets: calendario y ajustes
// =========================================================================

function calendarSheet() {
  const today = todayISO();
  const grid = monthGrid(ui.calMonth, (dn) => {
    const ds = isoFromDN(dn);
    const info = cycleInfo(store.data.settings, dn);
    const pc = store.mode === 'cycle' ? PHASE_COLOR[info.phase] : null;
    const isPast = ds <= today;
    const isSel = ds === ui.selectedDate;
    const l = store.log(ds);
    const hasLog = l.flow != null || l.symptoms.length > 0 || l.mood != null;
    const cls = ['cal-cell', pc && `ph-${pc}`, isSel && 'sel', ds === today && !isSel && 'today', !isPast && 'future', hasLog && 'logged'].filter(Boolean).join(' ');
    return `<button class="${cls}" data-action="cal-pick" data-date="${ds}" ${isPast ? '' : 'disabled'} aria-label="${attr(fmtWeekdayLong(dn))}">${partsFromDN(dn).d}</button>`;
  });
  return sheetFrame('Calendario', `
    <div class="stack-16">
      <div class="row between center">
        <button class="nav-btn" data-action="cal-prev" aria-label="Mes anterior">‹</button>
        <div class="serif-22 upper">${esc(fmtMonthYear(ui.calMonth))}</div>
        <button class="nav-btn" data-action="cal-next" aria-label="Mes siguiente">›</button>
      </div>
      ${grid}
      <div class="row gap-14 justify-center wrap">
        ${store.mode === 'cycle' ? `<span class="legend box"><i class="ph-period"></i>Regla</span>
        <span class="legend box"><i class="ph-sage"></i>Fértil</span>
        <span class="legend box"><i class="ph-ovu"></i>Ovulación</span>` : ''}
        <span class="legend"><i class="dot"></i>Con registro</span>
      </div>
    </div>`);
}

function periodList(list, removeAction) {
  return [...list].sort().reverse().map((ds) => `
    <div class="period-item">
      <span class="c-rose">${icon('drop', 10)}</span><span class="t-11 soft">Primer día de sangrado</span>
      <span class="grow"></span>
      <span class="t-13 w-500">${esc(fmtDayMonthYear(dnFromISO(ds)))}</span>
      <button class="icon-btn soft" data-action="${removeAction}" data-date="${ds}" aria-label="Quitar fecha">${icon('xCircle', 16)}</button>
    </div>`).join('');
}

const GOOGLE_G = '<svg class="ic" width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>';

function syncStatusText() {
  const ago = (t) => {
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'ahora mismo';
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
  };
  switch (sync.status) {
    case 'syncing': return 'Sincronizando…';
    case 'ok': return `Sincronizado ${ago(sync.lastSync)}`;
    case 'needs-auth': return 'Sincronización en pausa: vuelve a conectar con Google.';
    case 'offline': return 'Sin conexión: se sincronizará al volver a tener internet.';
    case 'error': return `No se pudo sincronizar${sync.error ? `: ${sync.error}` : ''}`;
    default: return sync.lastSync ? `Última sincronización ${ago(sync.lastSync)}` : '';
  }
}

function syncPill() {
  if (!sync.enabled) return '';
  if (sync.status === 'needs-auth' || sync.status === 'error') {
    return `<button class="sync-pill warn" data-action="sync-reauth">${icon('cloud', 14)} Sincronizar</button>`;
  }
  if (sync.status === 'syncing') return `<span class="sync-pill" aria-label="Sincronizando">${icon('cloud', 14)}</span>`;
  return '';
}

/** A qué fecha atar los avisos según la etapa guardada: embarazo (fecha de parto) o posparto (nacimiento del bebé). */
function pushTarget() {
  if (store.mode === 'pregnancy' && store.stage.pregnancy?.dueDate) return { kind: 'pregnancy', date: store.stage.pregnancy.dueDate };
  if (store.mode === 'postpartum' && store.stage.postpartum?.birthDate) return { kind: 'postpartum', date: store.stage.postpartum.birthDate };
  return null;
}

const PUSH_DISMISS = 'vera-push-dismissed';
const pushDismissed = () => { try { return localStorage.getItem(PUSH_DISMISS) === '1'; } catch { return false; } };

/** Texto de lo que se avisa, según la etapa */
const pushWhat = (pp) => (pp
  ? 'Te avisamos con lo normal a la edad de tu bebé: cada semana los 3 primeros meses y luego cada mes, a las 9:00.'
  : 'Cada semana nueva de tu embarazo, a las 9:00, te avisamos con lo normal de esos días.');

/** Fila de Ajustes que abre la hoja de avisos (como «Aviso diario» en Florvia) */
function pushSection() {
  const target = pushTarget();
  if (!target || ui.pushState === 'unknown' || ui.pushState === 'unsupported') return '';
  const on = ui.pushState === 'on';
  return `<div class="stack-10 data-box">${eyebrow('Avisos')}
    <button class="push-row" data-action="open-push"><span class="push-ic">${icon('bell', 16)}</span>
      <span class="grow left"><span class="t-13 w-500 block">Aviso semanal</span><span class="t-12 soft block">${on ? 'Activado · a las 9:00' : 'Desactivado'}</span></span>
      <span class="soft">›</span></button></div>`;
}

/** Tarjeta de Hoy que invita a activar los avisos (se oculta al activarlos o con «Ahora no») */
function pushPromptCard() {
  const target = pushTarget();
  if (!target || pushDismissed() || (ui.pushState !== 'off' && ui.pushState !== 'needs-install')) return '';
  const pp = target.kind === 'postpartum';
  return `<div class="card pad stack-8">
    <button class="push-row" data-action="open-push"><span class="push-ic">${icon('bell', 16)}</span>
      <span class="grow left"><span class="t-14 w-500 block">Activa el aviso semanal</span><span class="t-12 soft block">${pp ? 'Lo normal a la edad de tu bebé, en tu móvil' : 'Lo normal de cada semana nueva, en tu móvil'}</span></span>
      <span class="soft">›</span></button>
    <button class="link-soft self-start" data-action="push-dismiss">Ahora no</button>
  </div>`;
}

function pushSheet() {
  const target = pushTarget();
  const pp = target?.kind === 'postpartum';
  const st = ui.pushState;
  let inner;
  if (!target) inner = '<p class="t-13 soft lh-4">Los avisos están disponibles en embarazo y posparto.</p>';
  else if (st === 'needs-install') inner = '<p class="soft-note">En iPhone, los avisos solo funcionan con la app instalada: botón Compartir → «Añadir a pantalla de inicio», y ábrela desde el icono.</p>';
  else if (st === 'unsupported') inner = '<p class="soft-note">Este navegador no admite avisos.</p>';
  else if (st === 'denied') inner = '<p class="soft-note">Tienes bloqueadas las notificaciones de Hera. Puedes permitirlas en los ajustes de tu navegador o de tu móvil, en Notificaciones, y volver aquí.</p>';
  else if (st === 'on') inner = `<div class="sync-box"><span class="c-sage">${icon('checkCircle', 18)}</span><div class="grow"><div class="t-13 w-500">Activado</div><div class="t-12 soft">${pp ? 'Cada semana los 3 primeros meses y luego cada mes, a las 9:00.' : 'Cada semana nueva, a las 9:00.'}</div></div></div>
      <button class="pill-outline" data-action="push-test" ${ui.pushBusy ? 'disabled' : ''}>Enviar un aviso de prueba</button>
      <button class="link-danger" data-action="push-disable" ${ui.pushBusy ? 'disabled' : ''}>Desactivar el aviso</button>`;
  else inner = `<button class="btn-primary" data-action="push-enable" ${ui.pushBusy ? 'disabled' : ''}>Activar aviso semanal</button>`;
  const note = `<p class="t-11 soft-70 lh-3">Para enviarte los avisos guardamos, en un servicio de Cloudflare, la dirección de aviso de tu navegador y ${pp ? 'la fecha de nacimiento de tu bebé' : 'tu fecha probable de parto'}. Nada más. Al desactivarlos se borra.</p>`;
  return sheetFrame('Aviso semanal', `<div class="stack-14">
    <p class="t-14 lh-5">${pushWhat(pp)} Es opcional.</p>
    ${ui.pushMsg ? `<p class="${/^(No |Sin )/.test(ui.pushMsg) ? 'soft-note' : 't-13 c-sage w-500'}">${esc(ui.pushMsg)}</p>` : ''}
    ${inner}
    ${st === 'denied' || st === 'needs-install' || st === 'unsupported' ? '' : note}
  </div>`);
}

function syncSection() {
  if (!sync.enabled) {
    return `<div class="stack-10 data-box">
      ${eyebrow('Sincronización')}
      <p class="t-13 soft lh-4">Guarda tus datos en tu propio Google Drive para verlos desde cualquier dispositivo. Es opcional: sin cuenta, Hera funciona igual.</p>
      <button class="google-btn" data-action="sync-connect">${GOOGLE_G} Continuar con Google</button>
      ${sync.error ? `<p class="t-12 c-rose">${esc(sync.error)}</p>` : ''}
      <p class="t-11 soft-70 lh-3">Tus datos se guardan en una carpeta privada de tu Google Drive a la que solo accede Hera. No aparece entre tus archivos. Nosotros no vemos tus datos.</p>
    </div>`;
  }
  const warn = sync.status === 'needs-auth' || sync.status === 'error' || sync.status === 'offline';
  return `<div class="stack-10 data-box">
    ${eyebrow('Sincronización')}
    <div class="sync-box">
      <span class="c-sage">${icon('cloud', 18)}</span>
      <div class="grow">
        <div class="t-13 w-500">Conectada con Google Drive</div>
        ${sync.email ? `<div class="t-12 soft">${esc(sync.email)}</div>` : ''}
        <div class="t-12 ${warn ? 'c-rose' : 'soft'} mt-4">${esc(syncStatusText())}</div>
      </div>
    </div>
    <div class="row gap-8 wrap">
      ${sync.status === 'needs-auth' || sync.status === 'error'
        ? `<button class="pill-outline row gap-6 center" data-action="sync-reauth">${icon('cloud', 13)} Volver a conectar</button>`
        : `<button class="pill-outline row gap-6 center" data-action="sync-now" ${sync.status === 'syncing' ? 'disabled' : ''}>${icon('cloud', 13)} Sincronizar ahora</button>`}
      <button class="pill-outline" data-action="sync-disconnect">Cerrar sesión</button>
    </div>
    <button class="link-danger row gap-6 center" data-action="sync-delete">${icon('trash', 12)} Borrar mis datos de Google Drive</button>
  </div>`;
}

function syncChoiceDialog() {
  return `<div class="sheet-backdrop"></div>
  <div class="sheet dialog anim" role="dialog" aria-modal="true" aria-label="Datos encontrados en Google Drive">
    <div class="sheet-body stack-14 pt-20">
      <div class="serif-22">Ya tienes datos en Google Drive</div>
      <p class="t-13 soft lh-4">Este dispositivo también tiene registros de Hera. ¿Qué quieres hacer?</p>
      <button class="btn-primary" data-action="sync-choice" data-v="merge">Combinar ambos</button>
      <p class="t-11 soft-70 lh-3 mt--8">Se juntan los registros de los dos. Si un mismo día tiene cambios en ambos, se queda el más reciente.</p>
      <button class="outline-sage" data-action="sync-choice" data-v="drive">Usar solo los de Google Drive</button>
      <p class="t-11 soft-70 lh-3 mt--8">Los datos de este dispositivo se sustituyen por los de tu Drive.</p>
      <button class="link-soft" data-action="sync-choice" data-v="">Cancelar</button>
    </div>
  </div>`;
}

function settingsSheet() {
  const s = ui.draft;
  const count = s.pastPeriods.length;
  const typeBtn = (label, sel, val) => `<button class="type-btn ${sel ? 'on' : ''}" aria-pressed="${sel}" data-action="draft-type" data-v="${val}">${label}</button>`;
  const body = s.isRegular ? `
    <div class="stack-8">
      <div class="row gap-6 center"><span class="c-rose">${icon('drop', 11)}</span><span class="t-13 soft">Primer día de tu última regla</span></div>
      <input type="date" class="field date" data-model="draft.lastPeriod" value="${attr(s.lastPeriod)}" max="${todayISO()}">
    </div>
    <hr>
    <div class="stack-8">
      <div class="t-13 soft">Duración del ciclo: <span data-out="draft.cycleLen">${s.cycleLen}</span> días</div>
      ${rangeRow({ key: 'draft.cycleLen', min: 21, max: 45, step: 1, value: s.cycleLen })}
    </div>` : `
    <div class="stack-8">
      <div class="row gap-6 center"><span class="c-rose">${icon('drop', 11)}</span><span class="t-13 soft">Tus últimas reglas (primer día de sangrado)</span></div>
      ${!count ? '<div class="t-12 soft-70">Añade al menos 3 fechas para calcular tu ciclo medio.</div>' : ''}
      <div class="stack-8">${periodList(s.pastPeriods, 'draft-remove')}</div>
      <input type="date" class="field date" data-model="draftPicker" value="${attr(ui.draftPicker)}" max="${todayISO()}">
      <button class="outline-sage" data-action="draft-add">${icon('plusCircle', 14)} Añadir este día</button>
      ${count >= 3
        ? `<div class="note-mist"><span class="c-sage">${icon('checkCircle', 14)}</span><span>Ciclo medio: <b>${averageCycleLength(s.pastPeriods)} días</b> (calculado a partir de ${count} reglas)</span></div>`
        : `<div class="t-12 soft-70">Añade ${3 - count} ${plural(3 - count, 'fecha', 'fechas')} más para calcular tu ciclo medio.</div>`}
    </div>
    <hr>`;

  const dm = ui.draftStage.mode;
  const cycleForm = `<div class="stack-10"><div class="t-13 soft">Tipo de ciclo</div>
        <div class="row gap-10">${typeBtn('Regular', s.isRegular, 'regular')}${typeBtn('Irregular', !s.isRegular, 'irregular')}</div></div>
      <hr>
      ${body}
      <div class="stack-8">
        <div class="t-13 soft">Duración de la regla: <span data-out="draft.periodLen">${s.periodLen}</span> días</div>
        ${rangeRow({ key: 'draft.periodLen', min: 2, max: 9, step: 1, value: s.periodLen, tone: 'rose' })}
      </div>
      <hr>`;
  const title = { cycle: 'Mi ciclo', pregnancy: 'Mi embarazo', postpartum: 'Mi posparto' }[dm];
  return sheetFrame(title, `
    <div class="stack-20">
      ${stageUI() ? stageSection() : ''}
      ${dm === 'pregnancy' ? pregnancyForm() : dm === 'postpartum' ? postpartumForm() : cycleForm}
      ${pushSection()}
      ${syncAvailable() ? syncSection() : ''}
      <div class="stack-10 data-box">
        ${eyebrow('Contacto')}
        <p class="t-13 soft lh-4">¿Tienes dudas sobre tu salud, sobre cómo usar Hera o quieres darnos tu opinión? Escríbenos cuando quieras.</p>
        <a class="outline-sage" href="${CONTACT_HREF}">${icon('mail', 14)} ${CONTACT_EMAIL}</a>
        <p class="t-11 soft-70 lh-3">No atendemos urgencias: si tienes un sangrado muy abundante, dolor intenso o fiebre, acude a tu médico o a urgencias. Nuestras respuestas son orientativas y no sustituyen una consulta.</p>
      </div>
      <div class="stack-10 data-box">
        ${eyebrow('Tus datos')}
        <p class="t-12 soft lh-3">Hera web guarda todo solo en este navegador. Nada sale de tu dispositivo. Haz una copia para no perder tus registros si borras los datos del navegador o cambias de equipo.</p>
        <div class="row gap-8 wrap">
          <button class="pill-outline row gap-6 center" data-action="export">${icon('download', 13)} Exportar copia</button>
          <label class="pill-outline row gap-6 center" tabindex="0">${icon('upload', 13)} Importar copia<input type="file" accept="application/json,.json" data-action="import" hidden></label>
        </div>
        <button class="link-danger row gap-6 center" data-action="reset">${icon('trash', 12)} Borrar todos mis datos</button>
        ${!store.storageOK ? '<p class="t-12 c-rose">Este navegador no permite guardar datos (¿modo privado?). Tus registros se perderán al cerrar la pestaña.</p>' : ''}
      </div>
    </div>`, true);
}

function sheetFrame(title, content, handle = false) {
  return `<div class="sheet-backdrop" data-action="close-sheet"></div>
  <div class="sheet ${ui.sheetAnim ? 'anim' : ''}" role="dialog" aria-modal="true" aria-label="${attr(title)}">
    ${handle ? '<div class="sheet-handle"></div>' : ''}
    <div class="sheet-head">
      <div class="${handle ? 'serif-24' : 'sheet-title'}">${esc(title)}</div>
      <button class="link-deep" data-action="close-sheet">Cerrar</button>
    </div>
    <div class="sheet-body">${content}</div>
    ${ui.sheet === 'settings' ? saveBar() : ''}
  </div>`;
}

// =========================================================================
// MARK: - Onboarding
// =========================================================================

function onboardingView() {
  const ob = ui.ob;
  let content;
  switch (ob.step) {
    case 0:
      content = `<div class="text-center stack-0">
        <h1 class="ob-logo"><img src="brand/hera-logo.svg" alt="Hera" width="264" height="80"></h1>
        <div class="ob-tag">EMBARAZO · POSPARTO · BEBÉ</div>
        <p class="t-17 light soft lh-6 mb-44">${esc(TAGLINE)} Con respuestas para cada semana y la posibilidad de preguntarle tus dudas cuando lo necesites.</p>
        ${primaryButton('Comenzar', 'ob-next')}
        ${syncAvailable() ? `<button class="google-btn mt-16" data-action="sync-connect">${GOOGLE_G} ¿Ya usas Hera? Recuperar mis datos</button>` : ''}
        <button class="link-soft mt-16" data-action="ob-demo">Explorar con datos de ejemplo</button>
        ${sync.error ? `<p class="t-12 c-rose mt-12">${esc(sync.error)}</p>` : ''}
      </div>`;
      break;
    case 1: if (stageUI() && !ob.stageChosen) {
      const opt = (title, sub, ic, val) => `<button class="option" data-action="ob-stage" data-v="${val}">
        <span class="opt-ic">${icon(ic, 20)}</span>
        <span class="grow left"><span class="t-15 w-500 block">${title}</span><span class="t-13 soft block lh-3">${sub}</span></span>
        ${icon('right', 14, 'soft')}
      </button>`;
      content = `<div>
        <h2 class="ob-h">¿En qué momento estás?</h2>
        <p class="t-14 soft lh-4 mb-30">Hera se adapta a cada etapa. Podrás cambiarla cuando quieras desde los ajustes.</p>
        <div class="stack-12">
          ${opt('Estoy embarazada', 'Tus semanas, el desarrollo de tu bebé, las pruebas de cada etapa y las dudas frecuentes.', 'sprout', 'pregnancy')}
          ${opt('He tenido a mi bebé', 'Tu recuperación, la lactancia y el peso, la salud y la alimentación de tu bebé.', 'flower', 'postpartum')}
          ${opt('Quiero seguir mi ciclo', 'Reglas, ventana fértil, síntomas y medicación.', 'moon', 'cycle')}
        </div>
      </div>`;
      break;
    } else if (ob.flow === 'pregnancy') {
      content = `<div>
        <h2 class="ob-h">Tu embarazo</h2>
        <p class="t-14 soft lh-4 mb-22">Indica tu fecha probable de parto. Si no la sabes, usa el primer día de tu última regla y la calculamos.</p>
        <div class="mb-32">${dueField({ ctx: 'ob', mode: ob.dueMode || 'lmp', dueValue: ob.dueDate, lmpValue: ob.lmp })}</div>
        ${primaryButton('Empezar', 'ob-finish-stage')}
      </div>`;
      break;
    } else if (ob.flow === 'postpartum') {
      content = `<div>
        <h2 class="ob-h">¿Cuándo nació tu bebé?</h2>
        <p class="t-14 soft lh-4 mb-22">Te acompañaremos en la recuperación y cuando vuelva tu regla.</p>
        <input type="date" class="field date big mb-32" data-model="ob.birthDate2" value="${attr(ob.birthDate2)}" max="${todayISO()}" aria-label="Fecha del parto">
        ${primaryButton('Empezar', 'ob-finish-stage')}
      </div>`;
      break;
    } else {
      const opt = (title, sub, ic, sel, val) => `<button class="option ${sel ? 'on' : ''}" aria-pressed="${sel}" data-action="ob-regular" data-v="${val}">
        <span class="opt-ic">${icon(ic, 20)}</span>
        <span class="grow left"><span class="t-15 w-500 block">${title}</span><span class="t-13 soft block lh-3">${sub}</span></span>
        <span class="opt-check">${icon(sel ? 'checkCircle' : 'circle', 20)}</span>
      </button>`;
      content = `<div>
        <h2 class="ob-h">¿Cómo es tu ciclo?</h2>
        <p class="t-14 soft lh-4 mb-30">Esto nos ayuda a predecir tus fases con mayor precisión.</p>
        <div class="stack-12 mb-32">
          ${opt('Regular', 'Mi ciclo suele durar más o menos los mismos días cada mes.', 'clock', ob.isRegular, 'regular')}
          ${opt('Irregular', 'La duración de mis ciclos varía bastante de un mes a otro.', 'wave', !ob.isRegular, 'irregular')}
        </div>
        ${primaryButton('Continuar', 'ob-next')}
      </div>`;
      break;
    }
    case 2:
      if (ob.isRegular) {
        const today = todayDN();
        const grid = monthGrid(ob.month, (dn) => {
          const ds = isoFromDN(dn);
          const cls = ['cal-cell', ds === ob.lastPeriod && 'sel', dn === today && ds !== ob.lastPeriod && 'today', dn > today && 'future'].filter(Boolean).join(' ');
          return `<button class="${cls}" data-action="ob-pick-last" data-date="${ds}" ${dn > today ? 'disabled' : ''} aria-label="${attr(fmtWeekdayLong(dn))}">${partsFromDN(dn).d}</button>`;
        });
        const canNext = addMonths(ob.month, 1) <= today;
        content = `<div>
          <h2 class="ob-h">¿Cuándo empezó tu última regla?</h2>
          <div class="row gap-8 center mb-22"><span class="c-rose">${icon('drop', 13)}</span><span class="t-13 soft">Indica el <b>primer día de sangrado</b>, aunque fuera manchado.</span></div>
          <div class="card pad mb-28">
            <div class="row between center mb-8">
              <div class="t-15 w-500 c-deep">${esc(capFirst(fmtMonthYear(ob.month)))}</div>
              <div class="row gap-8">
                <button class="sq-btn" data-action="ob-month-prev" aria-label="Mes anterior">${icon('left', 12)}</button>
                <button class="sq-btn" data-action="ob-month-next" aria-label="Mes siguiente" ${canNext ? '' : 'disabled'}>${icon('right', 12)}</button>
              </div>
            </div>
            ${grid}
          </div>
          ${primaryButton('Continuar', 'ob-next')}
        </div>`;
      } else {
        const count = ob.pastPeriods.length;
        let progress;
        if (count === 0) progress = '<div class="t-12 soft-70 text-center mb-16">Opcional — puedes añadirlas más tarde en Ajustes para mejorar las predicciones.</div>';
        else if (count < 3) progress = `<div class="row gap-6 center justify-center t-12 soft mb-16"><span class="c-gold">${icon('info', 12)}</span>Con ${3 - count} ${plural(3 - count, 'fecha', 'fechas')} más las predicciones serán más precisas.</div>`;
        else progress = `<div class="row gap-6 center justify-center t-12 soft mb-16"><span class="c-sage">${icon('checkCircle', 14)}</span><span>Ciclo medio: <b>${averageCycleLength(ob.pastPeriods)} días</b> calculado a partir de ${count} reglas</span></div>`;
        content = `<div>
          <h2 class="ob-h">Añade tus últimas reglas</h2>
          <div class="row gap-8 center mb-6"><span class="c-rose">${icon('drop', 13)}</span><span class="t-13 soft">Para cada regla, indica el <b>primer día de sangrado</b>.</span></div>
          <p class="t-12 soft-70 mb-20">Cuantas más fechas añadas, más precisas serán las predicciones. Puedes hacerlo ahora o más tarde.</p>
          <div class="stack-8 mb-12">${periodList(ob.pastPeriods, 'ob-remove')}</div>
          <div class="stack-8 mb-20">
            <input type="date" class="field date" data-model="ob.pickerDate" value="${attr(ob.pickerDate)}" max="${todayISO()}" aria-label="Fecha de inicio de la regla">
            <button class="outline-sage" data-action="ob-add">${icon('plusCircle', 14)} Añadir este día</button>
          </div>
          ${progress}
          ${primaryButton('Continuar', 'ob-next')}
        </div>`;
      }
      break;
    case 3:
      content = `<div>
        <h2 class="ob-h mb-22">Tu ciclo habitual</h2>
        ${ob.isRegular ? `
          <div class="t-13 soft mb-8">Duración habitual del ciclo: <span data-out="ob.cycleLen">${ob.cycleLen}</span> días</div>
          <div class="mb-20">${rangeRow({ key: 'ob.cycleLen', min: 21, max: 45, step: 1, value: ob.cycleLen })}</div>`
        : `<div class="note-mist mb-20"><span class="c-sage">${icon('checkCircle', 14)}</span><span>Ciclo medio calculado automáticamente: <b>${averageCycleLength(ob.pastPeriods)} días</b></span></div>`}
        <div class="t-13 soft mb-8">Duración habitual de la regla: <span data-out="ob.periodLen">${ob.periodLen}</span> días</div>
        <div class="mb-8">${rangeRow({ key: 'ob.periodLen', min: 2, max: 9, step: 1, value: ob.periodLen, tone: 'rose' })}</div>
        <p class="t-125 soft mb-32">Podrás ajustarlo cuando quieras desde los ajustes.</p>
        ${primaryButton('Continuar', 'ob-next')}
      </div>`;
      break;
    case 4: {
      const dots = [0, 1, 2].map((i) => `<i class="${i === ob.profileSubStep ? 'on' : ''}"></i>`).join('');
      let sub;
      if (ob.profileSubStep === 0) {
        const t = partsFromDN(todayDN());
        const maxBirth = `${t.y - 10}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
        sub = `<h2 class="ob-h">¿Cuándo naciste?</h2>
          <p class="t-14 soft lh-4 mb-32">Lo usamos para contextualizar mejor tus síntomas y fases.</p>
          <input type="date" class="field date big mb-36" data-model="ob.birthDate" value="${attr(ob.birthDate)}" max="${maxBirth}" min="1920-01-01" aria-label="Fecha de nacimiento">
          ${primaryButton('Continuar', 'ob-sub', false, 'data-v="1"')}`;
      } else if (ob.profileSubStep === 1) {
        sub = `<h2 class="ob-h">¿Cuánto pesas?</h2>
          <p class="t-14 soft lh-4 mb-48">Un dato aproximado es suficiente. Lo puedes cambiar cuando quieras.</p>
          <div class="ob-weight"><span data-out="ob.weightKg">${ob.weightKg}</span> kg</div>
          <div class="mb-8">${rangeRow({ key: 'ob.weightKg', min: 35, max: 150, step: 1, value: ob.weightKg })}</div>
          <div class="row between t-11 soft mb-44"><span>35 kg</span><span>150 kg</span></div>
          ${primaryButton('Continuar', 'ob-sub', false, 'data-v="2"')}`;
      } else {
        sub = `<h2 class="ob-h">¿Tienes algún diagnóstico?</h2>
          <p class="t-14 soft lh-4 mb-24">Esto nos ayuda a personalizar los síntomas sugeridos.</p>
          <div class="stack-10 mb-28">${HORMONAL_CONDITIONS.map((o) => {
            const sel = ob.hormonalCondition === o;
            return `<button class="option compact ${sel ? 'on' : ''}" aria-pressed="${sel}" data-action="ob-condition" data-v="${attr(o)}"><span class="grow left t-15">${esc(o)}</span><span class="opt-check">${icon(sel ? 'checkCircle' : 'circle', 20)}</span></button>`;
          }).join('')}</div>
          ${primaryButton('Empezar a cuidarme', 'ob-finish')}`;
      }
      content = `<div><div class="sub-dots mb-28">${dots}</div>${sub}</div>`;
      break;
    }
    default: content = '';
  }
  const steps = [0, 1, 2, 3, 4].map((i) => `<i class="${i === ob.step ? 'on' : ''}"></i>`).join('');
  return `<div class="ob">
    <div class="ob-top">${ob.step > 0 ? `<button class="link-soft row gap-6 center t-14" data-action="ob-back">${icon('left', 14)} Atrás</button>` : ''}</div>
    <div class="ob-content" key="${ob.step}-${ob.profileSubStep}">${content}</div>
    <div class="ob-steps">${steps}</div>
  </div>
  ${ui.syncChoice ? syncChoiceDialog() : ''}`;
}

// =========================================================================
// MARK: - Shell principal
// =========================================================================

// =========================================================================
// MARK: - Embarazo y posparto
// =========================================================================

// MARK: - Consulta con el ginecólogo (ayuda contextual)

function consultAvatar(size = 'sm', who = 'gineco') {
  const c = CONSULTS[who] || CONSULT;
  return c.photo
    ? `<img class="cav ${size}" src="${attr(c.photo)}" alt="">`
    : `<span class="cav ${size}" aria-hidden="true">${esc(c.initials)}</span>`;
}

/** Los tres avatares solapados (ginecología, matrona y pediatra) para cabecera y enlaces */
const consultPair = (size = 'sm') => `<span class="cav-pair">${consultAvatar(size, 'gineco')}${consultAvatar(size, 'matrona')}${consultAvatar(size, 'pediatra')}</span>`;

/** Enlace discreto de una línea: «¿Otra duda? Pregúntanos» */
function askLink(lead, link, ctx = '') {
  return `<button class="ask-link" data-action="open-ask" data-ctx="${attr(ctx)}">${consultPair('xs')}<span>${lead ? `${esc(lead)} ` : ''}<u>${esc(link)}</u></span></button>`;
}

/** Resumen de la situación de la usuaria para adjuntar a la pregunta */
function consultDetails() {
  const lines = [];
  const st = store.stage;
  if (st.mode === 'pregnancy') {
    const g = gestation(st.pregnancy);
    if (g && g.totalDays >= 0) lines.push(`Embarazo: semana ${g.weeks} + ${g.days} días (FPP ${fmtDayMonthYear(g.due)})`);
  } else if (st.mode === 'postpartum') {
    const sb = sinceBirth(st.postpartum);
    if (sb) lines.push(`Posparto: ${sb.weeks} ${plural(sb.weeks, 'semana', 'semanas')} y ${sb.days} ${plural(sb.days, 'día', 'días')} desde el parto`);
  } else {
    const info = cycleInfo(store.data.settings);
    lines.push(`Ciclo: día ${info.day} (${PHASES[info.phase].label.toLowerCase()}), ciclo de ~${store.data.settings.cycleLen} días`);
  }
  const t = todayDN();
  const recent = new Set();
  for (let o = 0; o < 3; o++) for (const sym of store.log(isoFromDN(t - o)).symptoms) recent.add(sym);
  if (recent.size) lines.push(`Síntomas de los últimos 3 días: ${[...recent].join(', ')}`);
  return lines;
}

function consultMessage() {
  const a = ui.ask;
  const parts = [a.text.trim()];
  const meta = [];
  if (a.context) meta.push(`Sobre: ${a.context}`);
  if (a.include) meta.push(...consultDetails());
  if (meta.length) parts.push('', '—', ...meta);
  parts.push('', 'Enviado desde Hera web');
  return parts.join('\n');
}

/** Elección de profesional: tres fichas compactas en una fila (avatar, nombre y cargo) */
function askPickCard(c, ask, sugg) {
  const on = ask.to === c.key;
  const suggested = sugg.to === c.key && !ask.manual;
  return `<button class="ask-pick ${on ? 'on' : ''}" data-action="ask-pick" data-v="${c.key}" role="radio" aria-checked="${on}" aria-label="${attr(`${c.name}, ${c.role}`)}">
    ${consultAvatar('md', c.key)}
    <span class="t-13 w-500 block">${esc(c.short)}</span>
    <span class="t-11 soft block">${esc(c.role)}</span>
    ${suggested ? '<span class="ask-badge">Sugerido</span>' : ''}</button>`;
}

/** Una sola línea bajo las fichas: qué atiende quien está elegido, o la sugerencia, o cómo elegir */
function askHint(ask, sugg) {
  const to = CONSULTS[ask.to];
  if (!ask.manual && sugg.to) return `Te sugerimos a ${CONSULTS[sugg.to].short}${sugg.reason ? `: parece una duda sobre ${sugg.reason}` : ''}. Puedes cambiarlo.`;
  if (to) return `${to.name} atiende: ${to.scope.charAt(0).toLowerCase()}${to.scope.slice(1)}. Responde en menos de ${to.responseHours} h.`;
  return 'Elige a quién preguntar: ginecología (pruebas, medicación, anticoncepción), matrona (lactancia, parto, posparto) o pediatra (tu bebé).';
}

const consultFormOn = () => CONSULT_FORM || isBeta();
const isEmail = (e) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,24}$/i.test(String(e || '').trim());

/** Puntos de gratuitas usadas / disponibles */
const freeDots = (used, total) => `<span class="free-dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i < used ? 'on' : ''}"></i>`).join('')}</span>`;

/** Pantalla B: gratuitas agotadas (sin pasarela de pago todavía) */
function askLimitView(a) {
  const n = a.notify || {};
  const notify = n.done
    ? `<p class="t-13 c-sage w-500 text-center">Hecho: te avisaremos en ${esc(a.email)} cuando estén disponibles.</p>`
    : n.open
      ? `<div class="stack-10">
          <label class="ask-check"><input type="checkbox" data-ask-consent ${n.consent ? 'checked' : ''}>
            <span class="t-12 lh-4">Acepto que Hera guarde mi correo (${esc(a.email)}) solo para avisarme cuando haya consultas de pago. Puedo pedir que lo borren escribiendo a ${esc(CONTACT_EMAIL)}.</span></label>
          ${n.error ? `<p class="t-12 c-rose">${esc(n.error)}</p>` : ''}
          <button class="btn-primary" data-action="ask-notify-send" ${n.busy ? 'disabled' : ''}>Avisarme</button>
        </div>`
      : `<button class="btn-primary" data-action="ask-notify-open">Avisarme cuando esté disponible</button>`;
  return sheetFrame('Consulta', `<div class="stack-14">
    <div class="limit-card stack-8">
      ${consultPair('sm')}
      <div class="t-15 w-500 c-deep">Has usado tus ${a.result.freeLimit || 2} consultas gratuitas</div>
      <p class="t-13 lh-4 c-deep">Muy pronto podrás seguir preguntando a Gonzalo, Marina y Lucía con consultas sueltas o bonos.</p>
    </div>
    ${notify}
    <a class="outline-sage" href="${CONTACT_HREF}">${icon('mail', 14)} Escribir a ${esc(CONTACT_EMAIL)}</a>
    <p class="t-11 soft-70 lh-3">Si es urgente, no esperes: llama al 112 o acude a tu centro de salud. Mientras tanto, mira las respuestas en <button class="inline-link" data-action="open-guide">Dudas</button>.</p>
  </div>`);
}

function askSheet() {
  const a = ui.ask;
  const to = CONSULTS[a.to];
  if (a.result?.limit) return askLimitView(a);
  if (a.result?.ok) {
    const who = CONSULTS[a.sentTo] || CONSULT;
    const total = a.result.freeLimit || 2;
    const rem = a.result.remaining;
    return sheetFrame('Consulta', `<div class="stack-14 text-center ask-done">
      ${consultAvatar('lg', who.key)}
      <div class="serif-22">Consulta enviada</div>
      <p class="t-13 soft lh-4">${esc(who.short)} te responderá en menos de ${who.responseHours} h a <b class="w-500">${esc(a.email)}</b>. Te hemos mandado una copia.</p>
      ${freeDots(total - rem, total)}
      <p class="t-12 soft">${rem === 0 ? 'Era tu última consulta gratuita' : `Te ${rem === 1 ? 'queda 1 consulta gratuita' : `quedan ${rem} consultas gratuitas`}`}</p>
      ${a.result.dryRun ? '<p class="t-11 c-rose">Modo ensayo: no se ha enviado ningún correo.</p>' : ''}
      <button class="link-soft self-center" data-action="ask-reset">Escribir otra pregunta</button>
    </div>`);
  }
  if (a.sent) {
    const who = CONSULTS[a.sentTo] || CONSULT;
    return sheetFrame('Consulta', `<div class="stack-14 text-center ask-done">
      ${consultAvatar('lg', who.key)}
      <div class="serif-22">¡Casi está!</div>
      <p class="t-13 soft lh-4">${a.sent === 'whatsapp'
        ? 'Se ha abierto WhatsApp con tu pregunta. Pulsa enviar allí.'
        : 'Se ha abierto tu correo con la pregunta ya escrita. Pulsa enviar allí.'} ${esc(who.name)} te responderá en menos de ${who.responseHours} h.</p>
      <button class="link-soft self-center" data-action="ask-reset">Escribir otra pregunta</button>
    </div>`);
  }
  const sugg = suggestContact({ text: a.text, context: a.context, mode: store.mode });
  const details = consultDetails();
  return sheetFrame('Consulta', `<div class="stack-14">
    <div class="stack-8 ask-picks" role="radiogroup" aria-label="¿A quién quieres preguntar?">
      ${askPickCard(CONSULTS.gineco, a, sugg)}${askPickCard(CONSULTS.matrona, a, sugg)}${askPickCard(CONSULTS.pediatra, a, sugg)}
    </div>
    <p class="t-12 soft lh-4" data-ask-hint>${esc(askHint(a, sugg))}</p>
    <p class="t-12 c-rose lh-4" data-ask-urgent ${sugg.urgent ? '' : 'hidden'}>Si es algo urgente (sangrado abundante, pérdida de líquido, el bebé no se mueve, dolor muy fuerte), no esperes: llama al 112 o ve a urgencias.</p>
    ${a.context ? `<div><button class="ctx-tag" data-action="ask-clear-ctx" aria-label="Quitar el tema">Sobre: ${esc(a.context)} ${icon('x', 10)}</button></div>` : ''}
    <textarea class="field ask-text" data-model="ask.text" rows="4" maxlength="2000" placeholder="Cuéntanos tu duda con tus palabras. Por ejemplo: «Desde hace 3 días tengo acidez por la noche, ¿qué puedo hacer?»">${esc(a.text)}</textarea>
    ${details.length ? `<label class="ask-check"><input type="checkbox" data-ask-include ${a.include ? 'checked' : ''}>
      <span><span class="t-13">Incluir mi situación</span><span class="t-11 soft block lh-3">${details.map(esc).join(' · ')}</span></span></label>` : ''}
    ${consultFormOn() ? `<label class="stack-4"><span class="t-12 soft">Tu correo, para que te respondan</span>
      <input class="field" type="email" inputmode="email" autocomplete="email" data-model="ask.email" value="${attr(a.email)}" placeholder="nombre@correo.com"></label>
      <input class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" data-model="ask.website" value="">` : ''}
    ${a.status === 'error' ? `<p class="t-12 c-rose">${esc(a.error || 'No se ha podido enviar. Inténtalo de nuevo.')}</p>` : ''}
    <button class="btn-primary" data-action="${consultFormOn() ? 'ask-submit' : 'ask-send'}" data-v="email" data-ask-send ${to && a.status !== 'sending' ? '' : 'disabled'}>${a.status === 'sending' ? 'Enviando…' : to ? `Enviar a ${esc(to.short)}` : 'Elige a quién preguntar'}</button>
    ${to?.whatsapp ? `<button class="outline-sage" data-action="ask-send" data-v="whatsapp">Prefiero escribir por WhatsApp</button>` : ''}
    <p class="t-11 soft-70 lh-3">No es para urgencias: si algo no va bien, contacta con tu centro de salud o tu unidad de referencia. Tu pregunta solo la ve ${to ? esc(to.short) : 'la persona a la que se la envíes'}.</p>
  </div>`);
}

/** Mientras escribe, actualiza la sugerencia sin volver a pintar la hoja (para no perder el foco) */
let askTimer;
function refreshAskSuggestion() {
  clearTimeout(askTimer);
  askTimer = setTimeout(() => {
    if (ui.sheet !== 'ask' || ui.ask.sent) return;
    const sugg = suggestContact({ text: ui.ask.text, context: ui.ask.context, mode: store.mode });
    if (!ui.ask.manual) ui.ask.to = sugg.to;
    root.querySelectorAll('[data-action=ask-pick]').forEach((b) => {
      const on = ui.ask.to === b.dataset.v;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
      b.querySelector('.ask-badge')?.remove();
      if (!ui.ask.manual && sugg.to === b.dataset.v) b.insertAdjacentHTML('beforeend', '<span class="ask-badge">Sugerido</span>');
    });
    const hint = root.querySelector('[data-ask-hint]'); if (hint) hint.textContent = askHint(ui.ask, sugg);
    const urg = root.querySelector('[data-ask-urgent]'); if (urg) urg.hidden = !sugg.urgent;
    const send = root.querySelector('[data-ask-send]');
    if (send) { const t = CONSULTS[ui.ask.to]; send.disabled = !t; send.textContent = t ? `Enviar a ${t.short}` : 'Elige a quién preguntar'; }
  }, 250);
}

const stageUI = () => !PREGNANCY_BETA_ONLY || isBeta() || store.mode !== 'cycle';
const MODE_TAG = { cycle: 'MI CICLO', pregnancy: 'EMBARAZO', postpartum: 'POSPARTO' };



function urgentSheet() {
  const pp = store.mode === 'postpartum';
  const list = pp ? URGENT_POSTPARTUM : URGENT_PREGNANCY;
  return sheetFrame('Cuándo ir a urgencias', `
    <div class="stack-14">
      <p class="t-13 soft lh-4">Ve a urgencias de tu hospital o contacta con tu unidad ${pp ? 'de maternidad' : 'obstétrica'}, sin esperar a la siguiente cita, si notas:</p>
      <ul class="alarm-list">${list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="t-13 lh-4">Si es una emergencia, llama al <a href="tel:112">112</a>.${pp ? ' Si tienes pensamientos de hacerte daño, el <a href="tel:024">024</a> te atiende de forma gratuita y confidencial.' : ''}</p>
      <p class="t-12 soft lh-3">Ante la duda, es mejor consultar: nadie te va a reprochar ir y que todo esté bien.</p>
    </div>`);
}

const slug = (t) => t.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/g, '-').slice(0, 48);

/** Fila desplegable de Hoy: título (y semanas) y detalle sin salir de la pantalla */
function hoyRow(id, head, body, extra = '', cls = '') {
  return `<details class="hq ${cls}" data-id="${attr(id)}" ${ui.openDetails.has(id) ? 'open' : ''}>
    <summary>${head}</summary><div class="hq-a">${body}${extra}</div></details>`;
}

/** Tarea de «Lo que toca ahora»: se marca como hecha y se puede desplegar para ver el detalle */
function todoRow(key, title, sub, text, later = false) {
  const done = !!store.stage.pregnancy?.done?.[key];
  const id = `hoy-todo-${key}`;
  return `<details class="hq todo ${done ? 'done' : ''} ${later ? 'later' : ''}" data-id="${attr(id)}" ${ui.openDetails.has(id) ? 'open' : ''}>
    <summary>
      <button class="todo-check ${done ? 'on' : ''}" data-action="todo-toggle" data-key="${attr(key)}" role="checkbox" aria-checked="${done}" aria-label="${done ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${attr(title)}">${done ? icon('check', 12) : ''}</button>
      <span class="grow"><span class="todo-t">${esc(title)}</span><span class="todo-s">${esc(sub)}</span></span>
    </summary><div class="hq-a todo-a">${text ? `<p>${esc(text)}</p>` : ''}</div></details>`;
}

const todoWeeks = (t) => (t.from === t.to ? `Semana ${t.from}` : `Semanas ${t.from}–${t.to}`);
const todoKey = (t) => slug(t.title);

/** Dudas con respuesta corta desplegable; «Ver respuesta completa» abre la Guía */
function hoyFaqList(items) {
  return items.map((it) => hoyRow(`hoy-q-${slug(it.q)}`, `<span class="grow">${esc(it.q)}</span>`,
    `<p>${esc(it.short)}</p>`,
    `<button class="inline-link self-start t-12" data-action="open-guide" data-section="${it.ref.s}" data-q="${attr(it.ref.q)}">Ver respuesta completa ›</button>`)).join('');
}

const normalCard = (items) => `<div class="card pad stack-10 soft-card">${eyebrow('Lo normal ahora')}
    <ul class="tips">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;

/** Hoy (embarazo, desde la semana 37): acceso directo al registro de contracciones */
function contractionsShortcut() {
  const list = ctList();
  const active = list.find((c) => c.e == null);
  const recent = list.filter((c) => c.e != null && c.s >= Date.now() - 3600e3);
  const sub = active ? 'Contracción en curso · ábrela para terminarla' : recent.length ? `${recent.length} ${plural(recent.length, 'contracción', 'contracciones')} en la última hora` : 'Anota cada cuánto vienen y cuánto duran';
  return `<button class="card pad ct-shortcut" data-action="open-contractions"><span class="push-ic ct-ic">${icon('clock', 16)}</span>
    <span class="grow left"><span class="t-15 w-500 block">Registro de contracciones</span><span class="t-12 soft block">${esc(sub)}</span></span><span class="soft">›</span></button>`;
}

function pregnancyToday() {
  const p = store.stage.pregnancy;
  const g = gestation(p);
  if (!g || g.totalDays < 0 || g.totalDays > 310) {
    return `<div class="stack-18">
      <div class="card pad stack-14">${eyebrow('Tu embarazo')}
        <div class="serif-22">Indica tu fecha probable de parto</div>
        <p class="t-13 soft lh-4">Con ella calcularemos tus semanas y lo que toca en cada momento.</p>
        ${primaryButton('Añadir fecha', 'open-settings')}
      </div>
    </div>`;
  }
  const { now, next } = timelineFor(g.weeks, p.rh);
  const pct = Math.min(100, (g.totalDays / 280) * 100);
  const overdue = g.daysLeft < 0;
  const faqs = pregnancyFaqs(g.weeks, p);
  const flu = `gripe-covid-${new Date().getFullYear()}`;
  const keys = [...now.map(todoKey), ...(fluCampaign() ? [flu] : [])];
  const doneCount = keys.filter((k) => p.done?.[k]).length;
  const rows = [...now.map((t) => todoRow(todoKey(t), t.title, todoWeeks(t), t.text)),
    ...(fluCampaign() ? [todoRow(flu, 'Vacunas de la gripe y la COVID-19', 'Campaña de otoño e invierno', 'Se recomiendan durante la campaña de otoño e invierno, en cualquier trimestre del embarazo.')] : [])];
  const upcoming = next.slice(0, 1).map((t) => todoRow(todoKey(t), t.title, todoWeeks(t), t.text, true));
  const pending = pastItems(g.weeks, p.rh).filter((t) => !p.done?.[todoKey(t)]);
  const vseg = (v, label) => `<button class="seg ${ui.hoyView === v ? 'on' : ''}" aria-pressed="${ui.hoyView === v}" data-action="hoy-view" data-v="${v}">${label}</button>`;
  const switcher = `<div class="segs wide">${vseg('me', 'Tú')}${vseg('baby', 'Tu bebé')}</div>`;
  if (ui.hoyView === 'baby') return `<div class="stack-14">${switcher}${babyView()}</div>`;
  const bw = babyWeek(Math.min(40, Math.max(4, g.weeks)));
  const babyCard = `<div class="card pad stack-6">
      <div class="row between center">${eyebrow('Tu bebé esta semana')}<span class="t-12 soft">≈ ${fmtNum(bw.cm, 1)} cm · ${bw.g < 1 ? '&lt; 1 g' : bw.g >= 1000 ? fmtNum(bw.g / 1000, 2) + ' kg' : bw.g + ' g'}</span></div>
      <p class="t-14 lh-5">${esc(bw.text)}</p>
      <div class="t-13 soft">${babyCompare(g.weeks).emoji} Del tamaño de ${esc(babyCompare(g.weeks).name)}</div>
      <button class="link-soft" data-action="hoy-view" data-v="baby">Ver cómo está tu bebé →</button>
    </div>`;
  return `<div class="stack-14">
    ${switcher}
    <div class="card pad stack-10 preg-hero">
      ${eyebrow(TRIMESTER_LABEL[g.trimester])}
      <div class="row between center">
        <div class="row baseline gap-10">
          <span class="preg-weeks sm">${g.weeks}</span>
          <span class="stack-0"><span class="serif-22">${plural(g.weeks, 'semana', 'semanas')}</span><span class="t-12 soft">+ ${g.days} ${plural(g.days, 'día', 'días')}</span></span>
        </div>
        <div class="text-right"><div class="t-11 soft">Parto previsto</div><div class="t-14 w-500">${esc(fmtDayMonthShort(g.due))} ${partsFromDN(g.due).y}</div>
          <div class="t-11 soft">${overdue ? `hace ${Math.abs(g.daysLeft)} ${plural(Math.abs(g.daysLeft), 'día', 'días')}` : `en ${g.daysLeft} ${plural(g.daysLeft, 'día', 'días')}`}</div></div>
      </div>
      <div class="vbar preg-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <p class="t-13 soft lh-4">${esc(PREGNANCY_LINE[g.trimester])}</p>
      ${overdue ? '<p class="t-11 soft-70 lh-3">Dar a luz hasta la semana 41 y 6 días es normal. Desde la 40 tu equipo te hará controles más frecuentes.</p>' : ''}
      ${p.multiple === 'multiple' ? '<p class="t-11 soft-70 lh-3">Embarazo múltiple: el seguimiento suele ser más frecuente. Sigue las indicaciones de tu equipo.</p>' : ''}
    </div>
    ${g.weeks >= 37 ? contractionsShortcut() : ''}
    ${pushPromptCard()}
    ${babyCard}
    ${normalCard(pregnancyNormal(g.weeks))}
    ${nextAppointmentCard()}
    <div class="card pad stack-6">
      <div class="row between center">${eyebrow('Lo que toca ahora')}${keys.length ? `<span class="t-11 ${doneCount === keys.length ? 'c-sage w-500' : 'soft'}">${doneCount === keys.length ? 'Todo al día' : `${doneCount} de ${keys.length}`}</span>` : ''}</div>
      ${rows.length ? `<div class="hq-list">${rows.join('')}</div>` : '<p class="t-13 soft">Ahora mismo no hay ninguna prueba prevista en el calendario habitual.</p>'}
      ${upcoming.length ? `<div class="t-11 soft upper track-1 mt-4">Próximamente</div><div class="hq-list">${upcoming.join('')}</div>` : ''}
      ${pending.length ? `<details class="pend" data-id="hoy-pend" ${ui.openDetails.has('hoy-pend') ? 'open' : ''}>
        <summary><span class="grow">Pendientes de semanas anteriores</span><span class="pend-n">${pending.length}</span></summary>
        <div class="hq-list">${pending.map((t) => todoRow(todoKey(t), t.title, todoWeeks(t), t.text)).join('')}</div>
        <button class="link-soft" data-action="todo-all-past">Ya las hice todas</button>
      </details>` : ''}
      <p class="t-11 soft-70 lh-3">El calendario concreto lo indica tu equipo; puede variar según tu comunidad y tu hospital.</p>
    </div>
    <div class="card pad stack-6">
      ${eyebrow('Dudas de esta semana')}
      <div class="hq-list">${hoyFaqList(faqs)}</div>
      ${askLink('¿Otra duda?', 'Pregúntanos', `Semana ${g.weeks} de embarazo`)}
    </div>
  </div>`;
}

function postpartumToday() {
  const pp = store.stage.postpartum;
  const s = sinceBirth(pp);
  if (!s) {
    return `<div class="stack-18"><div class="card pad stack-14">${eyebrow('Posparto')}
      <div class="serif-22">¿Cuándo nació tu bebé?</div>
      ${primaryButton('Añadir fecha', 'open-settings')}</div></div>`;
  }
  const bb = pp?.baby;
  const ws = [...(bb?.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
  const lw = ws[ws.length - 1];
  const vseg = (v, label) => `<button class="seg ${ui.hoyView === v ? 'on' : ''}" aria-pressed="${ui.hoyView === v}" data-action="hoy-view" data-v="${v}">${label}</button>`;
  const switcher = `<div class="segs wide">${vseg('me', 'Tú')}${vseg('baby', 'Tu bebé')}</div>`;
  const age = s.weeks === 0 ? `${s.days} ${plural(s.days, 'día', 'días')}` : s.weeks < 12 ? `${s.weeks} ${plural(s.weeks, 'semana', 'semanas')}${s.days ? ` y ${s.days} ${plural(s.days, 'día', 'días')}` : ''}` : (() => { const m = Math.floor(s.total / 30.44); return `${m} ${plural(m, 'mes', 'meses')}`; })();
  const weightLine = bb?.birthWeight ? `${fmtBabyKg(bb.birthWeight)} al nacer${lw ? ` · último ${fmtBabyKg(lw.g)}` : ''}` : 'Aún sin peso apuntado';

  if (ui.hoyView === 'baby') {
    const bw = Math.min(52, Math.max(0, ui.ppBabyWeek ?? s.weeks));
    const phase = bw < 4 ? 'Primer mes' : bw < 12 ? 'Primeros 3 meses' : bw < 24 ? 'De 3 a 6 meses' : 'De 6 a 12 meses';
    const nav = weekNavigator({ week: bw, min: 0, max: 52, current: Math.min(52, s.weeks), action: 'pp-baby-week', title: bw === 0 ? 'Primera semana' : `${bw} ${plural(bw, 'semana', 'semanas')}`, subtitle: phase, backLabel: 'Volver a su semana' });
    return `<div class="stack-14">
    ${switcher}
    ${nav}
    ${normalCard(postpartumBabyNormal(bw))}
    <div class="card pad stack-6">
      <div class="row between center">${eyebrow('Su peso')}<button class="link-soft" data-action="open-care" data-v="baby">${bb?.birthWeight ? 'Ver y apuntar →' : 'Apuntar →'}</button></div>
      <p class="t-14 lh-5">${esc(weightLine)}</p>
      ${bb?.birthWeight && lw ? babyWeightNote(bb.birthWeight, lw, s.birth) : ''}
    </div>
    <div class="card pad stack-6">
      ${eyebrow('Dudas sobre tu bebé')}
      <div class="hq-list">${hoyFaqList(postpartumFaqs(bw, 'baby'))}</div>
      ${askLink('¿Otra duda?', 'Pregúntanos', `Posparto · bebé de ${bw === 0 ? 'la primera semana' : `${bw} ${plural(bw, 'semana', 'semanas')}`}`)}
    </div>
  </div>`;
  }

  const babyCard = `<div class="card pad stack-6">
      <div class="row between center">${eyebrow('Tu bebé esta semana')}<span class="t-12 soft">${esc(lw ? fmtBabyKg(lw.g) : age)}</span></div>
      <p class="t-14 lh-5">${esc(postpartumBabyNormal(s.weeks)[0])}</p>
      <div class="t-13 soft">${esc(lw ? `Tiene ${age}` : weightLine)}</div>
      <button class="link-soft" data-action="hoy-view" data-v="baby">Ver cómo está tu bebé →</button>
    </div>`;
  return `<div class="stack-14">
    ${switcher}
    <div class="card pad stack-10 preg-hero">
      ${eyebrow('Desde el parto')}
      <div class="row between center">
        <div class="row baseline gap-10">
          ${s.weeks === 0
            ? `<span class="preg-weeks sm">${s.days}</span><span class="stack-0"><span class="serif-22">${plural(s.days, 'día', 'días')}</span><span class="t-12 soft">primera semana</span></span>`
            : `<span class="preg-weeks sm">${s.weeks}</span><span class="stack-0"><span class="serif-22">${plural(s.weeks, 'semana', 'semanas')}</span><span class="t-12 soft">+ ${s.days} ${plural(s.days, 'día', 'días')}</span></span>`}
        </div>
        <div class="text-right"><div class="t-11 soft">Tu bebé nació el</div><div class="t-14 w-500">${esc(fmtDayMonthShort(s.birth))}</div></div>
      </div>
      <p class="t-13 soft lh-4">${esc(postpartumLine(s.weeks))}</p>
    </div>
    ${pushPromptCard()}
    ${babyCard}
    ${normalCard(postpartumNormal(s.weeks))}
    ${nextAppointmentCard()}
    <div class="card pad stack-6">
      ${eyebrow('Dudas de esta semana')}
      <div class="hq-list">${hoyFaqList(postpartumFaqs(s.weeks, 'mom'))}</div>
      ${askLink('¿Otra duda?', 'Pregúntanos', `Posparto · semana ${s.weeks}`)}
    </div>
    ${s.weeks >= 6 ? `<div class="text-center t-12 soft">¿Te ha vuelto la regla? <button class="inline-link" data-action="stage-back-cycle">Seguir mi ciclo</button></div>` : ''}
  </div>`;
}

/** Aviso en Hoy (ciclo) durante los 6 meses siguientes al posparto */
function postpartumCycleNote() {
  const end = dnFromISO(store.stage.postpartum?.endedAt);
  if (end == null || todayDN() - end > 183) return '';
  return `<div class="card pad stack-8">
    <div class="row gap-8 center"><span class="c-gold">${icon('info', 14)}</span><span class="t-13 w-500">Tus primeros ciclos tras el parto</span></div>
    <p class="t-12 soft lh-4">Después del parto y durante la lactancia los ciclos suelen ser irregulares. Las predicciones serán poco fiables hasta que registres dos o tres reglas.</p>
  </div>`;
}

function alarmBanner(active, pp) {
  if (!active.length) return '';
  const selfHarm = active.includes('Pensamientos de hacerme daño');
  return `<div class="soft-note">${selfHarm
    ? 'No estás sola y tiene tratamiento. Habla hoy con alguien de confianza o llama al <a href="tel:024">024</a>, gratuito y confidencial.'
    : `Esto conviene valorarlo hoy: contacta con tu unidad ${pp ? 'de maternidad' : 'obstétrica'}.`}
    <button class="inline-link" data-action="open-urgent">Cuándo ir a urgencias</button></div>`;
}

// MARK: - Registro de contracciones (embarazo · vera-backlog#45, paso 1: solo registro, sin criterio de aviso)

const CT_KEEP = 24 * 3600e3; // se conserva el registro de las últimas 24 h
const ctList = () => (store.stage.pregnancy?.contractions || []).filter((c) => c && Number.isFinite(c.s)).sort((a, b) => a.s - b.s);
function ctSave(list) {
  const p = store.stage.pregnancy || {};
  store.updateStage({ ...store.stage, pregnancy: { ...p, contractions: list.filter((c) => Date.now() - c.s < CT_KEEP) } });
}
const ctClock = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const ctDur = (sec) => (sec < 60 ? `${Math.round(sec)} s` : `${Math.floor(sec / 60)} min${Math.round(sec % 60) ? ` ${String(Math.round(sec % 60)).padStart(2, '0')} s` : ''}`);
const ctGap = (sec) => (sec < 90 ? `${Math.round(sec)} s` : `${fmtNum(sec / 60, 1)} min`);

function contractionsCard(prominent = false) {
  const list = ctList();
  const active = list.find((c) => c.e == null);
  const done = list.filter((c) => c.e != null);
  const hourAgo = Date.now() - 3600e3;
  const recent = done.filter((c) => c.s >= hourAgo);
  const avgDur = recent.length ? recent.reduce((a, c) => a + (c.e - c.s) / 1000, 0) / recent.length : 0;
  const starts = list.filter((c) => c.s >= hourAgo).map((c) => c.s);
  const gaps = starts.slice(1).map((t, i) => (t - starts[i]) / 1000);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const summary = recent.length
    ? `<div class="cmp-row"><span class="t-14">En la última hora: <b>${recent.length}</b> ${plural(recent.length, 'contracción', 'contracciones')}${gaps.length ? ` · una cada <b>${ctGap(avgGap)}</b>` : ''} · duran <b>${ctDur(avgDur)}</b></span></div>`
    : '';
  const rows = [...done].reverse().slice(0, 8).map((c) => {
    const i = list.indexOf(c);
    const prev = i > 0 ? list[i - 1] : null;
    return `<div class="ct-row"><span class="t-14 w-500">${ctClock(c.s)}</span><span class="t-13">${ctDur((c.e - c.s) / 1000)}</span>
      <span class="t-12 soft grow">${prev ? `${ctGap((c.s - prev.s) / 1000)} desde la anterior` : 'primera'}</span>
      <button class="icon-btn soft" data-action="ct-del" data-s="${c.s}" aria-label="Quitar esta contracción">${icon('x', 12)}</button></div>`;
  }).join('');
  return `<div class="card pad stack-12 ${prominent ? 'ct-prominent' : ''}">
    ${eyebrow('Contracciones')}
    <p class="t-13 soft lh-4">Pulsa al empezar cada contracción y otra vez cuando termine. Hera calcula cada cuánto vienen y cuánto duran.</p>
    <button class="${active ? 'btn-primary ct-active' : 'btn-primary'}" data-action="ct-toggle">${active ? `Terminar contracción · <span data-ct-live data-s="${active.s}">${ctDur((Date.now() - active.s) / 1000)}</span>` : 'Empezar contracción'}</button>
    ${summary}
    ${rows ? `<div class="stack-4">${rows}</div>` : ''}
    ${done.length || active ? '<button class="link-danger" data-action="ct-clear">Borrar el registro</button>' : ''}
    <p class="t-11 soft-70 lh-3">Hera no te dice cuándo ir al hospital: si tienes dudas, mira <button class="inline-link" data-action="open-urgent">cuándo ir a urgencias</button> o contacta con tu equipo. Ante sangrado, pérdida de líquido o menos movimientos del bebé, no esperes.</p>
    ${askLink('', 'Pregúntanos', 'Contracciones')}
  </div>`;
}
setInterval(() => { // cronómetro de la contracción en curso, sin volver a pintar toda la pantalla
  document.querySelectorAll('[data-ct-live]').forEach((el) => { el.textContent = ctDur((Date.now() - +el.dataset.s) / 1000); });
}, 1000);

function stageDiary() {
  const pp = store.mode === 'postpartum';
  const ds = ui.selectedDate;
  const isToday = ds === todayISO();
  const log = store.log(ds);
  const symptoms = pp ? POSTPARTUM_SYMPTOMS : PREGNANCY_SYMPTOMS;
  const alarms = pp ? POSTPARTUM_ALARMS : PREGNANCY_ALARMS;
  const activeAlarms = alarms.filter((a) => log.symptoms.includes(a));
  const g = pp ? null : gestation(store.stage.pregnancy, dnFromISO(ds));
  const ctWeeks = pp ? 0 : (gestation(store.stage.pregnancy)?.weeks ?? 0);
  const reducedMoves = log.babyMovement === 'Menos de lo habitual';
  const dw = store.defaultWeight;
  const warnings = pp ? [] : pregnancyMedWarnings(store.data.meds);
  const moods = ['Tranquila', 'Con energía', 'Sensible', 'Cansada', 'Preocupada', 'Triste'];

  return `<div class="stack-18">
    ${weekStrip(false)}
    ${!isToday ? `<div class="row gap-8 center px-4"><span class="c-gold">${icon('pencil', 14)}</span><span class="t-13 soft">Editando el ${esc(fmtWeekdayLong(dnFromISO(ds)))}</span></div>` : ''}
    ${alarmBanner(reducedMoves ? [...activeAlarms, 'mov'] : activeAlarms, pp)}
    ${!pp && isToday && ctWeeks >= 37 ? contractionsCard(true) : ''}
    <div class="card pad-0">
      <div class="px-20 pt-20">${eyebrow('Cómo te sientes')}</div>
      <div class="hscroll-wrap"><div class="hscroll">${moods.map((m) => chip(m, log.mood === m, 'set-mood', { v: m })).join('')}</div></div>
    </div>
    <div class="card pad stack-14">
      <div class="row baseline between">${eyebrow('Síntomas')}${g && g.totalDays >= 0 ? `<span class="t-11 soft">Semana ${g.weeks}</span>` : ''}</div>
      <div class="chips">${symptoms.map((s) => chip(s, log.symptoms.includes(s), 'toggle-symptom', { s })).join('')}</div>
      ${(() => { const sel = symptoms.filter((x) => log.symptoms.includes(x)); return sel.length
        ? askLink('¿Te preocupa?', 'Pregúntanos', sel.join(', ') + (g && g.totalDays >= 0 ? ` · semana ${g.weeks}` : '')) : ''; })()}
      <hr>
      <div class="row gap-6 center"><span class="c-rose">${icon('alertFill', 13)}</span><span class="t-13 w-500 soft">Señales de alarma</span></div>
      <div class="chips">${alarms.map((s) => chip(s, log.symptoms.includes(s), 'toggle-symptom', { s }, 'rose')).join('')}</div>
    </div>
    ${!pp && g && g.weeks >= 20 ? `<div class="card pad stack-12">
      ${eyebrow('Movimientos del bebé')}
      <p class="t-12 soft lh-3">No hay un número exacto: lo importante es que conozcas su patrón habitual.</p>
      <div class="row gap-8 wrap">${BABY_MOVEMENT.map((v) => chip(v, log.babyMovement === v, 'set-movement', { v }, v === 'Como siempre' ? 'sage' : 'rose')).join('')}</div>
      ${reducedMoves ? '<p class="t-12 lh-3 c-rose">Túmbate de lado un rato y concéntrate en sus movimientos. Si sigues notándolo menos, ve a urgencias hoy mismo: no esperes al día siguiente.</p>' : ''}
    </div>` : ''}
    ${!pp && isToday && ctWeeks >= 24 && ctWeeks < 37 ? contractionsCard() : ''}
    <div class="card pad stack-16">
      ${eyebrow('Seguimiento')}
      ${trackingSlider('Peso', 'scale', 'deep', 'weight', log.weight,
        { value: dw ?? 60, note: log.weight == null && dw != null ? `<span class="t-11 soft-70">· último: ${Math.trunc(dw)} kg</span>` : '' },
        35, 150, 1, (v) => `${Math.trunc(v)} kg`)}
      <hr>
      ${trackingSlider('Horas de sueño', 'moon', 'deep', 'sleepHours', log.sleepHours, { value: 7 }, 3, 12, 0.5, (v) => `${fmtNum(v, 1)} h`)}
    </div>
    ${warnings.length ? `<div class="card pad stack-10">${eyebrow('Tu medicación en el embarazo')}
      ${warnings.map((w) => `<div class="row gap-8 top t-13 lh-4"><span class="c-gold mt-1">${icon('info', 13)}</span><span>${esc(w)}</span></div>`).join('')}
      <p class="t-11 soft-70 lh-3">No dejes ni cambies ninguna medicación por tu cuenta: coméntalo con quien te la receta.</p></div>` : ''}
    ${pp && store.data.meds.length && store.stage.postpartum?.feeding !== 'formula' ? `<div class="card pad stack-8">${eyebrow('Tu medicación y la lactancia')}
      <p class="t-13 lh-4">La mayoría de los medicamentos son compatibles con la lactancia. Puedes comprobar cada uno en e-lactancia.org y comentarlo con quien te lo receta.</p>
      <a class="faq-ext self-start t-13" href="https://www.e-lactancia.org/" target="_blank" rel="noopener">Consultar en e-lactancia.org ↗</a></div>` : ''}
    ${isToday ? medicationSection(log) : ''}
  </div>`;
}

function answerHTML(a) {
  return a.map((b) => {
    if (Array.isArray(b)) return `<ul class="tips">${b.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>`;
    if (b && typeof b === 'object') return `<p><a class="faq-ext" href="${attr(b.link)}" target="_blank" rel="noopener">${esc(b.text)} ↗</a></p>`;
    return `<p>${esc(b)}</p>`;
  }).join('');
}

function guideView() {
  const pp = store.mode === 'postpartum';
  const g = pp ? null : gestation(store.stage.pregnancy);
  const current = g ? guideSectionFor(g.weeks).id : (pp ? 'pp' : null);
  const sections = pp ? [...POSTPARTUM_GUIDE, ...PREGNANCY_GUIDE] : [...PREGNANCY_GUIDE, ...POSTPARTUM_GUIDE];
  const isOpen = (id) => ui.openDetails.has(id);
  return `<div class="stack-18">
    <div class="card pad stack-12">
      ${eyebrow('Preguntas y respuestas')}
      <div class="serif-22">${pp ? 'Dudas del posparto y del embarazo' : 'Dudas del embarazo, semana a semana'}</div>
      <p class="t-12 soft lh-4">${esc(GUIDE_INTRO)}</p>
      <label class="search">${icon('search', 14, 'soft')}<input type="search" data-guide-search placeholder="Busca: café, ecografía, vacunas…" value="${attr(ui.guideQuery)}" aria-label="Buscar en las dudas"></label>
    </div>
    <details class="card pad faq-item urgent-sec" data-id="urgencias" ${isOpen('urgencias') ? 'open' : ''}>
      <summary>Cuándo ir a urgencias</summary>
      <div class="faq-a"><p>Ve a urgencias o contacta con tu unidad ${pp ? 'de maternidad' : 'obstétrica'}, sin esperar a la siguiente cita, si notas:</p>
        <ul class="tips">${(pp ? URGENT_POSTPARTUM : URGENT_PREGNANCY).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <p>Ante la duda, es mejor consultar. Si es una emergencia, llama al <a href="tel:112">112</a>.</p></div>
    </details>
    ${sections.map((sec) => `<section class="card pad stack-10 guide-sec" data-sec="${sec.id}">
      <div class="row baseline between">${eyebrow(sec.title)}${sec.id === current ? '<span class="now-tag">Ahora</span>' : ''}</div>
      <div class="t-13 soft">${esc(sec.subtitle)}</div>
      <div class="faq">${sec.items.map((it, i) => {
        const id = `${sec.id}-${i}`;
        return `<details class="faq-item" data-id="${id}" data-text="${attr((it.q + ' ' + it.a.flat().map((b) => (b && typeof b === 'object' ? b.text : b)).join(' ')).toLowerCase())}" ${isOpen(id) ? 'open' : ''}>
          <summary>${esc(it.q)}</summary><div class="faq-a">${answerHTML(it.a)}${askLink('', '¿Te queda alguna duda?', it.q)}</div></details>`;
      }).join('')}</div>
    </section>`).join('')}
    <p class="guide-empty t-13 soft text-center" hidden>No hemos encontrado nada. Prueba con otra palabra o escríbenos.</p>
    <p class="t-13 soft text-center">¿No encuentras tu duda? <button class="inline-link" data-action="open-ask" data-ctx="">Escríbenos</button></p>
  </div>`;
}

/** Filtra la guía en el DOM sin re-renderizar (para no perder el foco del buscador) */
function applyGuideFilter() {
  const q = ui.guideQuery.trim().toLowerCase();
  let any = false;
  root.querySelectorAll('.guide-sec').forEach((sec) => {
    let shown = 0;
    sec.querySelectorAll('.faq-item').forEach((d) => {
      const hit = !q || d.dataset.text.includes(q);
      d.hidden = !hit;
      if (hit) shown++;
    });
    sec.hidden = shown === 0;
    if (shown) any = true;
  });
  const empty = root.querySelector('.guide-empty');
  if (empty) empty.hidden = any;
}

// MARK: - Ajustes de etapa

const STAGE_NAME = { cycle: 'Ciclo', pregnancy: 'Embarazo', postpartum: 'Posparto' };
const settingsSnapshot = () => JSON.stringify({ d: ui.draft, s: ui.draftStage });
const settingsDirty = () => ui.sheet === 'settings' && ui.settingsBaseline != null && settingsSnapshot() !== ui.settingsBaseline;

/** Barra fija con «Guardar» cuando hay cambios sin guardar en ajustes */
function saveBar() {
  if (!settingsDirty()) return '';
  const changing = stageUI() && ui.draftStage && ui.draftStage.mode !== store.mode;
  return `<div class="save-bar">
    <span class="t-13 grow">${changing ? `Pasarás a seguir: <b>${STAGE_NAME[ui.draftStage.mode]}</b>` : 'Tienes cambios sin guardar'}</span>
    <button class="pill-dark" data-action="save-settings">Guardar</button>
  </div>`;
}

function stageSection() {
  const d = ui.draftStage;
  const btn = (label, val, ic) => `<button class="stage-btn ${d.mode === val ? 'on' : ''}" aria-pressed="${d.mode === val}" data-action="draft-stage" data-v="${val}">
      ${icon(ic, 18)}<span>${label}</span>${store.mode === val ? `<em class="stage-current">${icon('check', 10)} Actual</em>` : ''}
    </button>`;
  return `<div class="stack-10"><div class="t-13 soft">¿En qué momento estás?</div>
    <div class="row gap-8">${btn('Embarazo', 'pregnancy', 'sprout')}${btn('Posparto', 'postpartum', 'flower')}${btn('Ciclo', 'cycle', 'moon')}</div></div>
    ${store.mode !== 'cycle' && d.mode === 'cycle' ? `<div class="note-mist lh-3"><span class="c-sage">${icon('info', 14)}</span><span>${store.mode === 'pregnancy'
      ? 'Si tu embarazo ha terminado, cuídate y date tiempo; puedes escribirnos cuando quieras. Indica abajo tu última regla cuando vuelva.'
      : 'Indica abajo el primer día de tu última regla. Los primeros ciclos tras el parto suelen ser irregulares.'}</span></div>` : ''}
    <hr>`;
}

function optRow(label, field, options, value) {
  return `<div class="stack-8"><div class="t-13 soft">${label}</div>
    <div class="row gap-8 wrap">${options.map(([v, l]) => chip(l, value === v, 'draft-stage-field', { f: field, v }, 'deep')).join('')}</div></div>`;
}

/** Campo único de fecha: fecha probable de parto o última regla (calcula el parto sola) */
function dueField({ ctx, mode, dueValue, lmpValue }) {
  const seg = (v, label) => `<button class="seg ${mode === v ? 'on' : ''}" aria-pressed="${mode === v}" data-action="due-mode" data-ctx="${ctx}" data-v="${v}">${label}</button>`;
  const lmp = dnFromISO(lmpValue);
  const due = mode === 'lmp' ? (lmp != null && lmp <= todayDN() ? dueFromLmp(lmp) : null) : dnFromISO(dueValue);
  const g = due != null ? gestation({ dueDate: isoFromDN(due) }) : null;
  const valid = g && g.totalDays >= 0 && g.totalDays <= 310;
  const input = mode === 'lmp'
    ? `<input type="date" class="field date" data-model="${ctx}.lmp" value="${attr(lmpValue || '')}" max="${todayISO()}" aria-label="Primer día de tu última regla">`
    : `<input type="date" class="field date" data-model="${ctx}.dueDate" value="${attr(dueValue || '')}" min="${isoFromDN(todayDN() - 100)}" max="${isoFromDN(todayDN() + 300)}" aria-label="Fecha probable de parto">`;
  return `<div class="stack-8">
      <div class="row between center wrap gap-8"><span class="t-13 soft">${mode === 'lmp' ? 'Primer día de tu última regla' : 'Fecha probable de parto'}</span>
        <span class="segs">${seg('lmp', 'Última regla')}${seg('due', 'Fecha de parto')}</span></div>
      ${input}
      ${valid
        ? `<div class="t-12 soft">${mode === 'lmp' ? `Parto previsto el <b>${esc(fmtDayMonthYear(due))}</b> · ` : 'Hoy: '}${g.weeks} semanas + ${g.days} ${plural(g.days, 'día', 'días')}</div>`
        : `<div class="t-12 soft-70">${mode === 'lmp' ? 'Calcularemos tu fecha de parto (40 semanas desde la última regla).' : 'Si la ecografía la ha ajustado, usa esa fecha.'}</div>`}
    </div>`;
}

function pregnancyForm() {
  const p = ui.draftStage.pregnancy;
  return `${dueField({ ctx: 'draftStage', mode: ui.dueMode, dueValue: p.dueDate, lmpValue: ui.draftLmp })}
    <hr>
    <div class="row gap-8">
      <label class="grow stack-4"><span class="t-13 soft">Altura (cm)</span><input type="number" inputmode="decimal" class="field" data-model="draftStage.height" value="${attr(p.height ?? '')}" min="120" max="220"></label>
      <label class="grow stack-4"><span class="t-13 soft">Peso antes del embarazo (kg)</span><input type="number" inputmode="decimal" class="field" data-model="draftStage.preWeight" value="${attr(p.preWeight ?? '')}" min="35" max="200"></label>
    </div>
    ${optRow('Tipo de embarazo', 'multiple', [['single', 'Un bebé'], ['multiple', 'Más de uno'], ['unknown', 'Aún no lo sé']], p.multiple)}
    ${optRow('Tu grupo Rh (está en tu primera analítica)', 'rh', [['pos', 'Positivo'], ['neg', 'Negativo'], ['unknown', 'No lo sé']], p.rh)}
    ${optRow('Toxoplasmosis', 'toxo', [['immune', 'Soy inmune'], ['not', 'No soy inmune'], ['unknown', 'No lo sé']], p.toxo)}
    <p class="t-11 soft-70 lh-3">Son opcionales: los usamos para mostrarte solo lo que te aplica.</p>
    <hr>`;
}

function postpartumForm() {
  const pp = ui.draftStage.postpartum;
  return `<div class="stack-8">
      <div class="t-13 soft">Fecha del parto</div>
      <input type="date" class="field date" data-model="draftStage.birthDate" value="${attr(pp.birthDate || '')}" max="${todayISO()}" min="${isoFromDN(todayDN() - 730)}">
    </div>
    ${optRow('Lactancia', 'feeding', [['breast', 'Materna'], ['mixed', 'Mixta'], ['formula', 'Artificial'], ['na', 'Prefiero no decirlo']], pp.feeding)}
    <hr>`;
}

/** Calcula la nueva etapa a partir del borrador. Devuelve { stage } o { error } */
function buildStage() {
  const cur = store.stage;
  const d = ui.draftStage;
  const today = todayDN();
  const history = [...cur.history];
  const closePregnancy = (to) => {
    const due = dnFromISO(cur.pregnancy?.dueDate);
    if (cur.mode === 'pregnancy' && due != null) history.push({ from: isoFromDN(due - 280), to });
  };
  if (d.mode === 'pregnancy') {
    const due = dnFromISO(d.pregnancy.dueDate);
    if (due == null || due < today - 100 || due > today + 300) return { error: 'Indica una fecha probable de parto válida (o calcúlala con tu última regla).' };
    return { stage: { ...cur, mode: 'pregnancy', pregnancy: { ...d.pregnancy }, history } };
  }
  if (d.mode === 'postpartum') {
    const birth = dnFromISO(d.postpartum.birthDate);
    if (birth == null || birth > today) return { error: 'Indica la fecha del parto.' };
    closePregnancy(isoFromDN(birth));
    return { stage: { ...cur, mode: 'postpartum', pregnancy: null, postpartum: { ...(cur.mode === 'postpartum' ? cur.postpartum : {}), birthDate: d.postpartum.birthDate, feeding: d.postpartum.feeding ?? null }, history } };
  }
  closePregnancy(todayISO());
  const postpartum = cur.mode === 'postpartum' && cur.postpartum ? { ...cur.postpartum, endedAt: todayISO() } : cur.postpartum;
  return { stage: { ...cur, mode: 'cycle', pregnancy: null, postpartum, history } };
}

// =========================================================================
// MARK: - Mi bebé (embarazo)
// =========================================================================

function fetusBlock(week) {
  if (week < FETUS_MIN_WEEK) return `<p class="t-13 soft lh-4">El modelo 3D está disponible desde la semana ${FETUS_MIN_WEEK}. Antes de esa semana, prueba con la ilustración.</p>`;
  return `<div class="fetus-stage" data-fetus-week="${week}" data-state="loading">
      <div class="fetus-msg fetus-loading">Modelando la semana ${week}…</div>
      <div class="fetus-msg fetus-error">Tu navegador no puede mostrar el modelo 3D. Prueba con la ilustración o la ecografía.</div>
      <div class="fetus-hint">Arrastra para girar<br>Pellizca para acercar</div>
    </div>
    <p class="t-11 soft-70 lh-3">Modelo generado por ordenador: refleja proporciones y cambios generales del desarrollo, no la anatomía exacta de tu bebé.</p>`;
}

/** Tarjeta de navegación por semanas (embarazo y bebé de posparto): ‹ título ›, tira de semanas y vuelta a la actual */
function weekNavigator({ week, min, max, current, action, title, subtitle, backLabel }) {
  const chips = Array.from({ length: max - min + 1 }, (_, i) => i + min).map((w) =>
    `<button class="bw-chip ${w === week ? 'on' : ''} ${w === current ? 'cur' : ''}" data-action="${action}" data-w="${w}" aria-label="Semana ${w}">${w}</button>`).join('');
  return `<div class="card pad stack-12">
      <div class="row between center">
        <button class="sq-btn" data-action="${action}" data-w="${Math.max(min, week - 1)}" aria-label="Semana anterior" ${week <= min ? 'disabled' : ''}>${icon('left', 12)}</button>
        <div class="text-center"><div class="serif-24">${esc(title)}</div><div class="t-11 soft upper track-1">${esc(subtitle)}</div></div>
        <button class="sq-btn" data-action="${action}" data-w="${Math.min(max, week + 1)}" aria-label="Semana siguiente" ${week >= max ? 'disabled' : ''}>${icon('right', 12)}</button>
      </div>
      <div class="bw-strip">${chips}</div>
      ${current != null && week !== current ? `<button class="link-soft" data-action="${action}" data-w="${current}">${esc(backLabel)} (${current})</button>` : ''}
      ${current != null && week === current ? '<span class="now-tag self-start">Tu semana</span>' : ''}
    </div>`;
}

function babyView() {
  const g = gestation(store.stage.pregnancy);
  const current = g && g.totalDays >= 0 ? Math.min(40, Math.max(4, g.weeks)) : null;
  const week = ui.babyWeek ?? current ?? 12;
  const b = babyWeek(week);
  const trimester = week < 14 ? 1 : week < 28 ? 2 : 3;
  const is3d = ui.babyMedia === '3d';
  const media = is3d ? null : mediaFor(ui.babyMedia, week);
  const seg = (v, label) => `<button class="seg ${ui.babyMedia === v ? 'on' : ''}" aria-pressed="${ui.babyMedia === v}" data-action="baby-media" data-v="${v}">${label}</button>`;
  const nav = weekNavigator({ week, min: 4, max: 40, current, action: 'baby-week', title: `Semana ${week}`, subtitle: TRIMESTER_LABEL[trimester], backLabel: 'Volver a mi semana' });
  return `<div class="stack-18">
    ${nav}
    <div class="card pad stack-12">
      <div class="row between center wrap gap-8">${eyebrow('Cómo es')}<span class="segs">${seg('illustration', 'Ilustración')}${seg('ultrasound', 'Ecografía')}${seg('3d', '3D')}</span></div>
      ${is3d ? fetusBlock(week) : media ? `<figure class="baby-fig ${ui.babyMedia}">
          <img src="${media.src}" alt="${attr(media.alt || `Ilustración de un feto de ${media.week} semanas`)}" loading="lazy">
        </figure>
        ${media.week !== week ? `<p class="t-11 soft lh-3">Imagen de referencia de la semana ${media.week}: no representa exactamente la semana ${week}.</p>` : ''}
        <p class="t-11 soft-70"><a href="${media.url}" target="_blank" rel="noopener">${esc(media.credit)}</a>, vía Wikimedia Commons</p>`
        : `<p class="t-13 soft lh-4">No tenemos una ecografía de ejemplo cercana a esta semana. Prueba con la ilustración o con las semanas 12, 17, 20 o 24.</p>`}
    </div>
    <div class="card pad stack-12">
      ${eyebrow('Su desarrollo')}
      <p class="t-14 lh-5">${esc(b.text)}</p>
      <div class="cmp-row"><span class="cmp-emo" aria-hidden="true">${babyCompare(week).emoji}</span><span class="t-14">Del tamaño de ${esc(babyCompare(week).name)}</span></div>
      <hr>
      <div class="row gap-12">
        <div class="grow"><div class="serif-28">≈ ${fmtNum(b.cm, b.cm < 10 ? 1 : 1)} cm</div><div class="t-11 soft">${esc(b.measure)}</div></div>
        <div class="grow"><div class="serif-28">${b.g < 1 ? '&lt; 1 g' : `≈ ${b.g >= 1000 ? fmtNum(b.g / 1000, 2) + ' kg' : b.g + ' g'}`}</div><div class="t-11 soft">Peso aproximado</div></div>
      </div>
      <p class="t-11 soft-70 lh-3">Valores medios orientativos, no una medición de tu bebé: cada bebé crece a su ritmo. Si tienes dudas sobre su crecimiento, coméntalo en tu próxima visita.</p>
      ${askLink('', '¿Dudas sobre su crecimiento?', `Mi bebé · semana ${week}`)}
    </div>
    <details class="card pad credits"><summary class="t-12 soft">Créditos de las imágenes</summary>
      <ul class="t-11 soft lh-4">${[...BABY_MEDIA.illustration, ...BABY_MEDIA.ultrasound].map((m) => `<li>Semana ${m.week}: <a href="${m.url}" target="_blank" rel="noopener">${esc(m.credit)}</a></li>`).join('')}</ul>
      <p class="t-11 soft-70 lh-3">Imágenes de Wikimedia Commons con sus licencias originales (CC BY-SA 2.5, CC BY-SA 3.0, CC BY 2.0 o dominio público).</p>
    </details>
  </div>`;
}

// =========================================================================
// MARK: - Cuidados: agenda, peso y alimentación
// =========================================================================

const APPT_SUGGESTIONS = ['Visita con la matrona', 'Visita con mi obstetra', 'Analítica', 'Ecografía', "Test de O'Sullivan",
  'Vacuna', 'Clases de preparación al parto', 'Monitorización', 'Revisión posparto', 'Visita del bebé con pediatría'];

function upcomingAppointments() {
  const today = todayISO();
  return [...(store.stage.appointments || [])].filter((a) => a.date >= today)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

function nextAppointmentCard() {
  const next = upcomingAppointments()[0];
  if (!next) return '';
  const dn = dnFromISO(next.date);
  const days = dn - todayDN();
  return `<div class="card pad stack-8">
    <div class="row baseline between">${eyebrow('Mi próxima cita')}<span class="t-11 soft">${days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`}</span></div>
    <div class="t-15 w-500">${esc(next.title)}</div>
    <div class="t-13 soft">${esc(capFirst(fmtWeekdayLong(dn)))}${next.time ? ` · ${esc(next.time)}` : ''}</div>
    <button class="link-soft" data-action="open-care" data-v="agenda">Ver mi agenda →</button>
  </div>`;
}

function apptRow(a, past) {
  const dn = dnFromISO(a.date);
  const p = partsFromDN(dn);
  return `<div class="appt ${past ? 'past' : ''}">
    <div class="appt-date"><b>${p.d}</b><span>${esc(fmtMonthShort(dn))}</span></div>
    <div class="grow"><div class="t-14 w-500">${esc(a.title)}</div><div class="t-12 soft">${esc(capFirst(fmtWeekdayLong(dn)).split(',')[0])}${a.time ? ` · ${esc(a.time)}` : ''}</div>
      ${past ? '' : `<button class="appt-remind" data-action="appt-ics" data-id="${attr(a.id)}" aria-label="Añadir ${attr(a.title)} al calendario del móvil para recibir aviso">${icon('calendar', 13)} Avisarme en mi calendario</button>`}</div>
    <button class="icon-btn soft" data-action="appt-delete" data-id="${attr(a.id)}" aria-label="Eliminar ${attr(a.title)}">${icon('x', 12)}</button>
  </div>`;
}

function agendaSection() {
  const all = store.stage.appointments || [];
  const up = upcomingAppointments();
  const past = all.filter((a) => a.date < todayISO()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return `<div class="card pad stack-12">
    ${eyebrow('Mi agenda')}
    ${up.length ? up.map((a) => apptRow(a, false)).join('') : '<p class="t-13 soft">Aún no has guardado ninguna cita.</p>'}
    <hr>
    <div class="stack-8">
      <div class="t-13 w-500">Añadir una cita</div>
      <input class="field" list="appt-suggest" data-model="newAppt.title" placeholder="Visita con la matrona, ecografía…" value="${attr(ui.newAppt.title)}" maxlength="80">
      <datalist id="appt-suggest">${APPT_SUGGESTIONS.map((t) => `<option value="${attr(t)}">`).join('')}</datalist>
      <div class="row gap-8">
        <input type="date" class="field date grow" data-model="newAppt.date" value="${attr(ui.newAppt.date)}" min="${todayISO()}" aria-label="Fecha de la cita">
        <input type="time" class="field date appt-time" data-model="newAppt.time" value="${attr(ui.newAppt.time)}" aria-label="Hora (opcional)">
      </div>
      <button class="outline-sage" data-action="appt-add">${icon('plusCircle', 14)} Añadir a mi agenda</button>
    </div>
    ${past.length ? `<details class="faq-item"><summary>Citas anteriores</summary><div class="stack-8 pt-4">${past.map((a) => apptRow(a, true)).join('')}</div></details>` : ''}
    <p class="t-11 soft-70 lh-3">Las citas y pruebas las indica tu equipo. Con «Avisarme en mi calendario» se descarga un archivo que tu móvil añade a su calendario, y es él quien te avisa (también con Hera cerrada).</p>
  </div>`;
}

function weightChart(range, points) {
  const W = 320, H = 190, L = 34, R = 10, T = 14, B = 24;
  const maxY = Math.max(range ? range.high + 2 : 16, ...points.map((p) => p.gain + 1), 6);
  const minY = Math.min(-2, ...points.map((p) => p.gain - 1));
  const x = (w) => L + (w / 40) * (W - L - R);
  const y = (kg) => T + (1 - (kg - minY) / (maxY - minY)) * (H - T - B);
  let band = '';
  if (range) {
    const weeks = Array.from({ length: 41 }, (_, i) => i);
    const top = weeks.map((w) => `${x(w).toFixed(1)},${y(gainBandAt(w, range).high).toFixed(1)}`);
    const bot = weeks.reverse().map((w) => `${x(w).toFixed(1)},${y(gainBandAt(w, range).low).toFixed(1)}`);
    band = `<polygon points="${[...top, ...bot].join(' ')}" fill="var(--gold-soft)" opacity=".9"/>`;
  }
  const yTicks = [];
  for (let k = Math.ceil(minY / 5) * 5; k <= maxY; k += 5) yTicks.push(k);
  return `<svg class="wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de kilos ganados por semana de embarazo">
    ${yTicks.map((k) => `<line x1="${L}" x2="${W - R}" y1="${y(k)}" y2="${y(k)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(k) + 3}" text-anchor="end" class="wc-t">${k}</text>`).join('')}
    ${[0, 10, 20, 30, 40].map((w) => `<text x="${x(w)}" y="${H - 10}" text-anchor="middle" class="wc-t">${w}</text>`).join('')}
    ${band}
    ${points.length > 1 ? `<polyline points="${points.map((p) => `${x(p.week).toFixed(1)},${y(p.gain).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--st-mid)" stroke-width="1.5"/>` : ''}
    ${points.map((p) => `<circle cx="${x(p.week).toFixed(1)}" cy="${y(p.gain).toFixed(1)}" r="3.5" fill="var(--st-mid)"><title>Semana ${Math.floor(p.week)}: ${p.gain >= 0 ? '+' : ''}${fmtNum(p.gain, 1)} kg</title></circle>`).join('')}
    <text x="${L - 6}" y="${T - 1}" text-anchor="end" class="wc-t">kg</text>
  </svg>
  <div class="t-11 soft text-center">Semanas de embarazo</div>`;
}

function weightSection() {
  const p = store.stage.pregnancy || {};
  if (p.hideWeight) {
    return `<div class="card pad stack-10">${eyebrow('Mi peso')}<p class="t-13 soft">Has ocultado la gráfica de peso.</p>
      <button class="pill-outline self-start" data-action="weight-toggle">Mostrar la gráfica</button></div>`;
  }
  const needs = !(p.height > 0) || !(p.preWeight > 0);
  if (needs) {
    return `<div class="card pad stack-12">${eyebrow('Mi peso')}
      <p class="t-13 soft lh-4">Para ver tu evolución con una referencia orientativa, indica tu altura y tu peso antes del embarazo.</p>
      <div class="row gap-8">
        <label class="grow stack-4"><span class="t-12 soft">Altura (cm)</span><input type="number" inputmode="decimal" class="field" data-model="careForm.height" value="${attr(p.height || '')}" min="120" max="220"></label>
        <label class="grow stack-4"><span class="t-12 soft">Peso previo (kg)</span><input type="number" inputmode="decimal" class="field" data-model="careForm.preWeight" value="${attr(p.preWeight || '')}" min="35" max="200"></label>
      </div>
      <button class="outline-sage" data-action="weight-profile-save">Guardar</button>
      <button class="link-soft" data-action="weight-toggle">Prefiero no ver mi peso</button></div>`;
  }
  const due = dnFromISO(p.dueDate);
  const start = due - 280;
  const points = Object.entries(store.data.logs)
    .filter(([k, l]) => l.weight != null && dnFromISO(k) >= start && dnFromISO(k) <= Math.min(todayDN(), due + 14))
    .map(([k, l]) => ({ week: (dnFromISO(k) - start) / 7, gain: l.weight - p.preWeight }))
    .sort((a, b) => a.week - b.week);
  const b = bmi(p.height, p.preWeight);
  const range = gainRange(b, p.multiple);
  const last = points[points.length - 1];
  return `<div class="card pad stack-12">
    <div class="row between center">${eyebrow('Mi peso')}<button class="link-soft" data-action="weight-toggle">Ocultar</button></div>
    ${range
      ? `<p class="t-13 soft lh-4">Referencia de ganancia total: <b>${fmtKg(range.low)}–${fmtKg(range.high)} kg</b> para tu IMC previo de ${fmtNum(b, 1)}${p.multiple === 'multiple' ? ' y embarazo múltiple' : ''}.</p>`
      : '<p class="t-13 soft lh-4">Para tu situación no hay una referencia general: tu equipo te orientará.</p>'}
    ${weightChart(range, points)}
    <div class="row gap-14 wrap t-11 soft"><span class="legend"><i class="bg-goldsoft sq"></i>Orientación poblacional</span><span class="legend"><i class="dot-rose"></i>Tus registros</span></div>
    ${last ? `<div class="t-13">Última: <b>${last.gain >= 0 ? '+' : ''}${fmtNum(last.gain, 1)} kg</b> en la semana ${Math.floor(last.week)}</div>` : ''}
    <div class="row gap-8 center">
      <input type="number" inputmode="decimal" step="0.1" class="field grow" data-model="careForm.weight" placeholder="Peso de hoy (kg)" value="${attr(ui.careForm.weight)}">
      <button class="pill-outline" data-action="weight-log">Guardar</button>
    </div>
    <p class="t-11 soft-70 lh-3">La banda es una orientación poblacional, no un límite semanal. Tu evolución la valora tu equipo: no uses esta gráfica para hacer dieta.</p>
  </div>`;
}

function foodSection() {
  const toxo = store.stage.pregnancy?.toxo;
  const cats = ['Todos', ...FOOD_CATEGORIES];
  const items = FOODS.filter((f) => ui.foodCat === 'Todos' || f.cat === ui.foodCat).map((f) => foodFor(f, toxo));
  return `<div class="card pad stack-12">
    ${eyebrow('¿Puedo comer esto?')}
    <label class="search">${icon('search', 14, 'soft')}<input type="search" data-food-search placeholder="Salmón, queso, café…" value="${attr(ui.foodQuery)}" aria-label="Buscar alimento"></label>
    <div class="hscroll flat">${cats.map((c) => chip(c, ui.foodCat === c, 'food-cat', { v: c })).join('')}</div>
    ${toxo !== 'immune' && toxo !== 'not' ? `<div class="note-mist lh-3"><span class="c-gold">${icon('info', 14)}</span><span>Indica en Ajustes si eres inmune a la toxoplasmosis para personalizar esta lista.</span></div>` : ''}
    <div class="foods">${items.map((f) => `<div class="food" data-text="${attr((f.name + ' ' + (f.note || '') + ' ' + f.cat).toLowerCase())}">
      <div class="grow"><div class="t-14">${esc(f.name)}</div>${f.note ? `<div class="t-12 soft lh-3">${esc(f.note)}</div>` : ''}</div>
      <span class="food-tag tone-${FOOD_STATUS[f.status].tone}">${FOOD_STATUS[f.status].label}</span>
    </div>`).join('')}</div>
    <p class="food-empty t-13 soft" hidden>No lo encontramos. Pregúntalo en tu próxima visita o escríbenos.</p>
    <p class="t-11 soft-70 lh-3">Lo más importante: carne y pescado bien cocinados, lácteos pasteurizados, fruta y verdura bien lavadas y nada de alcohol. Adapta la lista a tus alergias y a las indicaciones de tu equipo.</p>
  </div>`;
}

function applyFoodFilter() {
  const q = ui.foodQuery.trim().toLowerCase();
  let any = false;
  root.querySelectorAll('.food').forEach((el) => { const hit = !q || el.dataset.text.includes(q); el.hidden = !hit; if (hit) any = true; });
  const empty = root.querySelector('.food-empty');
  if (empty) empty.hidden = any;
}


// MARK: - Peso del recién nacido (posparto)

const fmtBabyKg = (g) => `${fmtNum(g / 1000, 2)} kg`;
/** Acepta «3,25», «3.25», «3.250» (kg) o «3250» (g). Devuelve gramos o null */
function parseBabyWeight(str) {
  const v = parseFloat(String(str).trim().replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const g = v < 30 ? Math.round(v * 1000) : Math.round(v);
  return g >= 400 && g <= 15000 ? g : null;
}

function babyWeightChart(birthG, entries, birthDN) {
  const W = 320, H = 170, L = 40, R = 10, T = 12, B = 24;
  const pts = [{ day: 0, g: birthG }, ...entries.map((e) => ({ day: dnFromISO(e.date) - birthDN, g: e.g }))];
  const maxDay = Math.max(28, ...pts.map((p) => p.day));
  const gs = pts.map((p) => p.g);
  const minG = Math.min(...gs, birthG * 0.88), maxG = Math.max(...gs, birthG * 1.12);
  const x = (d) => L + (d / maxDay) * (W - L - R);
  const y = (g) => T + (1 - (g - minG) / (maxG - minG)) * (H - T - B);
  const ticks = [minG, birthG, maxG].map((g) => Math.round(g / 50) * 50);
  return `<svg class="wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del peso del bebé desde el nacimiento">
    ${ticks.map((g) => `<text x="${L - 6}" y="${y(g) + 3}" text-anchor="end" class="wc-t">${fmtNum(g / 1000, 2)}</text>`).join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(birthG)}" y2="${y(birthG)}" stroke="var(--sage)" stroke-dasharray="4 4"/>
    <line x1="${L}" x2="${W - R}" y1="${y(birthG * 0.9)}" y2="${y(birthG * 0.9)}" stroke="var(--line)"/>
    <text x="${W - R}" y="${y(birthG) - 4}" text-anchor="end" class="wc-t">peso al nacer</text>
    <text x="${W - R}" y="${y(birthG * 0.9) - 4}" text-anchor="end" class="wc-t">−10 %</text>
    ${[0, 7, 14, 21, 28].filter((d) => d <= maxDay).map((d) => `<text x="${x(d)}" y="${H - 8}" text-anchor="middle" class="wc-t">${d}</text>`).join('')}
    <polyline points="${pts.map((p) => `${x(p.day).toFixed(1)},${y(p.g).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--st-mid)" stroke-width="1.5"/>
    ${pts.map((p) => `<circle cx="${x(p.day).toFixed(1)}" cy="${y(p.g).toFixed(1)}" r="3.5" fill="var(--st-mid)"><title>Día ${p.day}: ${fmtBabyKg(p.g)}</title></circle>`).join('')}
  </svg>
  <div class="t-11 soft text-center">Peso en kg · días desde el nacimiento</div>`;
}

/** Mensaje orientativo según el último peso (pendiente de revisión clínica) */
function babyWeightNote(birthG, last, birthDN) {
  if (!last) return '';
  const day = dnFromISO(last.date) - birthDN;
  const pct = ((last.g - birthG) / birthG) * 100;
  if (pct <= -10) return `<div class="soft-note">Ha perdido un ${fmtNum(-pct, 0)} % de su peso al nacer. Una pérdida del 10 % o más conviene comentarla hoy con tu matrona o su pediatra.</div>`;
  if (pct < 0 && day >= 14) return `<div class="soft-note">A los ${day} días aún está un ${fmtNum(-pct, 0)} % por debajo de su peso al nacer: coméntalo con su pediatra.</div>`;
  if (pct < 0) return `<p class="t-12 soft lh-4">Está un ${fmtNum(-pct, 0)} % por debajo de su peso al nacer. Perder peso en los primeros días es normal (hasta un 7 % aproximadamente) y la mayoría lo recupera hacia los 10 a 14 días.</p>`;
  return `<p class="t-12 soft lh-4">${day <= 21 ? 'Ya ha recuperado su peso al nacer.' : 'Está por encima de su peso al nacer.'} Su pediatra valora su curva de crecimiento en cada revisión.</p>`;
}

function babyWeightSection() {
  const pp = store.stage.postpartum || {};
  const birthDN = dnFromISO(pp.birthDate);
  const baby = pp.baby || {};
  const f = ui.babyForm;
  if (!baby.birthWeight) {
    return `<div class="card pad stack-12">${eyebrow('Peso del bebé')}
      <p class="t-13 soft lh-4">Apunta su peso al nacer y los pesos que le tomen en las revisiones para ver cómo evoluciona.</p>
      <label class="stack-4"><span class="t-12 soft">Peso al nacer</span>
        <input class="field" inputmode="decimal" data-model="babyForm.birth" value="${attr(f.birth)}" placeholder="3,25 kg o 3250 g"></label>
      <button class="outline-sage" data-action="bw-birth">Guardar</button>
      <button class="link-soft" data-action="open-guide" data-section="rn">Dudas sobre su peso →</button>
    </div>`;
  }
  const entries = [...(baby.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
  const last = entries[entries.length - 1];
  const row = (e) => {
    const day = dnFromISO(e.date) - birthDN;
    const pct = ((e.g - baby.birthWeight) / baby.birthWeight) * 100;
    return `<div class="appt"><div class="appt-date"><b>${day}</b><span>${plural(day, 'día', 'días')}</span></div>
      <div class="grow"><div class="t-14 w-500">${fmtBabyKg(e.g)}</div><div class="t-12 soft">${esc(fmtDayMonthShort(dnFromISO(e.date)))} · ${pct >= 0 ? '+' : '−'}${fmtNum(Math.abs(pct), 1)} % respecto al nacimiento</div></div>
      <button class="icon-btn soft" data-action="bw-delete" data-id="${attr(e.id)}" aria-label="Eliminar este peso">${icon('x', 12)}</button></div>`;
  };
  return `<div class="card pad stack-12">
    <div class="row between center">${eyebrow('Peso del bebé')}<button class="link-soft" data-action="bw-edit-birth">Cambiar peso al nacer</button></div>
    <div class="row gap-12">
      <div class="grow"><div class="serif-28">${fmtBabyKg(baby.birthWeight)}</div><div class="t-11 soft">Al nacer</div></div>
      ${last ? `<div class="grow"><div class="serif-28">${fmtBabyKg(last.g)}</div><div class="t-11 soft">Último · día ${dnFromISO(last.date) - birthDN}</div></div>` : ''}
    </div>
    ${entries.length ? babyWeightChart(baby.birthWeight, entries, birthDN) : ''}
    ${babyWeightNote(baby.birthWeight, last, birthDN)}
    ${entries.length ? `<div>${[...entries].reverse().map(row).join('')}</div>` : ''}
    <div class="stack-8">
      <div class="t-13 w-500">Añadir un peso</div>
      <div class="row gap-8">
        <input type="date" class="field date grow" data-model="babyForm.date" value="${attr(f.date || todayISO())}" min="${attr(pp.birthDate || '')}" max="${todayISO()}" aria-label="Fecha">
        <input class="field baby-w" inputmode="decimal" data-model="babyForm.weight" value="${attr(f.weight)}" placeholder="kg o g" aria-label="Peso">
      </div>
      <button class="outline-sage" data-action="bw-add">${icon('plusCircle', 14)} Guardar peso</button>
    </div>
    <p class="t-11 soft-70 lh-3">Mejor los pesos de las revisiones que los de casa: las básculas domésticas no son precisas. Es una orientación, no sustituye la valoración de su pediatra.</p>
    <button class="link-soft" data-action="open-guide" data-section="rn">Dudas sobre su peso →</button>
    ${askLink('', '¿Te preocupa su peso?', 'Peso del bebé')}
  </div>`;
}

function careView() {
  const seg = (v, label) => `<button class="seg ${ui.careSection === v ? 'on' : ''}" aria-pressed="${ui.careSection === v}" data-action="care-section" data-v="${v}">${label}</button>`;
  if (store.mode === 'postpartum') {
    const sec = ui.careSection === 'baby' ? 'baby' : 'agenda';
    return `<div class="stack-18">
      <div class="segs wide">${seg('agenda', 'Agenda')}${seg('baby', 'Peso del bebé')}</div>
      ${sec === 'baby' ? babyWeightSection() : agendaSection()}
    </div>`;
  }
  const section = { agenda: agendaSection, weight: weightSection, food: foodSection }[ui.careSection === 'baby' ? 'agenda' : ui.careSection]();
  return `<div class="stack-18">
    <div class="segs wide">${seg('agenda', 'Agenda')}${seg('weight', 'Peso')}${seg('food', 'Alimentación')}</div>
    ${section}
  </div>`;
}

const TABS = [
  { icon: 'sun', label: 'HOY' },
  { icon: 'dotted', label: 'CICLO' },
  { icon: 'chart', label: 'PATRONES' },
];
const STAGE_TAB = {
  today: { icon: 'sun', label: 'HOY' },
  baby: { icon: 'sprout', label: 'BEBÉ' },
  diary: { icon: 'pencil', label: 'DIARIO' },
  care: { icon: 'heart', label: 'CUIDADOS' },
  guide: { icon: 'helpCircle', label: 'DUDAS' },
};
const STAGE_TAB_IDS = { pregnancy: ['today', 'diary', 'care', 'guide'], postpartum: ['today', 'diary', 'care', 'guide'] };
const tabIndex = (id) => Math.max(0, (STAGE_TAB_IDS[store.mode] || []).indexOf(id));

function mainView() {
  const mode = store.mode;
  let tabs, view;
  if (mode === 'cycle') {
    tabs = TABS;
    ui.tab = Math.min(ui.tab, 2);
    view = [todayView, cycleView, trendsView][ui.tab]();
  } else {
    const ids = STAGE_TAB_IDS[mode];
    ui.tab = Math.min(ui.tab, ids.length - 1);
    tabs = ids.map((id) => STAGE_TAB[id]);
    const fns = { today: mode === 'pregnancy' ? pregnancyToday : postpartumToday, baby: babyView, diary: stageDiary, care: careView, guide: guideView };
    view = fns[ids[ui.tab]]();
  }
  return `<div class="shell">
    <header class="app-header">
      <div><h1 class="brand"><img src="brand/hera-logo-compact.svg" alt="Hera" width="113" height="34"></h1><div class="brand-tag">${MODE_TAG[mode]}</div></div>
      <div class="row gap-8 center">
        ${syncPill()}
        <button class="ask-pill" data-action="open-ask" data-ctx="" aria-label="Pregunta a tu ginecólogo, a tu matrona o a tu pediatra" title="Pregunta a tu equipo">${consultPair('sm')}<span class="ask-label">Pregúntanos</span></button>
        <button class="gear" data-action="open-settings" aria-label="Ajustes">${icon('gear', 16)}</button>
      </div>
    </header>
    ${reminderBanner()}
    ${mode === 'cycle' ? irregularNudge() : ''}
    <main class="content">${view}</main>
    <footer class="foot"><a href="${CONTACT_HREF}">Contacto</a> · <a href="../support.html">Soporte</a> · <a href="../privacy.html">Privacidad</a></footer>
  </div>
  <nav class="tabbar ${tabs.length > 3 ? 'many' : ''}" aria-label="Secciones">
    ${tabs.map((t, i) => `<button class="tab ${ui.tab === i ? 'on' : ''}" data-action="tab" data-i="${i}" aria-current="${ui.tab === i ? 'page' : 'false'}">${icon(t.icon, 20)}<span>${t.label}</span></button>`).join('')}
  </nav>
  ${ui.sheet === 'calendar' ? calendarSheet() : ''}
  ${ui.sheet === 'settings' ? settingsSheet() : ''}
  ${ui.sheet === 'push' ? pushSheet() : ''}
  ${ui.sheet === 'urgent' ? urgentSheet() : ''}
  ${ui.sheet === 'ask' ? askSheet() : ''}
  ${ui.syncChoice ? syncChoiceDialog() : ''}`;
}

const root = document.getElementById('app');
let lastScreen = null;

function render() {
  const screen = store.needsOnboarding ? 'ob' : 'main';
  // Color de la etapa (ciclo rosa · embarazo verde · crianza azul)
  const stageNow = store.needsOnboarding ? (ui.ob.stageChosen ? ui.ob.flow : 'pregnancy') : store.mode;
  document.body.dataset.stage = stageNow;
  const tc = document.querySelector('meta[name=theme-color]');
  if (tc) tc.content = { cycle: '#8E4B42', pregnancy: '#3F584B', postpartum: '#3F5F78' }[stageNow] || '#3F584B';
  // Conserva el scroll interno del sheet al re-renderizar
  const sheetBody = root.querySelector('.sheet-body');
  const sheetScroll = sheetBody ? sheetBody.scrollTop : 0;
  root.innerHTML = screen === 'ob' ? onboardingView() : mainView();
  ui.sheetAnim = false;
  const nb = root.querySelector('.sheet-body');
  if (nb) nb.scrollTop = sheetScroll;
  document.body.classList.toggle('sheet-open', !!ui.sheet && screen === 'main');
  if (root.querySelector('[data-action=sync-connect], [data-action=sync-reauth]')) loadGis().catch(() => {});
  if (screen !== lastScreen) { window.scrollTo(0, 0); lastScreen = screen; }
  if (ui.guideQuery) applyGuideFilter();
  if (ui.foodQuery) applyFoodFilter();
  const fs = root.querySelector('[data-fetus-week]');
  if (fs) mountFetus(fs, +fs.dataset.fetusWeek);
  root.querySelector('.bw-chip.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// Recuerda qué preguntas de la guía están abiertas entre renders
root.addEventListener('toggle', (e) => {
  const id = e.target?.dataset?.id;
  if (!id) return;
  if (e.target.open) ui.openDetails.add(id); else ui.openDetails.delete(id);
}, true);

store.subscribe(render);

// =========================================================================
// MARK: - Acciones
// =========================================================================

function toggleIn(arr, v) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1); else arr.push(v);
}

function openSettings() {
  ui.draft = structuredClone(store.data.settings);
  // En ciclo irregular la lista debe incluir la regla actual (si no, al guardar se perdería)
  if (!ui.draft.isRegular && !ui.draft.pastPeriods.includes(ui.draft.lastPeriod)) {
    ui.draft.pastPeriods = [...ui.draft.pastPeriods, ui.draft.lastPeriod].sort();
  }
  const st = store.stage;
  ui.draftStage = {
    mode: st.mode,
    pregnancy: { dueDate: '', multiple: null, rh: null, toxo: null, ...(st.pregnancy || {}) },
    postpartum: { birthDate: '', feeding: null, ...(st.mode === 'postpartum' ? st.postpartum : {}) },
  };
  ui.draftLmp = '';
  ui.dueMode = st.pregnancy?.dueDate ? 'due' : 'lmp';
  ui.settingsBaseline = settingsSnapshot();
  ui.sheetAnim = true;
  ui.draftPicker = todayISO();
  ui.sheet = 'settings';
  render();
}

const actions = {
  tab: (el) => { ui.tab = +el.dataset.i; ui.sheet = null; render(); window.scrollTo(0, 0); },
  'open-settings': openSettings,
  'close-sheet': () => {
    if (settingsDirty() && !confirm('Tienes cambios sin guardar. ¿Salir sin guardarlos?')) return;
    ui.sheet = null; render();
  },
  'take-med': (el) => store.updateLog(todayISO(), (l) => { if (!l.meds.includes(el.dataset.id)) l.meds.push(el.dataset.id); }),

  // Ciclo — tira semanal y calendario
  'select-day': (el) => { ui.selectedDate = el.dataset.date; render(); },
  'week-prev': () => { ui.weekOffset -= 1; render(); },
  'week-next': () => { if (ui.weekOffset < 0) { ui.weekOffset += 1; render(); } },
  'open-calendar': () => { ui.calMonth = firstOfMonth(dnFromISO(ui.selectedDate)); ui.sheet = 'calendar'; ui.sheetAnim = true; render(); },
  'cal-prev': () => { ui.calMonth = addMonths(ui.calMonth, -1); render(); },
  'cal-next': () => { ui.calMonth = addMonths(ui.calMonth, 1); render(); },
  'cal-pick': (el) => {
    ui.selectedDate = el.dataset.date;
    // Lleva la tira semanal a la semana del día elegido
    const t = todayDN();
    const sel = dnFromISO(ui.selectedDate);
    ui.weekOffset = Math.floor(((sel - mondayIndex(sel)) - (t - mondayIndex(t))) / 7);
    ui.sheet = null;
    render();
  },

  // Ciclo — diario
  'set-mood': (el) => store.updateLog(ui.selectedDate, (l) => { l.mood = l.mood === el.dataset.v ? null : el.dataset.v; }),
  'toggle-symptom': (el) => store.updateLog(ui.selectedDate, (l) => {
    const s = el.dataset.s;
    if (l.symptoms.includes(s)) {
      l.symptoms = l.symptoms.filter((x) => x !== s);
      if (!l.symptoms.some((x) => BLEEDING_SYMPTOMS.has(x))) l.flow = null;
    } else l.symptoms.push(s);
  }),
  'set-flow': (el) => store.updateLog(ui.selectedDate, (l) => { l.flow = l.flow === el.dataset.v ? null : el.dataset.v; }),
  'toggle-more': () => { ui.showMoreSymptoms = !ui.showMoreSymptoms; render(); },
  'toggle-intimacy': (el) => store.updateLog(ui.selectedDate, (l) => toggleIn(l.intimacy, el.dataset.v)),
  'set-lh': (el) => {
    const v = el.dataset.v;
    const lhDefault = store.lhTestForCurrentCycle;
    store.updateLog(ui.selectedDate, (l) => { l.lhTest = (l.lhTest === v && lhDefault !== v) ? null : v; });
  },
  'set-stress': (el) => store.updateLog(ui.selectedDate, (l) => { l.stressLevel = l.stressLevel === el.dataset.v ? null : el.dataset.v; }),
  'set-mucus': (el) => store.updateLog(ui.selectedDate, (l) => { l.cervicalMucus = l.cervicalMucus === el.dataset.v ? null : el.dataset.v; }),
  'num-step': (el) => {
    const key = el.dataset.key;
    const cur = store.log(ui.selectedDate)[key];
    // Primer toque con el campo vacío: rellena con la sugerencia
    const next = cur == null ? numDefault(key) : cur + Number(el.dataset.dir) * NUM_FIELDS[key].step;
    store.updateLog(ui.selectedDate, (l) => { l[key] = roundField(key, next); });
  },
  'clear-field': (el) => store.updateLog(ui.selectedDate, (l) => { l[el.dataset.field] = null; }),

  // Medicación
  'toggle-med-form': () => { ui.showMedForm = !ui.showMedForm; render(); },
  'save-med': () => {
    const name = ui.newMed.name.trim();
    if (!name) { root.querySelector('[data-model="newMed.name"]')?.focus(); return; }
    ui.showMedForm = false;
    store.addMed({ name, dose: ui.newMed.dose.trim(), hour: ui.newMed.hour || '09:00' });
    ui.newMed = { name: '', dose: '', hour: '09:00' };
  },
  'toggle-med': (el) => store.updateLog(ui.selectedDate, (l) => toggleIn(l.meds, el.dataset.id)),
  'delete-med': (el) => store.removeMed(el.dataset.id),
  'enable-notifs': async () => {
    try { await Notification.requestPermission(); } catch { /* navegador sin soporte */ }
    render();
  },

  // Ajustes
  'draft-type': (el) => {
    ui.draft.isRegular = el.dataset.v === 'regular';
    if (!ui.draft.isRegular && !ui.draft.pastPeriods.includes(ui.draft.lastPeriod)) {
      ui.draft.pastPeriods = [...ui.draft.pastPeriods, ui.draft.lastPeriod].sort();
    }
    render();
  },
  'draft-add': () => {
    const d = ui.draftPicker;
    if (dnFromISO(d) != null && d <= todayISO() && !ui.draft.pastPeriods.includes(d)) {
      ui.draft.pastPeriods.push(d);
      if (ui.draft.pastPeriods.length >= 2) ui.draft.cycleLen = averageCycleLength(ui.draft.pastPeriods);
    }
    render();
  },
  'draft-remove': (el) => {
    ui.draft.pastPeriods = ui.draft.pastPeriods.filter((d) => d !== el.dataset.date);
    if (ui.draft.pastPeriods.length >= 2) ui.draft.cycleLen = averageCycleLength(ui.draft.pastPeriods);
    render();
  },
  'save-settings': () => {
    const prevMode = store.mode;
    if (stageUI() && ui.draftStage) {
      const { stage, error } = buildStage();
      if (error) { alert(error); return; }
      if (JSON.stringify(stage) !== JSON.stringify(store.stage)) {
        if (stage.mode !== prevMode) ui.tab = 0;
        store.updateStage(stage);
      }
      if (stage.mode !== 'cycle') { ui.sheet = null; render(); return; }
    }
    const s = ui.draft;
    const final = s.isRegular ? { ...s } : settingsFromIrregularPeriods(s.pastPeriods, s.periodLen);
    ui.sheet = null;
    store.updateSettings(final);
  },
  'draft-stage': (el) => { ui.draftStage.mode = el.dataset.v; render(); },
  'draft-stage-field': (el) => {
    const target = ui.draftStage.mode === 'postpartum' ? ui.draftStage.postpartum : ui.draftStage.pregnancy;
    target[el.dataset.f] = target[el.dataset.f] === el.dataset.v ? null : el.dataset.v;
    render();
  },
  'draft-due-from-lmp': () => {
    const lmp = dnFromISO(ui.draftLmp);
    if (lmp == null || lmp > todayDN()) { alert('Indica el primer día de tu última regla.'); return; }
    ui.draftStage.pregnancy.dueDate = isoFromDN(dueFromLmp(lmp));
    render();
  },
  'stage-back-cycle': () => { openSettings(); ui.draftStage.mode = 'cycle'; render(); },
  'due-mode': (el) => {
    if (el.dataset.ctx === 'ob') ui.ob.dueMode = el.dataset.v; else ui.dueMode = el.dataset.v;
    render();
  },
  'baby-week': (el) => { ui.babyWeek = +el.dataset.w; render(); },
  'pp-baby-week': (el) => { ui.ppBabyWeek = +el.dataset.w; render(); },
  'hoy-view': (el) => { ui.hoyView = el.dataset.v; render(); window.scrollTo(0, 0); },
  'baby-media': (el) => { ui.babyMedia = el.dataset.v; render(); },
  'care-section': (el) => { ui.careSection = el.dataset.v; render(); },
  'open-care': (el) => { ui.tab = tabIndex('care'); ui.careSection = el.dataset.v || 'agenda'; render(); window.scrollTo(0, 0); },
  'food-cat': (el) => { ui.foodCat = el.dataset.v; render(); },
  'appt-add': () => {
    const { title, date, time } = ui.newAppt;
    if (!title.trim()) { root.querySelector('[data-model="newAppt.title"]')?.focus(); return; }
    if (dnFromISO(date) == null) { alert('Indica la fecha de la cita.'); return; }
    const id = crypto.randomUUID ? crypto.randomUUID() : `a${Date.now()}`;
    const appointments = [...(store.stage.appointments || []), { id, title: title.trim().slice(0, 80), date, time: time || null }];
    ui.newAppt = { title: '', date: '', time: '' };
    store.updateStage({ ...store.stage, appointments });
  },
  'appt-delete': (el) => {
    if (!confirm('¿Eliminar esta cita de tu agenda?')) return;
    store.updateStage({ ...store.stage, appointments: (store.stage.appointments || []).filter((a) => a.id !== el.dataset.id) });
  },
  'appt-ics': (el) => {
    const appt = (store.stage.appointments || []).find((a) => a.id === el.dataset.id);
    if (!appt) return;
    const blob = new Blob([appointmentICS(appt)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vera-cita-${appt.date}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'weight-toggle': () => {
    const p = store.stage.pregnancy || {};
    store.updateStage({ ...store.stage, pregnancy: { ...p, hideWeight: !p.hideWeight } });
  },
  'weight-profile-save': () => {
    const p0 = store.stage.pregnancy || {};
    const h = parseFloat(String(ui.careForm.height || p0.height || '').replace(',', '.'));
    const w = parseFloat(String(ui.careForm.preWeight || p0.preWeight || '').replace(',', '.'));
    if (!(h >= 120 && h <= 220) || !(w >= 35 && w <= 200)) { alert('Revisa la altura (en cm) y el peso (en kg).'); return; }
    store.updateStage({ ...store.stage, pregnancy: { ...store.stage.pregnancy, height: h, preWeight: w } });
  },
  'weight-log': () => {
    const w = parseFloat(String(ui.careForm.weight).replace(',', '.'));
    if (!(w >= 35 && w <= 200)) { alert('Indica tu peso en kg.'); return; }
    ui.careForm.weight = '';
    store.updateLog(todayISO(), (l) => { l.weight = Math.round(w * 10) / 10; });
  },
  'open-ask': (el) => {
    const ctx = el.dataset.ctx || '';
    if (ui.ask.sent || ui.ask.result?.ok || ui.ask.context !== ctx) ui.ask = { ...ui.ask, context: ctx, include: true, text: ui.ask.sent || ui.ask.result?.ok ? '' : ui.ask.text, sent: null, to: null, manual: false, status: null, result: ui.ask.result?.limit ? ui.ask.result : null };
    if (!ui.ask.manual) ui.ask.to = suggestContact({ text: ui.ask.text, context: ui.ask.context, mode: store.mode }).to;
    ui.sheet = 'ask'; ui.sheetAnim = true; render();
    setTimeout(() => root.querySelector('.ask-text')?.focus(), 300);
  },
  'ask-clear-ctx': () => { ui.ask.context = ''; render(); },
  'ask-reset': () => { ui.ask = { ...ui.ask, context: '', include: true, text: '', sent: null, to: null, manual: false, status: null, result: ui.ask.result?.limit ? ui.ask.result : null, notify: null }; render(); },
  'ask-pick': (el) => { ui.ask.to = el.dataset.v; ui.ask.manual = true; render(); },
  'ask-submit': async () => {
    const a = ui.ask;
    const to = CONSULTS[a.to];
    if (!to || a.status === 'sending') return;
    if (!a.text.trim() || a.text.trim().length < 5) { root.querySelector('.ask-text')?.focus(); return; }
    if (!isEmail(a.email)) { a.status = 'error'; a.error = 'Escribe tu correo para que te puedan responder.'; render(); root.querySelector('[data-model="ask.email"]')?.focus(); return; }
    a.status = 'sending'; a.error = ''; render();
    try { localStorage.setItem('hera-ask-email', a.email.trim()); } catch { /* sin almacenamiento */ }
    try {
      const meta = [];
      if (a.include) meta.push(...consultDetails());
      const res = await fetch(`${CONSULT_API}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: a.email.trim(), to: to.key, text: a.text.trim(), context: a.context, situation: meta.join('\n'), website: a.website || '' }) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error('Has enviado varias consultas seguidas. Espera unos minutos y vuelve a intentarlo.');
      if (j.error === 'bad_email') throw new Error('Revisa tu correo: parece que no es válido.');
      if (!res.ok && !j.limit) throw new Error('No se ha podido enviar. Inténtalo de nuevo en un rato.');
      a.status = null; a.result = j; a.sentTo = to.key;
      if (j.ok) a.text = '';
    } catch (e) { a.status = 'error'; a.error = e.message; }
    render();
  },
  'ask-notify-open': () => { ui.ask.notify = { open: true, consent: false }; render(); },
  'ask-notify-send': async () => {
    const n = ui.ask.notify || (ui.ask.notify = {});
    if (!n.consent) { n.error = 'Marca la casilla para que podamos guardar tu correo.'; render(); return; }
    n.busy = true; n.error = ''; render();
    try {
      const res = await fetch(`${CONSULT_API}/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ui.ask.email.trim(), consent: true }) });
      if (!res.ok) throw new Error();
      n.done = true;
    } catch { n.error = 'No se ha podido guardar. Inténtalo de nuevo.'; }
    n.busy = false; render();
  },
  'ask-send': (el) => {
    const to = CONSULTS[ui.ask.to];
    if (!to) return;
    if (!ui.ask.text.trim()) { root.querySelector('.ask-text')?.focus(); return; }
    const body = consultMessage();
    const subject = `Pregunta para ${to.name} · Hera${ui.ask.context ? ` · ${ui.ask.context}` : ''}`;
    if (el.dataset.v === 'whatsapp' && to.whatsapp) {
      window.open(`https://wa.me/${to.whatsapp}?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
      ui.ask.sent = 'whatsapp';
    } else {
      window.location.href = `mailto:${to.email || CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      ui.ask.sent = 'email';
    }
    ui.ask.sentTo = to.key;
    render();
  },
  'bw-birth': () => {
    const g = parseBabyWeight(ui.babyForm.birth);
    if (!g) { alert('Indica el peso al nacer, por ejemplo 3,25 kg o 3250 g.'); return; }
    const pp = store.stage.postpartum || {};
    ui.babyForm.birth = '';
    store.updateStage({ ...store.stage, postpartum: { ...pp, baby: { ...(pp.baby || {}), birthWeight: g, weights: pp.baby?.weights || [] } } });
  },
  'bw-edit-birth': () => {
    const pp = store.stage.postpartum || {};
    const v = prompt('Peso al nacer (kg o g)', pp.baby?.birthWeight ? fmtNum(pp.baby.birthWeight / 1000, 2) : '');
    if (v == null) return;
    const g = parseBabyWeight(v);
    if (!g) { alert('Peso no válido. Ejemplo: 3,25 kg o 3250 g.'); return; }
    store.updateStage({ ...store.stage, postpartum: { ...pp, baby: { ...(pp.baby || {}), birthWeight: g } } });
  },
  'bw-add': () => {
    const pp = store.stage.postpartum || {};
    const g = parseBabyWeight(ui.babyForm.weight);
    const date = ui.babyForm.date || todayISO();
    if (!g) { alert('Indica el peso, por ejemplo 3,40 kg o 3400 g.'); return; }
    if (dnFromISO(date) == null || date > todayISO() || (pp.birthDate && date < pp.birthDate)) { alert('Revisa la fecha.'); return; }
    const id = crypto.randomUUID ? crypto.randomUUID() : `w${Date.now()}`;
    const weights = [...(pp.baby?.weights || []).filter((w) => w.date !== date), { id, date, g }];
    ui.babyForm = { ...ui.babyForm, weight: '', date: '' };
    store.updateStage({ ...store.stage, postpartum: { ...pp, baby: { ...(pp.baby || {}), weights } } });
  },
  'bw-delete': (el) => {
    if (!confirm('¿Eliminar este peso?')) return;
    const pp = store.stage.postpartum || {};
    const weights = (pp.baby?.weights || []).filter((w) => w.id !== el.dataset.id);
    store.updateStage({ ...store.stage, postpartum: { ...pp, baby: { ...(pp.baby || {}), weights } } });
  },
  'todo-toggle': (el) => {
    const p = store.stage.pregnancy || {};
    const key = el.dataset.key;
    const done = { ...(p.done || {}) };
    if (done[key]) delete done[key]; else done[key] = true;
    store.updateStage({ ...store.stage, pregnancy: { ...p, done } });
  },
  'todo-all-past': () => {
    const p = store.stage.pregnancy || {};
    const g = gestation(p);
    if (!g) return;
    const done = { ...(p.done || {}) };
    for (const t of pastItems(g.weeks, p.rh)) done[todoKey(t)] = true;
    store.updateStage({ ...store.stage, pregnancy: { ...p, done } });
  },
  'open-urgent': () => { ui.sheet = 'urgent'; ui.sheetAnim = true; render(); },
  'open-guide': (el) => {
    ui.sheet = null;
    ui.tab = tabIndex('guide');
    ui.guideQuery = '';
    const sec = el.dataset.section;
    const q = el.dataset.q;
    const all = [...PREGNANCY_GUIDE, ...POSTPARTUM_GUIDE];
    const section = all.find((x) => x.id === sec);
    const idx = q && section ? section.items.findIndex((it) => it.q === q) : -1;
    if (idx >= 0) ui.openDetails.add(`${sec}-${idx}`);
    render();
    const target = root.querySelector(idx >= 0 ? `[data-id="${sec}-${idx}"]` : `[data-sec="${sec}"]`);
    (target || root).scrollIntoView({ block: 'start' });
    window.scrollBy(0, -12);
  },
  'set-movement': (el) => store.updateLog(ui.selectedDate, (l) => { l.babyMovement = l.babyMovement === el.dataset.v ? null : el.dataset.v; }),
  export: () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vera-copia-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  reset: () => {
    const extra = sync.enabled ? '\n\nTu copia en Google Drive no se borra: para eso usa «Borrar mis datos de Google Drive». Este dispositivo dejará de sincronizar.' : '';
    if (!confirm(`¿Borrar todos tus datos de Hera en este navegador? Esta acción no se puede deshacer.${extra}`)) return;
    ui.sheet = null; ui.ob = initialOnboarding(); ui.tab = 0;
    if (sync.enabled) disconnect();
    store.resetAll();
  },

  // Sincronización con Google Drive
  'sync-connect': async () => {
    const ok = await connect(() => new Promise((resolve) => { ui.syncChoice = resolve; render(); }));
    if (ok) ui.tab = 0;
    render();
  },
  'sync-choice': (el) => {
    const resolve = ui.syncChoice;
    ui.syncChoice = null;
    render();
    resolve?.(el.dataset.v || null);
  },
  'open-push': () => {
    if (settingsDirty() && !confirm('Tienes cambios sin guardar. ¿Salir sin guardarlos?')) return;
    ui.pushMsg = ''; ui.sheet = 'push'; ui.sheetAnim = true; render();
  },
  'open-contractions': () => { ui.tab = tabIndex('diary'); ui.selectedDate = todayISO(); render(); window.scrollTo(0, 0); },
  'ct-toggle': () => {
    const list = ctList();
    const active = list.find((c) => c.e == null);
    if (active) active.e = Math.max(Date.now(), active.s + 1000);
    else list.push({ s: Date.now(), e: null });
    ctSave(list);
  },
  'ct-del': (el) => ctSave(ctList().filter((c) => String(c.s) !== el.dataset.s)),
  'ct-clear': () => { if (confirm('¿Borrar todo el registro de contracciones?')) ctSave([]); },
  'push-dismiss': () => { try { localStorage.setItem(PUSH_DISMISS, '1'); } catch { /* */ } render(); },
  'push-enable': async () => {
    ui.pushBusy = true; ui.pushMsg = 'Activando…'; render();
    try { await enablePush(pushTarget()); ui.pushMsg = 'Aviso semanal activado.'; }
    catch (e) { ui.pushMsg = Notification.permission === 'denied' ? '' : 'No se ha podido activar. Inténtalo de nuevo en un rato.'; }
    ui.pushBusy = false; ui.pushState = await pushState(); if (ui.pushState === 'denied') ui.pushMsg = ''; render();
  },
  'push-test': async () => {
    ui.pushBusy = true; ui.pushMsg = 'Enviando…'; render();
    try { ui.pushMsg = (await testPush()) ? 'Enviado: debería llegarte en unos segundos.' : 'No se ha podido enviar. Prueba a desactivar y activar el aviso.'; }
    catch (e) { ui.pushMsg = e.message === 'too soon' ? 'Espera un minuto antes de pedir otro aviso de prueba.' : 'No se ha podido enviar.'; }
    ui.pushBusy = false; render();
  },
  'push-disable': async () => {
    ui.pushBusy = true; render();
    await disablePush();
    ui.pushMsg = ''; ui.pushBusy = false; ui.pushState = await pushState(); render();
  },
  'sync-now': () => syncNow(),
  'sync-reauth': () => reauthorize(),
  'sync-disconnect': () => {
    if (!confirm('¿Dejar de sincronizar este dispositivo? Tus datos seguirán en este navegador y en tu Google Drive.')) return;
    disconnect();
  },
  'sync-delete': async () => {
    if (!confirm('¿Borrar tu copia de Hera de Google Drive? Los datos de este navegador se mantienen. Esta acción no se puede deshacer.')) return;
    try { await deleteRemote(); alert('Tu copia en Google Drive se ha borrado.'); } catch (err) { alert(`No se pudo borrar: ${err.message}`); }
  },

  // Onboarding
  'ob-next': () => { ui.ob.step += 1; render(); },
  'ob-back': () => {
    const ob = ui.ob;
    if (ob.step === 1 && ob.stageChosen && stageUI()) { ob.stageChosen = false; ob.flow = 'cycle'; render(); return; }
    if (ob.step === 4 && ob.profileSubStep > 0) ob.profileSubStep -= 1;
    else { ob.profileSubStep = 0; ob.step -= 1; }
    render();
  },
  'ob-regular': (el) => { ui.ob.isRegular = el.dataset.v === 'regular'; render(); },
  'ob-pick-last': (el) => { ui.ob.lastPeriod = el.dataset.date; render(); },
  'ob-month-prev': () => { ui.ob.month = addMonths(ui.ob.month, -1); render(); },
  'ob-month-next': () => { ui.ob.month = addMonths(ui.ob.month, 1); render(); },
  'ob-add': () => {
    const d = ui.ob.pickerDate;
    if (dnFromISO(d) != null && d <= todayISO() && !ui.ob.pastPeriods.includes(d)) ui.ob.pastPeriods.push(d);
    render();
  },
  'ob-remove': (el) => { ui.ob.pastPeriods = ui.ob.pastPeriods.filter((d) => d !== el.dataset.date); render(); },
  'ob-sub': (el) => { ui.ob.profileSubStep = +el.dataset.v; render(); },
  'ob-condition': (el) => { ui.ob.hormonalCondition = el.dataset.v; render(); },
  'ob-finish': () => {
    const ob = ui.ob;
    const settings = ob.isRegular
      ? { lastPeriod: ob.lastPeriod, cycleLen: ob.cycleLen, periodLen: ob.periodLen, isRegular: true, pastPeriods: [] }
      : settingsFromIrregularPeriods(ob.pastPeriods, ob.periodLen);
    const profile = {
      birthDate: dnFromISO(ob.birthDate) != null ? ob.birthDate : null,
      weightKg: ob.weightKg,
      hormonalCondition: ob.hormonalCondition === 'Ninguna' ? null : ob.hormonalCondition,
    };
    ui.tab = 0;
    store.completeOnboarding(settings, profile);
  },
  'ob-stage': (el) => { ui.ob.flow = el.dataset.v; ui.ob.stageChosen = true; render(); },
  'ob-finish-stage': () => {
    const ob = ui.ob;
    const today = todayDN();
    const settings = { lastPeriod: isoFromDN(today - 9), cycleLen: 28, periodLen: 5, isRegular: true, pastPeriods: [] };
    let stage;
    if (ob.flow === 'pregnancy') {
      const useLmp = (ob.dueMode || 'lmp') === 'lmp';
      const lmp = useLmp ? dnFromISO(ob.lmp) : null;
      let due = useLmp ? null : dnFromISO(ob.dueDate);
      if (lmp != null && lmp <= today) due = dueFromLmp(lmp);
      if (due == null || due < today - 100 || due > today + 300) { alert('Indica tu fecha probable de parto o el primer día de tu última regla.'); return; }
      if (lmp != null && lmp <= today) settings.lastPeriod = ob.lmp;
      stage = { mode: 'pregnancy', pregnancy: { dueDate: isoFromDN(due), multiple: null, rh: null, toxo: null }, postpartum: null, history: [] };
    } else {
      const birth = dnFromISO(ob.birthDate2);
      if (birth == null || birth > today) { alert('Indica la fecha del parto.'); return; }
      stage = { mode: 'postpartum', pregnancy: null, postpartum: { birthDate: ob.birthDate2, feeding: null }, history: [{ from: isoFromDN(birth - 280), to: ob.birthDate2 }] };
    }
    ui.tab = 0;
    store.completeOnboarding(settings, {}, stage);
  },
  'ob-demo': () => { ui.tab = 0; store.loadDemoData(); },
};

// Clicks
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});

// Teclado: Escape cierra el sheet; Enter/Espacio en el label de importar
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('.num-input')) { e.preventDefault(); e.target.blur(); return; }
  if (e.key === 'Escape' && ui.sheet) actions['close-sheet']();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('label.pill-outline')) {
    e.preventDefault(); e.target.querySelector('input')?.click();
  }
});

// Campos de texto / fecha / hora ligados al estado (sin re-render mientras se escribe)
function setModel(path, value) {
  const [head, key] = path.split('.');
  if (head === 'newMed') ui.newMed[key] = value;
  else if (head === 'draft') ui.draft[key] = value;
  else if (head === 'draftPicker') ui.draftPicker = value;
  else if (head === 'ob') ui.ob[key] = value;
  else if (head === 'draftLmp') ui.draftLmp = value;
  else if (head === 'newAppt') ui.newAppt[key] = value;
  else if (head === 'careForm') ui.careForm[key] = value;
  else if (head === 'ask') ui.ask[key] = value;
  else if (head === 'babyForm') ui.babyForm[key] = value;
  else if (head === 'draftStage') {
    if (key === 'dueDate') ui.draftStage.pregnancy.dueDate = value;
    else if (key === 'height' || key === 'preWeight') ui.draftStage.pregnancy[key] = value === '' ? null : parseFloat(value.replace(',', '.'));
    else if (key === 'lmp') {
      ui.draftLmp = value;
      const lmp = dnFromISO(value);
      if (lmp != null && lmp <= todayDN()) ui.draftStage.pregnancy.dueDate = isoFromDN(dueFromLmp(lmp));
    }
    else if (key === 'birthDate') ui.draftStage.postpartum.birthDate = value;
  }
}
root.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.model) { setModel(el.dataset.model, el.value); if (el.dataset.model === 'ask.text') refreshAskSuggestion(); return; }
  if (el.matches('[data-guide-search]')) { ui.guideQuery = el.value; applyGuideFilter(); return; }
  if (el.matches('[data-food-search]')) { ui.foodQuery = el.value; applyFoodFilter(); return; }
  if (el.dataset.range) {
    // Actualiza solo el valor mostrado mientras se arrastra
    const key = el.dataset.range;
    const v = parseFloat(el.value);
    el.style.setProperty('--p', rangePct(v, +el.min, +el.max));
    const fmtOut = {
      basalTemp: (x) => `${fmtNum(x, 1)} °C`,
      sleepHours: (x) => `${fmtNum(x, 1)} h`,
      weight: (x) => `${Math.trunc(x)} kg`,
    }[key] || ((x) => String(x));
    root.querySelectorAll(`[data-out="${key}"]`).forEach((o) => { o.textContent = fmtOut(v); });
  }
});
root.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action === 'import') {
    const file = el.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      if (!confirm('Importar esta copia sustituirá los datos actuales de este navegador. ¿Continuar?')) return;
      try { ui.sheet = null; store.importJSON(text); } catch (err) { alert(`No se pudo importar la copia: ${err.message}`); }
    });
    return;
  }
  if (el.matches('[data-ask-include]')) { ui.ask.include = el.checked; return; }
  if (el.matches('[data-ask-consent]')) { (ui.ask.notify ||= {}).consent = el.checked; return; }
  if (el.dataset.num) {
    const key = el.dataset.num;
    const raw = el.value.trim().replace(',', '.');
    const v = parseFloat(raw);
    if (raw === '') store.updateLog(ui.selectedDate, (l) => { l[key] = null; });
    else if (Number.isFinite(v) && v >= NUM_FIELDS[key].min && v <= NUM_FIELDS[key].max) {
      store.updateLog(ui.selectedDate, (l) => { l[key] = roundField(key, v); });
    } else render(); // valor no válido: vuelve al anterior
    return;
  }
  if (el.dataset.range) {
    const key = el.dataset.range;
    const v = parseFloat(el.value);
    if (key.includes('.')) {
      const [head, k] = key.split('.');
      (head === 'draft' ? ui.draft : ui.ob)[k] = v;
      if (head === 'draft') render();
      return;
    }
    const rounders = { basalTemp: (x) => Math.round(x * 10) / 10, sleepHours: (x) => Math.round(x * 2) / 2, weight: (x) => Math.round(x) };
    store.updateLog(ui.selectedDate, (l) => { l[key] = rounders[key](v); });
    return;
  }
  if (el.dataset.model === 'draftStage.dueDate' || el.dataset.model === 'ob.dueDate' || el.dataset.model === 'ob.lmp') { render(); return; }
  if (el.dataset.model && /^draft/.test(el.dataset.model) && ui.sheet === 'settings') { render(); return; }
  if (el.dataset.model && el.type === 'date') {
    // Fechas de ajustes: validar que no sea futura
    if (el.value && el.value > todayISO()) { el.value = todayISO(); setModel(el.dataset.model, el.value); }
  }
});

// =========================================================================
// MARK: - Recordatorios en el navegador
// =========================================================================

const NOTIFIED_KEY = 'vera-notified';
function notifiedSet() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(NOTIFIED_KEY) || '{}');
    return raw.date === todayISO() ? new Set(raw.ids) : new Set();
  } catch { return new Set(); }
}
function saveNotified(set) {
  try { sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify({ date: todayISO(), ids: [...set] })); } catch { /* sin almacenamiento */ }
}

let lastTick = todayISO();
function tick() {
  // Nuevo día: vuelve a "hoy" si estaba en hoy
  const today = todayISO();
  if (today !== lastTick) {
    if (ui.selectedDate === lastTick) ui.selectedDate = today;
    lastTick = today;
  }
  if ('Notification' in window && Notification.permission === 'granted' && !store.needsOnboarding) {
    const sent = notifiedSet();
    for (const m of store.pendingMeds(today)) {
      if (sent.has(m.id)) continue;
      try {
        new Notification('Hera · Recordatorio de medicación', {
          body: `Es la hora de tu toma: ${m.name}${m.dose ? ` (${m.dose})` : ''}`,
          icon: 'icons/icon-192.png',
          tag: `med-${m.id}`,
        });
      } catch { /* algunos navegadores móviles solo permiten avisos desde el service worker */ }
      sent.add(m.id);
    }
    saveNotified(sent);
  }
  // Refresca banners sin interrumpir si se está escribiendo o arrastrando
  const a = document.activeElement;
  if (!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'))) render();
}
setInterval(tick, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

// MARK: - Arranque

if (new URLSearchParams(location.search).has('demo') && store.needsOnboarding) store.loadDemoData();
onSyncChange(render);
initSync();
pushState().then((st) => { ui.pushState = st; render(); });
let pushSeen;
store.subscribe(() => { // mantiene el servicio al día si cambia la fecha, la etapa, o se sale del embarazo/posparto
  if (ui.pushState !== 'on') return;
  const t = pushTarget();
  const k = t ? `${t.kind}:${t.date}` : null;
  if (k === pushSeen) return;
  pushSeen = k;
  syncPush(t).then(async () => { ui.pushState = await pushState(); render(); }).catch(() => {});
});
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
}

