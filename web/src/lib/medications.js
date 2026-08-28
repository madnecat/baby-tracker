// Standard adult dosing intervals from NHS-published sources. Not medical advice —
// always follow your own prescription or the packet instructions instead if they differ.
export const MEDICATION_PRESETS = [
  { key: 'paracetamol', name: 'Paracetamol', doseAmount: 1, doseUnit: 'g', intervalHours: 4 },
  { key: 'ibuprofen', name: 'Ibuprofen', doseAmount: 400, doseUnit: 'mg', intervalHours: 6 },
  {
    key: 'diclofenac',
    name: 'Diclofenac',
    doseAmount: 100,
    doseUnit: 'mg',
    intervalHours: 12,
    warning:
      'Max 150mg per 24h. Often only continued short-term after a hospital dose — check with your midwife/GP before repeating at home.',
  },
  {
    key: 'dihydrocodeine',
    name: 'Dihydrocodeine',
    doseAmount: 30,
    doseUnit: 'mg',
    intervalHours: 6,
    warning:
      'An opioid — NHS guidance says it can be used short-term while breastfeeding, with caution. Watch baby for unusual sleepiness, feeding difficulty, or breathing changes, and use the lowest effective dose for the shortest time.',
  },
  {
    key: 'co-codamol',
    name: 'Co-codamol (codeine)',
    doseAmount: null,
    doseUnit: null,
    intervalHours: 6,
    warning:
      'NHS/MHRA advise AGAINST codeine while breastfeeding — around 3% of people are "ultra-rapid metabolisers" and pass unsafe amounts to their baby through milk, which has caused serious harm in rare cases. If you\'ve been prescribed this, talk to your GP/midwife about dihydrocodeine or paracetamol/ibuprofen instead.',
  },
];
