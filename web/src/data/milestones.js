// UK-based milestones (with French consulate steps for dual-nationality children).
// Offsets are days from date of birth. Where no single legal deadline exists,
// the offset is a sensible target, not a hard rule — see each description.
// This is not legal or medical advice; verify current requirements for your situation.

export const MILESTONE_CATEGORIES = {
  'baby-admin': { label: 'Baby — Admin', color: { light: '#2a78d6', dark: '#3987e5' } },
  'baby-medical': { label: 'Baby — Medical', color: { light: '#1baf7a', dark: '#199e70' } },
  nationality: { label: 'French nationality', color: { light: '#eda100', dark: '#c98500' } },
  mom: { label: 'Mum', color: { light: '#e87ba4', dark: '#d55181' } },
  development: { label: 'Baby — Development', color: { light: '#008300', dark: '#008300' } },
};

export const MILESTONES = [
  {
    key: 'red-book',
    title: 'Personal Child Health Record ("Red Book")',
    category: 'baby-admin',
    offsetDays: 0,
    description:
      'Given to you by your midwife at birth. Keep it safe and bring it to every appointment — it\'s used to record checks, growth, and vaccinations.',
  },
  {
    key: 'blood-spot-test',
    title: 'Newborn blood spot (heel prick) test',
    category: 'baby-medical',
    offsetDays: 5,
    description:
      'Ideally done at 5 days old, usually by a midwife. Screens for several rare but serious conditions.',
  },
  {
    key: 'register-gp',
    title: 'Register baby with a GP',
    category: 'baby-admin',
    offsetDays: 14,
    description:
      "No fixed legal deadline, but do it early so baby is covered for routine checks and vaccinations.",
  },
  {
    key: 'hearing-screening',
    title: 'Newborn hearing screening',
    category: 'baby-medical',
    offsetDays: 28,
    description:
      'Often done in hospital before you go home. If not, should be offered before 4-5 weeks (can be done up to 3 months).',
  },
  {
    key: 'register-birth',
    title: 'Register the birth (council register office)',
    category: 'baby-admin',
    offsetDays: 10,
    description:
      "Legal deadline is 42 days (21 in Scotland), but if you want the fast French route below (déclaration within 15 days), get this done well before day 15 — you need the UK birth certificate in hand before your Consulate appointment.",
  },
  {
    key: 'vaccines-8w',
    title: 'Vaccinations — 8 weeks',
    category: 'baby-medical',
    offsetDays: 56,
    description: '6-in-1, Rotavirus, and MenB (all 1st doses).',
  },
  {
    key: '6-8-week-review',
    title: '6-8 week baby review + your postnatal check',
    category: 'mom',
    offsetDays: 42,
    description:
      'Baby\'s development check and your own postnatal check-up with the GP — can be done together, any time up to 8 weeks.',
  },
  {
    key: 'pelvic-floor-physio',
    title: 'Book pelvic floor / perineal physio',
    category: 'mom',
    offsetDays: 28,
    description:
      'Worth booking even without obvious symptoms — daily pelvic floor exercises take 3-6 months to show benefit, so starting early helps regardless. (If going private, no fixed deadline; if going via the NHS, self-referral is only available up to 6 weeks postnatal — after that it needs a GP referral.)',
  },
  {
    key: 'healthy-start',
    title: 'Check Healthy Start scheme eligibility',
    category: 'baby-admin',
    offsetDays: 30,
    description:
      'Means-tested UK scheme for help buying food/milk/vitamins. Worth checking early — apply on gov.uk if eligible.',
  },
  {
    key: 'child-benefit',
    title: 'Claim Child Benefit',
    category: 'baby-admin',
    offsetDays: 90,
    description:
      'Can only be backdated up to 3 months, so claiming within 3 months of birth avoids losing money.',
  },
  {
    key: 'vaccines-12w',
    title: 'Vaccinations — 12 weeks',
    category: 'baby-medical',
    offsetDays: 84,
    description: '6-in-1 (2nd dose), Pneumococcal (1st dose), Rotavirus (2nd dose).',
  },
  {
    key: 'vaccines-16w',
    title: 'Vaccinations — 16 weeks',
    category: 'baby-medical',
    offsetDays: 112,
    description: '6-in-1 (3rd dose), MenB (2nd dose), Hib/MenC (1st dose).',
  },
  {
    key: 'french-birth-declaration',
    title: 'French Consulate appointment — déclaration de naissance',
    category: 'nationality',
    offsetDays: 8,
    description:
      "HARD DEADLINE: day 15 — after that this route closes and you're stuck with the slow transcription instead (see below). This is the fast path: an in-person appointment at the Consulate (uk.diplomatie.gouv.fr), not a postal transcription — bring the UK birth certificate plus the married/unmarried-parents form and its supporting documents. No processing wait quoted for this route; you get the French birth certificate directly from it. Book the appointment as early as possible — slots can take time to get, so don't wait until day 14 to start looking.",
  },
  {
    key: 'consulate-transcription-fallback',
    title: '(Fallback only) Postal transcription if the 15-day window is missed',
    category: 'nationality',
    offsetDays: 16,
    description:
      "Only relevant if you didn't manage the in-person déclaration above before day 15. Postal transcription of the UK birth certificate into French civil records: ~2 months if you're married, ~4 months if not (uk.diplomatie.gouv.fr). Free, sent by post, no online option.",
  },
  {
    key: 'passport-uk',
    title: "Apply for baby's UK passport",
    category: 'baby-admin',
    offsetDays: 90,
    description: 'No fixed deadline — needed before any international travel. Apply on gov.uk.',
  },
  {
    key: 'vaccines-1y',
    title: 'Vaccinations — 1 year',
    category: 'baby-medical',
    offsetDays: 365,
    description: 'MMR(V), Pneumococcal (2nd dose), MenB (3rd dose).',
  },
  {
    key: 'passport-french',
    title: "Apply for baby's French passport / CNI",
    category: 'nationality',
    offsetDays: 21,
    description:
      "If you got the fast déclaration done by day 15, this could follow within a few weeks once the livret de famille is issued — but I haven't verified the Consulate's actual passport/CNI processing time, so don't treat this date as reliable. Check uk.diplomatie.gouv.fr or ask at your déclaration appointment what to expect. (If you ended up on the fallback transcription route instead, this obviously follows that timeline instead — 2-4 months out.)",
  },
  {
    key: 'vaccines-18m',
    title: 'Vaccinations — 18 months',
    category: 'baby-medical',
    offsetDays: 548,
    description: 'Part of the routine schedule — check with your GP for the current vaccines due.',
  },
  {
    key: 'vaccines-3y4m',
    title: 'Vaccinations — 3 years 4 months',
    category: 'baby-medical',
    offsetDays: 1217,
    description: 'Pre-school booster — check with your GP for the current vaccines due.',
  },

  // Growth spurts: commonly cited pediatric guidance (not an NHS-specific schedule like the
  // vaccines above) — short, few-day bursts of increased hunger/fussiness/sleep disruption
  // around these ages. Completely normal to miss or not notice one; nothing to act on.
  {
    key: 'growth-spurt-3w',
    title: 'Possible growth spurt — ~2-3 weeks',
    category: 'development',
    offsetDays: 17,
    description:
      'Commonly reported window for a short (24-48h) growth spurt: baby feeds more, sleeps less, fussier than usual. Not every baby has a noticeable one — nothing to worry about either way.',
  },
  {
    key: 'growth-spurt-6w',
    title: 'Possible growth spurt — ~6 weeks',
    category: 'development',
    offsetDays: 42,
    description: 'Same pattern as above: more feeding, less settled, for a few days.',
  },
  {
    key: 'growth-spurt-3m',
    title: 'Possible growth spurt — ~3 months',
    category: 'development',
    offsetDays: 90,
    description: 'Same pattern as above.',
  },
  {
    key: 'growth-spurt-6m',
    title: 'Possible growth spurt — ~6 months',
    category: 'development',
    offsetDays: 180,
    description: 'Same pattern as above — often coincides with weaning readiness.',
  },
  {
    key: 'growth-spurt-9m',
    title: 'Possible growth spurt — ~9 months',
    category: 'development',
    offsetDays: 270,
    description: 'Same pattern as above.',
  },

  // Developmental milestones: NHS-sourced average ages with the normal range in the
  // description — huge individual variation is expected, "give or take a month or two"
  // per NHS guidance. These are not deadlines; check them off whenever it actually happens.
  {
    key: 'dev-social-smile',
    title: 'Social smile',
    category: 'development',
    offsetDays: 42,
    description: 'Typically starts around 6-8 weeks. Wide normal variation — not a deadline.',
  },
  {
    key: 'dev-rolling',
    title: 'Rolling over',
    category: 'development',
    offsetDays: 152,
    description: 'NHS-cited average ~5 months, normal range 2-10 months.',
  },
  {
    key: 'dev-sitting',
    title: 'Sitting unsupported',
    category: 'development',
    offsetDays: 213,
    description: 'NHS-cited average ~7 months, normal range 6-8 months.',
  },
  {
    key: 'dev-crawling',
    title: 'Crawling',
    category: 'development',
    offsetDays: 335,
    description: 'NHS-cited average ~11 months, normal range 9-12 months. Some babies skip crawling entirely and go straight to walking — also normal.',
  },
  {
    key: 'dev-walking',
    title: 'Walking alone',
    category: 'development',
    offsetDays: 426,
    description: 'NHS-cited average ~14 months, normal range 10-18 months.',
  },
];
