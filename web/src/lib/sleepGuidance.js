/**
 * Reference values for infant sleep, and the tunable constants the phase engine runs on.
 * Data only — no logic lives here, so every number is in one place and quotable.
 *
 * Not medical advice. These are population averages used to make a guess in the absence of the
 * child's own data; the child's own logged sleep always outweighs them once there is enough of it
 * (see the shrinkage in sleep.js).
 *
 * Sources:
 * - Wake windows by age: Cleveland Clinic, "Wake Windows by Age"
 *   https://health.clevelandclinic.org/wake-windows-by-age
 * - Total sleep per 24h: AASM/AAP consensus (4-12 months: 12-16h) and the NSF ranges either side.
 * - Night-sleep consolidation over the first year, and the decline of napping: Iglowstein, Jenni,
 *   Molinari & Largo, "Sleep Duration From Infancy to Adolescence: Reference Values and
 *   Generational Trends", Pediatrics 111(2):302-307, 2003 (Zurich Longitudinal Studies, n=493).
 *   https://pubmed.ncbi.nlm.nih.gov/12563055/
 *   Caveat worth remembering when comparing against logged data: Iglowstein measures parent-reported
 *   *time in bed*, not actigraphy, so it runs slightly longer than logged sleep.
 */

/** Awake time between sleeps, in minutes, by age. `maxWeeks` is exclusive. */
export const WAKE_WINDOWS_BY_AGE = [
  { maxWeeks: 4, min: 30, max: 60 },
  { maxWeeks: 8, min: 45, max: 75 },
  { maxWeeks: 12, min: 60, max: 90 },
  { maxWeeks: 16, min: 75, max: 120 },
  { maxWeeks: 24, min: 105, max: 150 },
  { maxWeeks: 36, min: 150, max: 210 },
  { maxWeeks: 52, min: 180, max: 240 },
  { maxWeeks: 78, min: 240, max: 360 },
  { maxWeeks: Infinity, min: 300, max: 420 },
];

/** Total sleep per 24h, in hours, by age. `maxMonths` is exclusive. */
export const TOTAL_SLEEP_BY_AGE = [
  { maxMonths: 4, min: 14, max: 17 },
  { maxMonths: 12, min: 12, max: 16 },
  { maxMonths: 24, min: 11, max: 14 },
  { maxMonths: Infinity, min: 10, max: 13 },
];

/** Age-appropriate wake window (minutes) for a given age in weeks. */
export function wakeWindowBaseline(ageWeeks) {
  const row = WAKE_WINDOWS_BY_AGE.find((r) => ageWeeks < r.maxWeeks) ?? WAKE_WINDOWS_BY_AGE.at(-1);
  return { min: row.min, max: row.max, mid: (row.min + row.max) / 2 };
}

/** Target total sleep (minutes per 24h) for a given age in months. */
export function totalSleepTarget(ageMonths) {
  const row = TOTAL_SLEEP_BY_AGE.find((r) => ageMonths < r.maxMonths) ?? TOTAL_SLEEP_BY_AGE.at(-1);
  return { min: row.min * 60, max: row.max * 60, mid: ((row.min + row.max) / 2) * 60 };
}

/**
 * Every constant the phase-2 and phase-3 detectors depend on, in one block.
 *
 * NONE OF THESE ARE CALIBRATED against this child, or against any real dataset. They are stated
 * relative to the child's own distribution wherever possible precisely so that there is as little
 * left to calibrate as possible — a ratio against her own median needs no tuning for a baby who
 * sleeps a lot or a little, whereas "5 hours" would.
 *
 * `sleep.test.js` sweeps the sensitive ones across a range and asserts that phase detection stays
 * correct throughout, so what matters is that the answer does not sit on a cliff edge, not that
 * any single value here is right. Re-tune from this block once there are real months of data.
 */
export const PROVISIONAL_TUNABLES = {
  // Phase 2: a night has consolidated when the longest nocturnal stretch dwarfs the day's other
  // sleeps. Relative, so it needs no absolute hours — the floor only rules out the degenerate case
  // where every sleep is tiny and a ratio would trip on noise.
  nightConsolidationRatio: 2,
  nightConsolidationFloorMinutes: 180,
  nightConsolidationDaysRequired: 5, // out of the trailing 7
  phase2MinAgeWeeks: 8, // melatonin output does not really start before ~8-12 weeks

  // Phase 3: a nap regime exists when the nap count stops moving.
  // Naps/day over the trailing 7 days. Deliberately just under 0.5: a week evenly mixed between
  // 3-nap and 2-nap days has a standard deviation of exactly 0.5, so anything at or above that
  // could never register a 3->2 transition as unsettled, which is the whole point of measuring it.
  napRegimeMaxStdDev: 0.45,
  // Days *with data* needed in the trailing 7 to judge the regime at all. Below 7 on purpose: a
  // single unlogged day — one holiday, one flat phone — would otherwise make the check impossible
  // to satisfy for a whole week and silently hold the child in phase 2.
  napRegimeDaysRequired: 5,
  phase3MinAgeWeeks: 16,

  // Hysteresis. Deliberately asymmetric: easy to earn a phase, hard to lose one, because teething,
  // travel and growth spurts all look exactly like losing it.
  demotionFailingDaysRequired: 13, // out of the trailing 14 non-disturbed days
  demotionWindowDays: 14,

  // Disturbance: a robust z-score of the last 3 days against the previous 10, in MAD units.
  // While disturbed the phase is frozen, the demotion counter is suspended, and bands widen.
  ruptureMadThreshold: 3,
  ruptureRecentDays: 3,
  ruptureBaselineDays: 10,
  disturbedBandMultiplier: 1.5,

  // Phase 2+ only: a short nap is an incomplete sleep cycle, so the next wake window shortens.
  // Huckleberry's own docs describe a threshold right at 30 minutes.
  shortNapMinutes: 30,
  shortNapPenalty: 0.85,

  // Phase 2+ only: latest local hour a nap should be predicted to start, by age in weeks.
  // Past it, the next sleep predicted is the night, not another nap.
  napCutoffHourByAge: [
    { maxWeeks: 26, hour: 17.5 },
    { maxWeeks: 52, hour: 16.5 },
    { maxWeeks: Infinity, hour: 15.5 },
  ],

  // Phase 2+ only: only speak in terms of a time-of-day effect once the slots genuinely differ.
  slotVarianceRatioRequired: 1.5,
};

/** Latest local hour at which predicting another nap still makes sense (phase 2+). */
export function napCutoffHour(ageWeeks) {
  const row =
    PROVISIONAL_TUNABLES.napCutoffHourByAge.find((r) => ageWeeks < r.maxWeeks) ??
    PROVISIONAL_TUNABLES.napCutoffHourByAge.at(-1);
  return row.hour;
}
