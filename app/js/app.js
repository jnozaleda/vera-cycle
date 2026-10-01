// app.js
// Interfaz de Vera web: navegación, pestañas Hoy / Ciclo / Patrones, ajustes, calendario y onboarding.
// Port de ContentView, TodayView, CycleView, TrendsView, SettingsView y OnboardingView (SwiftUI).

import {
  PHASES, PHASE_TIPS, PHASE_SYMPTOMS, BLEEDING_SYMPTOMS, FLOW_OPTIONS, SYMPTOMS, MOODS, INTIMACY,
  STRESS_LEVELS, CERVICAL_MUCUS, LH_TEST_RESULTS, HORMONAL_CONDITIONS,
  cycleInfo, nextPeriodDN, dnFromISO, isoFromDN, todayDN, todayISO, partsFromDN, dnFromParts,
  fmtDayMonthShort, fmtDayMonthLong, fmtDayMonthYear, fmtMonthYear, fmtWeekdayLong, fmtWeekdayNarrow,
  averageCycleLength, settingsFromIrregularPeriods,
} from './logic.js';
import { QUALITY, BASIS, windowText, predictionNotices } from './predict.js';
import { store } from './store.js';
import { icon } from './icons.js';
import {
  gestation, sinceBirth, TRIMESTER_LABEL, TRIMESTER_TEXT, timelineFor, fluCampaign, dueFromLmp,
  PREGNANCY_SYMPTOMS, PREGNANCY_ALARMS, BABY_MOVEMENT, POSTPARTUM_SYMPTOMS, POSTPARTUM_ALARMS,
  URGENT_PREGNANCY, URGENT_POSTPARTUM, pregnancyMedWarnings,
} from './pregnancy.js';
import { GUIDE_INTRO, PREGNANCY_GUIDE, POSTPARTUM_GUIDE, guideSectionFor } from './guide.js';
import { spansPregnancy } from './predict.js';
import { PREGNANCY_BETA_ONLY } from './config.js';
import { isBeta } from './beta.js';
import { sync, syncAvailable, onSyncChange, initSync, connect, reauthorize, disconnect, deleteRemote, syncNow, loadGis } from './sync.js';

const CONTACT_EMAIL = 'contact.gineped@gmail.com';
const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Consulta desde Vera web')}`;

// MARK: - Utilidades

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = esc;
const plural = (n, one, many) => (n === 1 ? one : many);
const fmtNum = (x, d) => x.toFixed(d).replace('.', ',');

const PHASE_COLOR = { menstrual: 'rose', ovulation: 'gold', fertile: 'sage' };

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
  guideQuery: '',
  openDetails: new Set(), // preguntas abiertas en la guía
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
      ${arc(0.15, settings.periodLen - 0.15, 'rose', 10)}
      ${arc(ovu - 5, ovu + 1.4, 'sage', 10)}
      ${arc(ovu + 0.32, ovu + 0.72, 'gold', 13)}
      ${ticks}
      <circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="9" fill="var(--deep)" stroke="var(--ivory)" stroke-width="3"/>
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
      <span class="t-12 soft block">Añade tus últimas reglas para que Vera calcule tu ciclo medio.</span>
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

  return `<div class="card pad stack-14 mt-6">
    ${eyebrow('Tu próxima regla')}
    <div class="row baseline between">
      <div class="serif-34">${esc(fmtDayMonthLong(p.predictedDate))}</div>
      <div class="row baseline gap-4"><span class="serif-34">${p.daysUntil}</span><span class="t-13 soft">días</span></div>
    </div>
    <div class="t-12 soft mt--8">${esc(windowText(p))}</div>
    <hr>
    <div class="row between center py-4">
      <div class="stack-4">
        <div class="row gap-5 t-11 soft"><span class="c-sage">${icon('leaf', 10)}</span>Ventana fértil</div>
        <div class="t-14 w-500">${esc(fmtDayMonthShort(fStart))} – ${esc(fmtDayMonthShort(fEnd))}</div>
      </div>
      <div class="vsep"></div>
      <div class="stack-4">
        <div class="row gap-5 t-11 soft"><span class="c-gold">${icon('sparkle', 10)}</span>Ovulación</div>
        <div class="t-14 w-500">${esc(fmtDayMonthShort(ov))}</div>
      </div>
    </div>
    <hr>
    <div class="row gap-10 center wrap">
      ${qualityChip('Regla', p.periodQuality, p.confidenceDays > 0 ? `±${p.confidenceDays}d` : null)}
      ${qualityChip('Fértil', p.ovulationQuality, null)}
      <span class="grow"></span>
      <span class="${high ? 'c-sage' : 'c-gold'}" title="${attr(BASIS[p.predictionBasis].label)}">${icon(high ? 'checkCircle' : 'bars', 13)}</span>
    </div>
    ${hint ? `<div class="row gap-5 t-11 soft"><span class="c-gold">${icon('arrowUp', 11)}</span>${esc(hint)}</div>` : ''}
    ${predictionNotices(p).map((n) => `<div class="row gap-6 top t-11 soft lh-3"><span class="c-gold mt-1">${icon('info', 11)}</span><span>${esc(n)}</span></div>`).join('')}
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
        <span class="legend"><i class="bg-rose"></i>Regla</span>
        <span class="legend"><i class="bg-sage"></i>Ventana fértil</span>
        <span class="legend"><i class="bg-gold"></i>Ovulación</span>
      </div>
    </div>
    <div class="card">
      <div class="row gap-12 stat-row">
        ${statCard(info.daysToNext, 'DÍAS PARA<br>LA REGLA')}
        ${statCard(fmtDayMonthShort(next), 'PRÓXIMA<br>REGLA')}
      </div>
      <hr class="mx-12 mt-4">
      <div class="px-8">
        <div class="date-row"><span class="c-sage">${icon('leaf', 13)}</span><div><div class="t-12 soft">Ventana fértil</div><div class="t-14 w-500">${esc(fmtDayMonthShort(ovDN - 5))} – ${esc(fmtDayMonthShort(ovDN + 1))}</div></div></div>
        <hr class="ml-36">
        <div class="date-row"><span class="c-gold">${icon('sparkle', 13)}</span><div><div class="t-12 soft">Ovulación estimada</div><div class="t-14 w-500">${esc(fmtDayMonthLong(ovDN))}</div></div></div>
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
    ${contactCard()}
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

function trackingSlider(label, ic, tone, key, value, def, min, max, step, format) {
  return `<div class="stack-8">
    <div class="row gap-6 center"><span class="c-${tone === 'deep' ? 'deep' : tone}">${icon(ic, 13)}</span><span class="t-13 w-500 soft">${label}</span>${def.note || ''}</div>
    <div class="row gap-12 center">
      ${rangeRow({ key, min, max, step, value: value ?? def.value, tone })}
      <span class="range-val" data-out="${key}">${value != null ? format(value) : '—'}</span>
    </div>
    ${value != null ? `<button class="link-soft" data-action="clear-field" data-field="${key}">Borrar</button>` : ''}
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
    ${meds.length && perm === 'granted' ? `<div class="t-125 c-sage text-center row gap-6 justify-center center">${icon('check', 12)} Avisos activados mientras Vera esté abierta</div>` : ''}
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
      insight = `<div class="row gap-6 top mt-12 t-12 soft italic lh-3"><span class="c-gold mt-1">${icon('sparkle', 11)}</span><span>«${esc(topS.name)}» aparece más en tu fase ${dom.label.toLowerCase()}.</span></div>`;
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
      ${alerts.esc ? `<hr><div class="row gap-10 top"><span class="c-rose mt-1">${icon('stethoscope', 14)}</span><span class="t-13 w-500 c-deep lh-4">Consulta con tu ginecóloga para revisar estos patrones.</span></div>` : ''}
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
        <span class="legend box"><i class="ph-rose"></i>Regla</span>
        <span class="legend box"><i class="ph-sage"></i>Fértil</span>
        <span class="legend box"><i class="ph-gold"></i>Ovulación</span>
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

function syncSection() {
  if (!sync.enabled) {
    return `<div class="stack-10 data-box">
      ${eyebrow('Sincronización')}
      <p class="t-13 soft lh-4">Guarda tus datos en tu propio Google Drive para verlos desde cualquier dispositivo. Es opcional: sin cuenta, Vera funciona igual.</p>
      <button class="google-btn" data-action="sync-connect">${GOOGLE_G} Continuar con Google</button>
      ${sync.error ? `<p class="t-12 c-rose">${esc(sync.error)}</p>` : ''}
      <p class="t-11 soft-70 lh-3">Tus datos se guardan en una carpeta privada de tu Google Drive a la que solo accede Vera. No aparece entre tus archivos. Vera no tiene servidores: nosotros no vemos tus datos.</p>
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
      <p class="t-13 soft lh-4">Este dispositivo también tiene registros de Vera. ¿Qué quieres hacer?</p>
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
      ${primaryButton('Guardar', 'save-settings')}
      ${syncAvailable() ? syncSection() : ''}
      <div class="stack-10 data-box">
        ${eyebrow('Contacto')}
        <p class="t-13 soft lh-4">¿Tienes dudas sobre tu salud, sobre cómo usar Vera o quieres darnos tu opinión? Escríbenos cuando quieras.</p>
        <a class="outline-sage" href="${CONTACT_HREF}">${icon('mail', 14)} ${CONTACT_EMAIL}</a>
        <p class="t-11 soft-70 lh-3">No atendemos urgencias: si tienes un sangrado muy abundante, dolor intenso o fiebre, acude a tu médico o a urgencias. Nuestras respuestas son orientativas y no sustituyen una consulta.</p>
      </div>
      <div class="stack-10 data-box">
        ${eyebrow('Tus datos')}
        <p class="t-12 soft lh-3">Vera web guarda todo solo en este navegador. Nada sale de tu dispositivo. Haz una copia para no perder tus registros si borras los datos del navegador o cambias de equipo.</p>
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
        <div class="ob-logo">Vera</div>
        <div class="ob-tag">BIENESTAR FEMENINO</div>
        <p class="t-17 light soft lh-6 mb-44">Tu ciclo, tus síntomas y tu medicación, acompañados por la posibilidad de consultar con tu ginecólogo cuando lo necesites.</p>
        ${primaryButton('Comenzar', 'ob-next')}
        ${syncAvailable() ? `<button class="google-btn mt-16" data-action="sync-connect">${GOOGLE_G} ¿Ya usas Vera? Recuperar mis datos</button>` : ''}
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
        <h2 class="ob-h">¿Qué quieres seguir?</h2>
        <p class="t-14 soft lh-4 mb-30">Podrás cambiarlo cuando quieras desde los ajustes.</p>
        <div class="stack-12">
          ${opt('Mi ciclo menstrual', 'Reglas, ventana fértil, síntomas y medicación.', 'dotted', 'cycle')}
          ${opt('Estoy embarazada', 'Semanas, pruebas de cada etapa y dudas frecuentes.', 'heart', 'pregnancy')}
          ${opt('He tenido a mi bebé', 'Recuperación, lactancia y vuelta de la regla.', 'sparkles', 'postpartum')}
        </div>
      </div>`;
      break;
    } else if (ob.flow === 'pregnancy') {
      content = `<div>
        <h2 class="ob-h">Tu embarazo</h2>
        <p class="t-14 soft lh-4 mb-22">¿Cuál es tu fecha probable de parto? Si tu matrona la ha ajustado con la ecografía, usa esa.</p>
        <input type="date" class="field date big mb-12" data-model="ob.dueDate" value="${attr(ob.dueDate)}" min="${isoFromDN(todayDN() - 100)}" max="${isoFromDN(todayDN() + 300)}" aria-label="Fecha probable de parto">
        <p class="t-13 soft mb-8">¿No la sabes? Indica el primer día de tu última regla y la calculamos:</p>
        <input type="date" class="field date mb-32" data-model="ob.lmp" value="${attr(ob.lmp)}" max="${todayISO()}" aria-label="Primer día de la última regla">
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

const stageUI = () => !PREGNANCY_BETA_ONLY || isBeta() || store.mode !== 'cycle';
const MODE_TAG = { cycle: 'BIENESTAR FEMENINO', pregnancy: 'EMBARAZO', postpartum: 'POSPARTO' };

function contactCard(title = '¿Dudas sobre tu ciclo o la app?') {
  return `<div class="contact-card stack-12">
      <div class="row gap-12 top">
        <span class="contact-ic">${icon('message', 16)}</span>
        <div class="stack-4">
          <div class="t-14 w-500">${esc(title)}</div>
          <div class="t-13 soft lh-3">Salud, uso de Vera o sugerencias: escríbenos cuando quieras, te leemos.</div>
        </div>
      </div>
      <a class="outline-sage bg-white" href="${CONTACT_HREF}">${icon('mail', 14)} Escríbenos</a>
      <div class="t-11 soft-70 lh-3">No atendemos urgencias: si algo no va bien, acude a tu médico o a urgencias.</div>
    </div>`;
}

function urgentCard() {
  return `<button class="urgent-card" data-action="open-urgent">
    <span class="urgent-ic">${icon('alertFill', 18)}</span>
    <span class="grow left"><span class="t-14 w-500 block">¿Algo no va bien?</span>
      <span class="t-12 soft block lh-3">Cuándo ir a urgencias sin esperar a tu próxima cita.</span></span>
    ${icon('right', 12, 'soft')}
  </button>`;
}

function urgentSheet() {
  const pp = store.mode === 'postpartum';
  const list = pp ? URGENT_POSTPARTUM : URGENT_PREGNANCY;
  return sheetFrame('Cuándo ir a urgencias', `
    <div class="stack-14">
      <p class="t-13 soft lh-4">Ve a urgencias de tu hospital o contacta con tu unidad ${pp ? 'de maternidad' : 'obstétrica'}, sin esperar a la siguiente cita, si notas:</p>
      <ul class="alarm-list">${list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <a class="btn-urgent" href="tel:112">${icon('phone', 16)} Llamar al 112</a>
      ${pp ? `<a class="outline-sage" href="tel:024">${icon('phone', 14)} 024 · Línea de atención a la conducta suicida</a>` : ''}
      <p class="t-12 soft lh-3">Ante la duda, es mejor consultar: nadie te va a reprochar ir y que todo esté bien.</p>
    </div>`);
}

function timelineItem(t, now) {
  return `<div class="tl-item ${now ? 'now' : ''}">
    <div class="tl-weeks">${t.from === t.to ? `Sem. ${t.from}` : `Sem. ${t.from}–${t.to}`}</div>
    <div class="stack-4"><div class="t-14 w-500">${esc(t.title)}</div><div class="t-12 soft lh-3">${esc(t.text)}</div></div>
  </div>`;
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
      ${urgentCard()}
    </div>`;
  }
  const { now, next } = timelineFor(g.weeks, p.rh);
  const section = guideSectionFor(g.weeks);
  const pct = Math.min(100, (g.totalDays / 280) * 100);
  const overdue = g.daysLeft < 0;
  return `<div class="stack-18">
    <div class="card pad stack-12 preg-hero">
      ${eyebrow(TRIMESTER_LABEL[g.trimester])}
      <div class="row baseline gap-10">
        <span class="preg-weeks">${g.weeks}</span>
        <span class="stack-0"><span class="serif-24">${plural(g.weeks, 'semana', 'semanas')}</span><span class="t-13 soft">+ ${g.days} ${plural(g.days, 'día', 'días')}</span></span>
      </div>
      <div class="vbar preg-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="row between t-11 soft"><span>Inicio</span><span>40 semanas</span></div>
      <hr>
      <div class="row between center">
        <div><div class="t-12 soft">Fecha probable de parto</div><div class="t-15 w-500">${esc(fmtDayMonthLong(g.due))} ${partsFromDN(g.due).y}</div></div>
        <div class="text-center"><div class="serif-28">${Math.abs(g.daysLeft)}</div><div class="t-11 soft">${overdue ? 'días pasada' : plural(g.daysLeft, 'día', 'días')}</div></div>
      </div>
      ${overdue ? '<p class="t-12 soft lh-3">Dar a luz hasta la semana 41 y 6 días es normal. A partir de la 40 tu equipo te hará controles más frecuentes.</p>' : ''}
      ${p.multiple === 'multiple' ? '<p class="t-12 soft lh-3">En un embarazo múltiple el seguimiento suele ser más frecuente y las fechas pueden adelantarse: sigue las indicaciones de tu equipo.</p>' : ''}
    </div>
    <div class="card pad stack-10">
      ${eyebrow('Esta etapa')}
      <p class="t-13 soft lh-5">${esc(TRIMESTER_TEXT[g.trimester])}</p>
    </div>
    <div class="card pad stack-12">
      ${eyebrow('Lo que toca ahora')}
      ${now.length ? now.map((t) => timelineItem(t, true)).join('') : '<p class="t-13 soft">Ahora mismo no hay ninguna prueba prevista en el calendario habitual.</p>'}
      ${fluCampaign() ? `<div class="tl-item now"><div class="tl-weeks">Campaña</div><div class="stack-4"><div class="t-14 w-500">Vacunas de la gripe y la COVID-19</div><div class="t-12 soft lh-3">Se recomiendan durante la campaña de otoño e invierno, en cualquier trimestre.</div></div></div>` : ''}
      ${next.length ? `<div class="t-11 soft upper track-1 mt-4">Próximamente</div>${next.map((t) => timelineItem(t, false)).join('')}` : ''}
      <p class="t-11 soft-70 lh-3">El calendario concreto lo indica tu equipo; puede variar según tu comunidad y tu hospital.</p>
    </div>
    <div class="card pad stack-12">
      <div class="row baseline between">${eyebrow('Dudas de ahora')}<span class="t-11 soft">${esc(section.title)}</span></div>
      ${section.items.slice(0, 3).map((it) => `<button class="faq-link" data-action="open-guide" data-section="${section.id}" data-q="${attr(it.q)}">${esc(it.q)} ${icon('right', 12, 'soft')}</button>`).join('')}
      <button class="link-soft" data-action="open-guide" data-section="${section.id}">Ver todas las dudas →</button>
    </div>
    ${urgentCard()}
    ${contactCard('¿Tienes alguna duda sobre tu embarazo?')}
  </div>`;
}

function postpartumToday() {
  const pp = store.stage.postpartum;
  const s = sinceBirth(pp);
  if (!s) {
    return `<div class="stack-18"><div class="card pad stack-14">${eyebrow('Posparto')}
      <div class="serif-22">¿Cuándo nació tu bebé?</div>
      ${primaryButton('Añadir fecha', 'open-settings')}</div>${urgentCard()}</div>`;
  }
  const early = s.weeks < 6;
  return `<div class="stack-18">
    <div class="card pad stack-10 preg-hero">
      ${eyebrow('Desde el parto')}
      <div class="row baseline gap-10">
        <span class="preg-weeks">${s.weeks}</span>
        <span class="stack-0"><span class="serif-24">${plural(s.weeks, 'semana', 'semanas')}</span><span class="t-13 soft">+ ${s.days} ${plural(s.days, 'día', 'días')}</span></span>
      </div>
      <div class="t-12 soft">Tu bebé nació el ${esc(fmtDayMonthLong(s.birth))}</div>
    </div>
    <div class="card pad stack-10">
      ${eyebrow(early ? 'Las primeras semanas' : 'Tu recuperación')}
      <p class="t-13 soft lh-5">${early
        ? 'Tu cuerpo se está recuperando: el sangrado (loquios) se irá aclarando y disminuyendo durante unas 4 a 6 semanas. Descansa siempre que puedas, acepta ayuda y pide apoyo pronto si la lactancia duele o no va bien.'
        : 'Hacia las 6 semanas suele hacerse la revisión posparto con tu matrona: un buen momento para hablar de cómo te encuentras, la lactancia, el suelo pélvico y la anticoncepción.'}</p>
      <p class="t-13 soft lh-5">Los cambios de humor de los primeros días son frecuentes. Si la tristeza dura más de dos semanas, va a más o no disfrutas de nada, coméntalo: tiene tratamiento.</p>
    </div>
    <div class="card pad stack-12">
      ${eyebrow('Cuando vuelva tu regla')}
      <p class="t-13 soft lh-5">Si no das el pecho suele volver a las 6 a 8 semanas; con lactancia materna puede tardar meses. Los primeros ciclos son irregulares. Puedes ovular antes de la primera regla: si no buscas otro embarazo, habla de anticoncepción con tu matrona.</p>
      <button class="outline-sage" data-action="stage-back-cycle">${icon('drop', 13)} Ha vuelto mi regla: seguir mi ciclo</button>
    </div>
    <div class="card pad stack-12">
      ${eyebrow('Dudas del posparto')}
      ${POSTPARTUM_GUIDE[0].items.slice(0, 3).map((it) => `<button class="faq-link" data-action="open-guide" data-section="pp" data-q="${attr(it.q)}">${esc(it.q)} ${icon('right', 12, 'soft')}</button>`).join('')}
    </div>
    ${urgentCard()}
    ${contactCard('¿Tienes alguna duda sobre tu posparto?')}
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
  return `<div class="alarm-banner">
    <div class="row gap-8 top"><span class="c-rose mt-1">${icon('alertFill', 16)}</span>
      <div class="stack-6">
        <div class="t-14 w-500">Esto necesita valoración sin esperar</div>
        <div class="t-13 lh-4">${selfHarm
          ? 'No estás sola y tiene tratamiento. Llama ahora al 024 (atención a la conducta suicida) o al 112, o ve a urgencias.'
          : `Contacta con tu unidad ${pp ? 'de maternidad' : 'obstétrica'} o ve a urgencias. Si es una emergencia, llama al 112.`}</div>
      </div>
    </div>
    <div class="row gap-8 wrap">
      <a class="btn-urgent small" href="tel:${selfHarm ? '024' : '112'}">${icon('phone', 14)} Llamar al ${selfHarm ? '024' : '112'}</a>
      <button class="pill-outline" data-action="open-urgent">Ver señales de alarma</button>
    </div>
  </div>`;
}

function stageDiary() {
  const pp = store.mode === 'postpartum';
  const ds = ui.selectedDate;
  const isToday = ds === todayISO();
  const log = store.log(ds);
  const symptoms = pp ? POSTPARTUM_SYMPTOMS : PREGNANCY_SYMPTOMS;
  const alarms = pp ? POSTPARTUM_ALARMS : PREGNANCY_ALARMS;
  const activeAlarms = alarms.filter((a) => log.symptoms.includes(a));
  const g = pp ? null : gestation(store.stage.pregnancy, dnFromISO(ds));
  const reducedMoves = log.babyMovement === 'Menos de lo habitual';
  const dw = store.defaultWeight;
  const warnings = pp ? [] : pregnancyMedWarnings(store.data.meds);
  const moods = ['Tranquila', 'Con energía', 'Sensible', 'Cansada', 'Preocupada', 'Triste'];

  return `<div class="stack-18">
    ${weekStrip(false)}
    ${!isToday ? `<div class="row gap-8 center px-4"><span class="c-gold">${icon('pencil', 14)}</span><span class="t-13 soft">Editando el ${esc(fmtWeekdayLong(dnFromISO(ds)))}</span></div>` : ''}
    ${alarmBanner(reducedMoves ? [...activeAlarms, 'mov'] : activeAlarms, pp)}
    <div class="card pad-0">
      <div class="px-20 pt-20">${eyebrow('Cómo te sientes')}</div>
      <div class="hscroll-wrap"><div class="hscroll">${moods.map((m) => chip(m, log.mood === m, 'set-mood', { v: m })).join('')}</div></div>
    </div>
    <div class="card pad stack-14">
      <div class="row baseline between">${eyebrow('Síntomas')}${g && g.totalDays >= 0 ? `<span class="t-11 soft">Semana ${g.weeks}</span>` : ''}</div>
      <div class="chips">${symptoms.map((s) => chip(s, log.symptoms.includes(s), 'toggle-symptom', { s })).join('')}</div>
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
    ${isToday ? medicationSection(log) : ''}
  </div>`;
}

function answerHTML(a) {
  return a.map((b) => (Array.isArray(b) ? `<ul class="tips">${b.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>` : `<p>${esc(b)}</p>`)).join('');
}

function guideView() {
  const pp = store.mode === 'postpartum';
  const g = pp ? null : gestation(store.stage.pregnancy);
  const current = g ? guideSectionFor(g.weeks).id : (pp ? 'pp' : null);
  const sections = pp ? [...POSTPARTUM_GUIDE, ...PREGNANCY_GUIDE] : [...PREGNANCY_GUIDE, ...POSTPARTUM_GUIDE];
  const isOpen = (id) => ui.openDetails.has(id);
  return `<div class="stack-18">
    <div class="card pad stack-12">
      ${eyebrow('Guía')}
      <div class="serif-22">${pp ? 'Dudas del posparto y del embarazo' : 'Dudas del embarazo, semana a semana'}</div>
      <p class="t-12 soft lh-4">${esc(GUIDE_INTRO)}</p>
      <label class="search">${icon('search', 14, 'soft')}<input type="search" data-guide-search placeholder="Busca: café, ecografía, vacunas…" value="${attr(ui.guideQuery)}" aria-label="Buscar en la guía"></label>
    </div>
    ${urgentCard()}
    ${sections.map((sec) => `<section class="card pad stack-10 guide-sec" data-sec="${sec.id}">
      <div class="row baseline between">${eyebrow(sec.title)}${sec.id === current ? '<span class="now-tag">Ahora</span>' : ''}</div>
      <div class="t-13 soft">${esc(sec.subtitle)}</div>
      <div class="faq">${sec.items.map((it, i) => {
        const id = `${sec.id}-${i}`;
        return `<details class="faq-item" data-id="${id}" data-text="${attr((it.q + ' ' + it.a.flat().join(' ')).toLowerCase())}" ${isOpen(id) ? 'open' : ''}>
          <summary>${esc(it.q)}</summary><div class="faq-a">${answerHTML(it.a)}</div></details>`;
      }).join('')}</div>
    </section>`).join('')}
    <p class="guide-empty t-13 soft text-center" hidden>No hemos encontrado nada. Prueba con otra palabra o escríbenos.</p>
    ${contactCard('¿Tu duda no está aquí?')}
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

function stageSection() {
  const d = ui.draftStage;
  const btn = (label, val) => `<button class="type-btn ${d.mode === val ? 'on' : ''}" aria-pressed="${d.mode === val}" data-action="draft-stage" data-v="${val}">${label}</button>`;
  return `<div class="stack-10"><div class="t-13 soft">¿Qué quieres seguir?</div>
    <div class="row gap-8">${btn('Ciclo', 'cycle')}${btn('Embarazo', 'pregnancy')}${btn('Posparto', 'postpartum')}</div></div>
    ${store.mode !== 'cycle' && d.mode === 'cycle' ? `<div class="note-mist lh-3"><span class="c-sage">${icon('info', 14)}</span><span>${store.mode === 'pregnancy'
      ? 'Si tu embarazo ha terminado, cuídate y date tiempo; puedes escribirnos cuando quieras. Indica abajo tu última regla cuando vuelva.'
      : 'Indica abajo el primer día de tu última regla. Los primeros ciclos tras el parto suelen ser irregulares.'}</span></div>` : ''}
    <hr>`;
}

function optRow(label, field, options, value) {
  return `<div class="stack-8"><div class="t-13 soft">${label}</div>
    <div class="row gap-8 wrap">${options.map(([v, l]) => chip(l, value === v, 'draft-stage-field', { f: field, v }, 'deep')).join('')}</div></div>`;
}

function pregnancyForm() {
  const p = ui.draftStage.pregnancy;
  const g = gestation(p);
  return `<div class="stack-8">
      <div class="t-13 soft">Fecha probable de parto</div>
      <input type="date" class="field date" data-model="draftStage.dueDate" value="${attr(p.dueDate || '')}" min="${isoFromDN(todayDN() - 100)}" max="${isoFromDN(todayDN() + 300)}">
      ${g && g.totalDays >= 0 ? `<div class="t-12 soft">Hoy estarías de ${g.weeks} semanas y ${g.days} ${plural(g.days, 'día', 'días')}.</div>` : ''}
      <p class="t-12 soft-70 lh-3">Si tu matrona o tu ginecólogo la han ajustado con la ecografía, usa esa fecha.</p>
    </div>
    <div class="stack-8">
      <div class="t-13 soft">¿No la sabes? Calcúlala con el primer día de tu última regla</div>
      <div class="row gap-8 center"><input type="date" class="field date grow" data-model="draftLmp" value="${attr(ui.draftLmp)}" max="${todayISO()}">
        <button class="pill-outline" data-action="draft-due-from-lmp">Calcular</button></div>
    </div>
    <hr>
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
    return { stage: { ...cur, mode: 'postpartum', pregnancy: null, postpartum: { birthDate: d.postpartum.birthDate, feeding: d.postpartum.feeding ?? null }, history } };
  }
  closePregnancy(todayISO());
  const postpartum = cur.mode === 'postpartum' && cur.postpartum ? { ...cur.postpartum, endedAt: todayISO() } : cur.postpartum;
  return { stage: { ...cur, mode: 'cycle', pregnancy: null, postpartum, history } };
}

const TABS = [
  { icon: 'sparkles', label: 'HOY' },
  { icon: 'dotted', label: 'CICLO' },
  { icon: 'chart', label: 'PATRONES' },
];
const STAGE_TABS = [
  { icon: 'sparkles', label: 'HOY' },
  { icon: 'calendar', label: 'DIARIO' },
  { icon: 'book', label: 'GUÍA' },
];

function mainView() {
  const mode = store.mode;
  const tabs = mode === 'cycle' ? TABS : STAGE_TABS;
  const views = mode === 'cycle' ? [todayView, cycleView, trendsView]
    : [mode === 'pregnancy' ? pregnancyToday : postpartumToday, stageDiary, guideView];
  const view = views[ui.tab]();
  return `<div class="shell">
    <header class="app-header">
      <div><h1 class="brand">Vera</h1><div class="brand-tag">${MODE_TAG[mode]}</div></div>
      <div class="row gap-8 center">
        ${syncPill()}
        ${mode !== 'cycle' ? `<button class="urgent-pill" data-action="open-urgent" aria-label="Cuándo ir a urgencias">${icon('phone', 13)} Urgencias</button>` : ''}
        <a class="gear" href="${CONTACT_HREF}" aria-label="Escríbenos: ${CONTACT_EMAIL}" title="Escríbenos">${icon('mail', 16)}</a>
        <button class="gear" data-action="open-settings" aria-label="Ajustes">${icon('gear', 16)}</button>
      </div>
    </header>
    ${reminderBanner()}
    ${mode === 'cycle' ? irregularNudge() : ''}
    <main class="content">${view}</main>
    <footer class="foot"><a href="${CONTACT_HREF}">Contacto</a> · <a href="../support.html">Soporte</a> · <a href="../privacy.html">Privacidad</a></footer>
  </div>
  <nav class="tabbar" aria-label="Secciones">
    ${tabs.map((t, i) => `<button class="tab ${ui.tab === i ? 'on' : ''}" data-action="tab" data-i="${i}" aria-current="${ui.tab === i ? 'page' : 'false'}">${icon(t.icon, 20)}<span>${t.label}</span></button>`).join('')}
  </nav>
  ${ui.sheet === 'calendar' ? calendarSheet() : ''}
  ${ui.sheet === 'settings' ? settingsSheet() : ''}
  ${ui.sheet === 'urgent' ? urgentSheet() : ''}
  ${ui.syncChoice ? syncChoiceDialog() : ''}`;
}

const root = document.getElementById('app');
let lastScreen = null;

function render() {
  const screen = store.needsOnboarding ? 'ob' : 'main';
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
  ui.sheetAnim = true;
  ui.draftPicker = todayISO();
  ui.sheet = 'settings';
  render();
}

const actions = {
  tab: (el) => { ui.tab = +el.dataset.i; ui.sheet = null; render(); window.scrollTo(0, 0); },
  'open-settings': openSettings,
  'close-sheet': () => { ui.sheet = null; render(); },
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
  'open-urgent': () => { ui.sheet = 'urgent'; ui.sheetAnim = true; render(); },
  'open-guide': (el) => {
    ui.tab = 2;
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
    if (!confirm(`¿Borrar todos tus datos de Vera en este navegador? Esta acción no se puede deshacer.${extra}`)) return;
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
  'sync-now': () => syncNow(),
  'sync-reauth': () => reauthorize(),
  'sync-disconnect': () => {
    if (!confirm('¿Dejar de sincronizar este dispositivo? Tus datos seguirán en este navegador y en tu Google Drive.')) return;
    disconnect();
  },
  'sync-delete': async () => {
    if (!confirm('¿Borrar tu copia de Vera de Google Drive? Los datos de este navegador se mantienen. Esta acción no se puede deshacer.')) return;
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
      let due = dnFromISO(ob.dueDate);
      const lmp = dnFromISO(ob.lmp);
      if (due == null && lmp != null && lmp <= today) due = dueFromLmp(lmp);
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
  if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); }
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
  else if (head === 'draftStage') {
    if (key === 'dueDate') ui.draftStage.pregnancy.dueDate = value;
    else if (key === 'birthDate') ui.draftStage.postpartum.birthDate = value;
  }
}
root.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.model) { setModel(el.dataset.model, el.value); return; }
  if (el.matches('[data-guide-search]')) { ui.guideQuery = el.value; applyGuideFilter(); return; }
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
  if (el.dataset.range) {
    const key = el.dataset.range;
    const v = parseFloat(el.value);
    if (key.includes('.')) {
      const [head, k] = key.split('.');
      (head === 'draft' ? ui.draft : ui.ob)[k] = v;
      return;
    }
    const rounders = { basalTemp: (x) => Math.round(x * 10) / 10, sleepHours: (x) => Math.round(x * 2) / 2, weight: (x) => Math.round(x) };
    store.updateLog(ui.selectedDate, (l) => { l[key] = rounders[key](v); });
    return;
  }
  if (el.dataset.model === 'draftStage.dueDate') { render(); return; }
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
        new Notification('Vera · Recordatorio de medicación', {
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
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
}

