// predict.js
// Predictor de ciclo menstrual — port de CyclePrediction.swift
//
//    [Regla] ──── Fase Folicular ────► [Ovulación] ──── Fase Lútea ────► [Regla]
//               (variable: estrés,                    (estable: casi
//                sueño, enfermedades)                  siempre 12-16 días)
//
//  Para cada fase se aprende una distribución con Empirical Bayes:
//  un prior poblacional que se encoge hacia los datos propios de la usuaria.
//
//  Nivel 0 — sin señal del ciclo actual → lastPeriod + follicular.mean + luteal.mean
//  Nivel 1 — con señal (LH / temperatura / moco) → ovulación + luteal.mean
//
//  Todas las fechas son números de día (ver logic.js); pueden llevar fracción.

import { dnFromISO, isoFromDN, nowDN, todayDN, ageFrom, roundHalfAway, fmtDayMonthShort } from './logic.js';

// MARK: - Constantes clínicas

const Cfg = {
  lutealPriorMean: 14,
  lutealPriorSD: 1.5,
  lutealPriorWeight: 2,
  follPriorMean: 14,
  follPriorSD: 3,
  follPriorSDIrregular: 7,
  follPriorWeight: 1.5,
  lutealMin: 7,
  lutealMax: 18,
  follMin: 5,
  follMax: 40,
  cycleMin: 21,
  cycleMax: 35,
  irregularSD: 9,
  irregularRange: 9,
  shortLuteal: 10,
  tempShiftMain: 0.2,
  tempShiftSustain: 0.1,
};

export const QUALITY = {
  insufficient: { label: 'Sin datos', fraction: 0.1 },
  low: { label: 'Baja', fraction: 0.35 },
  medium: { label: 'Moderada', fraction: 0.65 },
  high: { label: 'Alta', fraction: 1.0 },
};

export const BASIS = {
  lhTest: { label: 'Test LH positivo', high: true },
  basalTemp: { label: 'Temperatura basal', high: true },
  mucus: { label: 'Pico de moco cervical', high: false },
  symptoms: { label: 'Síntomas + historial', high: false },
  statistical: { label: 'Historial de ciclos', high: false },
};

const PREMENSTRUAL_SYMPTOMS = new Set([
  'Hinchazón', 'Sensibilidad mamaria', 'Irritabilidad', 'Ansiedad',
  'Antojos', 'Fatiga', 'Insomnio', 'Retención de líquidos',
  'Dolor de cabeza', 'Acné', 'Cólicos', 'Dolor lumbar', 'Náuseas',
]);
const PREMENSTRUAL_MOODS = new Set(['Irritable', 'Sensible', 'Ansiosa', 'Baja energía']);
const PREMENSTRUAL_ALL = new Set([...PREMENSTRUAL_SYMPTOMS, ...PREMENSTRUAL_MOODS]);

const CONTRACEPTIVE_KEYWORDS = [
  'pildora', 'píldora', 'anticonceptivo', 'anticonceptiva', 'aco',
  'drospirenona', 'levonorgestrel', 'etinilestradiol', 'gestodeno',
  'desogestrel', 'norgestimato', 'dienogest', 'nomegestrol',
  'parche', 'anillo', 'nuvaring', 'evra', 'yasmin', 'yaz',
  'microgynon', 'loette', 'harmonet', 'minulet', 'belara',
  'qlaira', 'zoely', 'drovelis', 'eloine', 'gedarel', 'diane', 'cilest',
];
const HORMONAL_KEYWORDS = [
  'progesterona', 'utrogestan', 'duphaston', 'estrogeno', 'estrógeno',
  'estradiol', 'hormona', 'tiroides', 'levotiroxina', 'eutirox',
  'medroxiprogesterona', 'noretisterona', 'tibolona',
];

const isElastic = (v) => {
  const s = v?.toLowerCase();
  return s === 'elástico' || s === 'elastico';
};
const isPositive = (v) => v?.toLowerCase() === 'positivo';

// =========================================================================
// MARK: - Función principal
// =========================================================================

export function predict(data) {
  const { settings, logs, meds, profile } = data;
  const now = nowDN();

  const periodDates = extractPeriodDates(settings, logs);
  const ovDates = extractOvulationDates(logs, periodDates);

  const raw = learnPhases(periodDates, ovDates, settings.isRegular);
  const { foll, luteal } = applyProfileAdjustment(raw.foll, raw.luteal, profile);

  const pQuality = periodQuality(periodDates.length);
  const ovQualityBase = ovulationQuality(ovDates.length);
  const cycleCount = Math.max(0, periodDates.length - 1);

  if (periodDates.length === 0) return makeFallback(settings.cycleLen);
  const lastDate = periodDates[periodDates.length - 1];

  const medFlag = analyzeMedications(meds);
  const base = {
    follicularPhase: foll,
    lutealPhase: luteal,
    periodCycleCount: cycleCount,
    periodQuality: pQuality,
    medicationFlag: medFlag,
    lhPositiveDate: null,
  };
  const daysUntil = (d) => Math.max(0, Math.trunc(d - now));

  // Nivel 1a — Test LH positivo: regla = LH+ + 1 + luteal.mean
  const lh = analyzeLHTest(logs, lastDate, luteal);
  if (lh) {
    const cd = Math.max(1, Math.ceil(luteal.sd));
    return {
      ...base,
      predictedDate: lh.predicted, earliestDate: lh.predicted - cd, latestDate: lh.predicted + cd,
      confidenceDays: cd, ovulationQuality: 'high', symptomSignal: { kind: 'none' },
      daysUntil: daysUntil(lh.predicted), predictionBasis: 'lhTest',
      lhPositiveDate: lh.lhDate, ovulationEstimate: lh.lhDate + 1,
    };
  }

  // Nivel 1b — Subida de temperatura basal: regla = shiftDate + luteal.mean
  const temp = analyzeBasalTemp(logs, lastDate, luteal);
  if (temp) {
    const cd = Math.max(1, Math.ceil(luteal.sd));
    return {
      ...base,
      predictedDate: temp.predicted, earliestDate: temp.predicted - cd, latestDate: temp.predicted + cd,
      confidenceDays: cd, ovulationQuality: 'medium', symptomSignal: { kind: 'none' },
      daysUntil: daysUntil(temp.predicted), predictionBasis: 'basalTemp',
      ovulationEstimate: temp.shiftDate,
    };
  }

  // Nivel 1c — Pico de moco cervical: regla = pico + luteal.mean
  const mucus = analyzeMucus(logs, lastDate, luteal);
  if (mucus) {
    const cd = Math.max(2, Math.ceil(luteal.sd + 1));
    return {
      ...base,
      predictedDate: mucus.predicted, earliestDate: mucus.predicted - cd, latestDate: mucus.predicted + cd,
      confidenceDays: cd, ovulationQuality: 'medium', symptomSignal: { kind: 'none' },
      daysUntil: daysUntil(mucus.predicted), predictionBasis: 'mucus',
      ovulationEstimate: mucus.peakDate,
    };
  }

  // Nivel 0 — Solo historial (folicular + lútea aprendidas)
  const basePredicted = lastDate + foll.mean + luteal.mean;
  const symptomSignal = analyzeSymptoms(logs, periodDates, basePredicted);
  const symptomAdj = symptomSignal.kind === 'strong' ? symptomSignal.adjustment : 0;
  const stressSleepAdj = analyzeStressAndSleep(logs, lastDate, foll.mean);
  const predictedDate = basePredicted + symptomAdj + stressSleepAdj;

  const combinedSD = Math.sqrt(foll.sd ** 2 + luteal.sd ** 2);
  const confidenceDays = Math.min(7, Math.max(1, Math.ceil(combinedSD)));

  return {
    ...base,
    predictedDate,
    earliestDate: predictedDate - confidenceDays,
    latestDate: predictedDate + confidenceDays,
    confidenceDays,
    ovulationQuality: ovQualityBase,
    symptomSignal,
    daysUntil: daysUntil(predictedDate),
    predictionBasis: symptomSignal.kind !== 'none' ? 'symptoms' : 'statistical',
    ovulationEstimate: lastDate + foll.mean,
  };
}

// =========================================================================
// MARK: - Empirical Bayes
// =========================================================================

export function learnDist(samples, priorMean, priorSD, priorWeight) {
  const n = samples.length;
  if (n === 0) return { mean: priorMean, sd: priorSD, n: 0 };
  const sampleMean = samples.reduce((a, b) => a + b, 0) / n;
  const meanEst = (priorWeight * priorMean + n * sampleMean) / (priorWeight + n);
  const sampVar = n >= 2
    ? samples.reduce((a, s) => a + (s - sampleMean) ** 2, 0) / (n - 1)
    : priorSD ** 2;
  const processVar = (priorWeight * priorSD ** 2 + n * sampVar) / (priorWeight + n);
  return { mean: meanEst, sd: Math.sqrt(processVar), n };
}

export function learnPhases(periodDates, ovulationDates, isRegular = true) {
  const follLengths = [];
  const lutealLengths = [];
  const sortedPeriods = [...periodDates].sort((a, b) => a - b);
  const sortedOvs = [...ovulationDates].sort((a, b) => a - b);

  for (const ov of sortedOvs) {
    const before = sortedPeriods.filter((p) => p <= ov);
    const periodStart = before[before.length - 1];
    const nextPeriod = sortedPeriods.find((p) => p > ov);
    if (periodStart == null || nextPeriod == null) continue;
    const follLen = ov - periodStart;
    const lutealLen = nextPeriod - ov;
    if (follLen >= Cfg.follMin && follLen <= Cfg.follMax) follLengths.push(follLen);
    if (lutealLen >= Cfg.lutealMin && lutealLen <= Cfg.lutealMax) lutealLengths.push(lutealLen);
  }

  const follPriorSD = isRegular ? Cfg.follPriorSD : Cfg.follPriorSDIrregular;
  return {
    foll: learnDist(follLengths, Cfg.follPriorMean, follPriorSD, Cfg.follPriorWeight),
    luteal: learnDist(lutealLengths, Cfg.lutealPriorMean, Cfg.lutealPriorSD, Cfg.lutealPriorWeight),
  };
}

// =========================================================================
// MARK: - Ajuste por perfil
// =========================================================================

function applyProfileAdjustment(foll, luteal, profile) {
  let extraFoll = 0;
  let extraLuteal = 0;
  const c = profile?.hormonalCondition?.toLowerCase();
  if (c && (c.includes('pcos') || c.includes('sop'))) {
    extraFoll += 5; extraLuteal += 1.5;
  } else if (c && (c.includes('hipotir') || c.includes('endometri'))) {
    extraFoll += 2; extraLuteal += 0.5;
  }
  const age = profile?.birthDate ? ageFrom(profile.birthDate) : null;
  if (age != null) {
    if (age < 19) extraFoll += 3;
    else if (age >= 40) { extraFoll += 3; extraLuteal += 1; }
  }
  return {
    foll: { ...foll, sd: foll.sd + extraFoll },
    luteal: { ...luteal, sd: luteal.sd + extraLuteal },
  };
}

// =========================================================================
// MARK: - Extracción de fechas
// =========================================================================

export function extractPeriodDates(settings, logs) {
  const dateStrings = new Set([settings.lastPeriod, ...settings.pastPeriods]);

  const bleedingDays = Object.keys(logs)
    .filter((k) => {
      const l = logs[k];
      return l.flow != null || l.symptoms?.includes('Sangrado') || l.symptoms?.includes('Manchado');
    })
    .sort();

  let lastBleeding = null;
  for (const str of bleedingDays) {
    const d = dnFromISO(str);
    if (d == null) continue;
    if (lastBleeding != null && d - lastBleeding < 2) { lastBleeding = d; continue; }
    dateStrings.add(str);
    lastBleeding = d;
  }

  return [...dateStrings].map(dnFromISO).filter((d) => d != null).sort((a, b) => a - b);
}

/** Ovulaciones de ciclos pasados (LH > temperatura > moco) */
export function extractOvulationDates(logs, periodDates) {
  const sortedPeriods = [...periodDates].sort((a, b) => a - b);
  if (sortedPeriods.length < 2) return [];
  const ovDates = [];

  for (let i = 0; i < sortedPeriods.length - 1; i++) {
    const cycleStart = sortedPeriods[i];
    const cycleEnd = sortedPeriods[i + 1];

    const cycleLogs = Object.entries(logs)
      .map(([k, log]) => ({ date: dnFromISO(k), log }))
      .filter((e) => e.date != null && e.date >= cycleStart && e.date < cycleEnd)
      .map((e) => ({ day: e.date - cycleStart, log: e.log }))
      .sort((a, b) => a.day - b.day);

    let lhDay = null;
    const tempEntries = [];
    let mucusDay = null;
    for (const { day, log } of cycleLogs) {
      if (isPositive(log.lhTest)) lhDay = day;
      if (log.basalTemp != null) tempEntries.push({ day, celsius: log.basalTemp });
      if (isElastic(log.cervicalMucus)) mucusDay = day;
    }

    const shift = tempEntries.length ? detectTempShift(tempEntries) : null;
    if (lhDay != null) {
      ovDates.push(cycleStart + lhDay + 1);
    } else if (shift && shift.ovulationDay != null) {
      ovDates.push(cycleStart + shift.ovulationDay);
    } else if (mucusDay != null) {
      ovDates.push(cycleStart + mucusDay);
    }
  }
  return ovDates;
}

// =========================================================================
// MARK: - Temperatura basal (método línea de cobertura)
// =========================================================================

export function detectTempShift(temps) {
  const sorted = [...temps].sort((a, b) => a.day - b.day);
  if (sorted.length < 9) return null;
  for (let i = 6; i < sorted.length - 2; i++) {
    const coverline = Math.max(...sorted.slice(i - 6, i).map((t) => t.celsius));
    if (sorted[i].celsius >= coverline + Cfg.tempShiftMain &&
        sorted[i + 1].celsius >= coverline + Cfg.tempShiftSustain &&
        sorted[i + 2].celsius >= coverline + Cfg.tempShiftSustain) {
      const ovDay = sorted[i].day > 0 ? sorted[i].day - 1 : sorted[i].day;
      return { detected: true, ovulationDay: ovDay };
    }
  }
  return { detected: false, ovulationDay: null };
}

// =========================================================================
// MARK: - Señales del ciclo actual (Nivel 1)
// =========================================================================

function currentCycleEntries(logs, lastPeriodDate, predicate) {
  const today = todayDN();
  return Object.entries(logs)
    .map(([k, log]) => ({ key: k, date: dnFromISO(k), log }))
    .filter((e) => e.date != null && e.date >= lastPeriodDate && e.date <= today && predicate(e.log));
}

function analyzeLHTest(logs, lastPeriodDate, luteal) {
  const positives = currentCycleEntries(logs, lastPeriodDate, (l) => isPositive(l.lhTest));
  if (!positives.length) return null;
  const lhDate = Math.max(...positives.map((e) => e.date));
  return { lhDate, predicted: lhDate + 1 + luteal.mean };
}

function analyzeBasalTemp(logs, lastPeriodDate, luteal) {
  const entries = currentCycleEntries(logs, lastPeriodDate, (l) => l.basalTemp != null)
    .map((e) => ({ day: e.date - lastPeriodDate, celsius: e.log.basalTemp }));
  const shift = detectTempShift(entries);
  if (!shift || !shift.detected || shift.ovulationDay == null) return null;
  const shiftDate = lastPeriodDate + shift.ovulationDay;
  return { shiftDate, predicted: shiftDate + luteal.mean };
}

function analyzeMucus(logs, lastPeriodDate, luteal) {
  const days = currentCycleEntries(logs, lastPeriodDate, (l) => isElastic(l.cervicalMucus));
  if (!days.length) return null;
  const peakDate = Math.max(...days.map((e) => e.date));
  return { peakDate, predicted: peakDate + luteal.mean };
}

// =========================================================================
// MARK: - Señal de síntomas (ajuste fino)
// =========================================================================

function signalsOf(log) {
  if (!log) return new Set();
  const s = new Set(log.symptoms || []);
  if (log.mood && PREMENSTRUAL_MOODS.has(log.mood)) s.add(log.mood);
  return s;
}

function analyzeSymptoms(logs, periodDates, basePredicted) {
  const daysUntilBase = basePredicted - nowDN();
  if (!(daysUntilBase >= 0 && daysUntilBase <= 10)) return { kind: 'none' };

  const t = todayDN();
  const recent = new Set([...signalsOf(logs[isoFromDN(t)]), ...signalsOf(logs[isoFromDN(t - 1)])]);
  const matches = [...recent].filter((s) => PREMENSTRUAL_ALL.has(s));
  if (!matches.length) return { kind: 'none' };

  const avgDaysBefore = historicalSymptomPattern(logs, periodDates);
  if (avgDaysBefore != null) {
    const adjustment = roundHalfAway(daysUntilBase - avgDaysBefore);
    return { kind: 'strong', adjustment: -adjustment };
  }
  return matches.length >= 2 ? { kind: 'weak' } : { kind: 'none' };
}

function historicalSymptomPattern(logs, periodDates) {
  if (periodDates.length < 2) return null;
  const offsets = [];
  for (const p of periodDates.slice(0, -1)) {
    for (let before = 1; before <= 14; before++) {
      const log = logs[isoFromDN(p - before)];
      if (!log) continue;
      if ([...signalsOf(log)].some((s) => PREMENSTRUAL_ALL.has(s))) offsets.push(before);
    }
  }
  if (!offsets.length) return null;
  return offsets.reduce((a, b) => a + b, 0) / offsets.length;
}

// =========================================================================
// MARK: - Ajuste por estrés y sueño
// =========================================================================

function analyzeStressAndSleep(logs, lastPeriodDate, follMean) {
  const start = lastPeriodDate + follMean - 5;
  const end = lastPeriodDate + follMean + 5;
  let stressDelay = 0;
  let sleepDelay = 0;
  for (const [k, log] of Object.entries(logs)) {
    const d = dnFromISO(k);
    if (d == null || d < start || d > end) continue;
    if (log.stressLevel?.toLowerCase() === 'alto') stressDelay += 0.5;
    if (log.sleepHours != null && log.sleepHours < 6) sleepDelay += 0.3;
  }
  return roundHalfAway(Math.min(3, stressDelay) + Math.min(2, sleepDelay));
}

// =========================================================================
// MARK: - Medicación
// =========================================================================

function analyzeMedications(meds) {
  const names = meds.map((m) => `${m.name} ${m.dose}`.toLowerCase());
  if (names.some((n) => CONTRACEPTIVE_KEYWORDS.some((k) => n.includes(k)))) return 'hormonalContraceptive';
  if (names.some((n) => HORMONAL_KEYWORDS.some((k) => n.includes(k)))) return 'otherHormonal';
  return 'none';
}

// =========================================================================
// MARK: - Alertas clínicas
// =========================================================================

export function clinicalAlerts(data) {
  const empty = { flags: [], esc: false };
  const periodDates = extractPeriodDates(data.settings, data.logs);
  if (periodDates.length < 3) return empty;

  const allLengths = [];
  for (let i = 1; i < periodDates.length; i++) allLengths.push(periodDates[i] - periodDates[i - 1]);
  const recent = allLengths.slice(-6);
  if (recent.length < 2) return empty;

  const maxLen = Math.max(...recent);
  const minLen = Math.min(...recent);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const sdVal = Math.sqrt(recent.reduce((a, x) => a + (x - mean) ** 2, 0) / recent.length);

  const flags = [];
  if (maxLen > Cfg.cycleMax) {
    flags.push({ severity: 'alta', text: 'Algún ciclo largo (más de 35 días): puede indicar falta de ovulación. Conviene descartar SOP o tiroides.' });
  }
  if (minLen < Cfg.cycleMin) {
    flags.push({ severity: 'alta', text: 'Algún ciclo corto (menos de 21 días): conviene una valoración ginecológica.' });
  }
  if (sdVal >= Cfg.irregularSD || (maxLen - minLen) > Cfg.irregularRange) {
    flags.push({ severity: 'media', text: 'Tus ciclos varían bastante de un mes a otro. Un chequeo puede dar tranquilidad.' });
  }

  const ovDates = extractOvulationDates(data.logs, periodDates);
  if (ovDates.length) {
    const { luteal } = learnPhases(periodDates, ovDates);
    if (luteal.n >= 2 && luteal.mean < Cfg.shortLuteal) {
      flags.push({ severity: 'media', text: 'Fase posterior a la ovulación corta (menos de 10 días). Puede dificultar la implantación.' });
    }
  }

  const esc = flags.some((f) => f.severity === 'alta') || flags.length >= 2;
  return { flags, esc };
}

// =========================================================================
// MARK: - Helpers
// =========================================================================

function periodQuality(count) {
  if (count <= 1) return 'insufficient';
  if (count <= 3) return 'low';
  if (count <= 5) return 'medium';
  return 'high';
}

function ovulationQuality(confirmed) {
  if (confirmed === 0) return 'insufficient';
  if (confirmed <= 2) return 'low';
  if (confirmed <= 5) return 'medium';
  return 'high';
}

function makeFallback(cycleLen) {
  const date = nowDN() + cycleLen;
  return {
    predictedDate: date, earliestDate: date, latestDate: date, confidenceDays: 0,
    follicularPhase: { mean: cycleLen / 2, sd: 3, n: 0 },
    lutealPhase: { mean: 14, sd: 1.5, n: 0 },
    periodCycleCount: 0, periodQuality: 'insufficient', ovulationQuality: 'insufficient',
    symptomSignal: { kind: 'none' }, medicationFlag: 'none', daysUntil: cycleLen,
    predictionBasis: 'statistical', lhPositiveDate: null, ovulationEstimate: null,
  };
}

// MARK: - Presentación

export function windowText(p) {
  if (p.confidenceDays === 0) return fmtDayMonthShort(p.predictedDate);
  return `${fmtDayMonthShort(p.earliestDate)} – ${fmtDayMonthShort(p.latestDate)}`;
}

export function predictionNotices(p) {
  const out = [];
  const s = p.symptomSignal;
  if (s.kind === 'weak') out.push('Síntomas premenstruales detectados');
  if (s.kind === 'strong') {
    const a = s.adjustment;
    const n = Math.abs(a);
    if (a < 0) out.push(`Los síntomas sugieren que podría llegar ${n} día${n === 1 ? '' : 's'} antes`);
    else if (a > 0) out.push(`Los síntomas sugieren que podría llegar ${a} día${a === 1 ? '' : 's'} después`);
    else out.push('Síntomas premenstruales detectados — predicción confirmada');
  }
  if (p.medicationFlag === 'hormonalContraceptive') {
    out.push('Anticonceptivos hormonales detectados: el sangrado puede ser de privación, no una regla natural');
  } else if (p.medicationFlag === 'otherHormonal') {
    out.push('Medicación hormonal detectada: puede afectar a la regularidad del ciclo');
  }
  return out;
}
