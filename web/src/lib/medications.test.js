import { withLocale } from '../i18n/testSetup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDICATION_PRESETS,
  getCustomPresets,
  getMedicationNames,
  getMedicationStatus,
  lastDoseFor,
  loggedMedicationNames,
  medicationDisplayName,
  medicationWho,
  medicationsFor,
  nextDoseInfo,
  presetWarning,
} from './medications.js';

const AT = Date.parse('2026-10-03T10:00:00.000Z');
const HOUR = 3600000;

test('status lines in English', () => {
  assert.equal(getMedicationStatus(null, AT).sub, 'Not logged recently');
  const d = { startedAt: new Date(AT - HOUR).toISOString(), details: { intervalHours: 6 } };
  assert.match(getMedicationStatus(d, AT).sub, /^Wait 5h 0m \(until \d\d:\d\d\)$/);
  assert.equal(getMedicationStatus(d, AT + 6 * HOUR).sub, 'Safe to take now');
  assert.equal(getMedicationStatus({ startedAt: d.startedAt, details: {} }, AT).sub, 'Logged (interval unknown)');
  const short = { startedAt: new Date(AT - 5.5 * HOUR).toISOString(), details: { intervalHours: 6 } };
  assert.match(getMedicationStatus(short, AT).sub, /^Wait 30m /);
  assert.match(nextDoseInfo(d, AT).label, /^Next dose safe from \w{3} \d{1,2} \w{3}, \d\d:\d\d$/);
});

test('status lines in French', () => {
  withLocale('fr', () => {
    assert.equal(getMedicationStatus(null, AT).sub, 'Aucune prise récente');
    const d = { startedAt: new Date(AT - HOUR).toISOString(), details: { intervalHours: 6 } };
    assert.match(getMedicationStatus(d, AT).sub, /^Attendre 5\u00A0h 0\u00A0min \(jusqu’à \d\d:\d\d\)$/);
    assert.equal(getMedicationStatus(d, AT + 6 * HOUR).sub, 'Prise possible maintenant');
    assert.match(nextDoseInfo(d, AT).label, /^Prochaine prise possible\u00A0: /);
  });
});

test('preset display names are translated, custom and unknown names are untouched', () => {
  assert.equal(medicationDisplayName('Paracetamol'), 'Paracetamol');
  withLocale('fr', () => {
    assert.equal(medicationDisplayName('Paracetamol'), 'Paracétamol');
    assert.equal(medicationDisplayName('Co-codamol (codeine)'), 'Co-codamol (codéine)');
    assert.equal(medicationDisplayName('Calpol'), 'Calpol');
  });
  // stored identifiers never change
  assert.deepEqual(MEDICATION_PRESETS.map((p) => p.name), [
    'Paracetamol', 'Ibuprofen', 'Diclofenac', 'Dihydrocodeine', 'Co-codamol (codeine)',
  ]);
});

test('warnings resolve at call time and co-codamol stays an explicit "against"', () => {
  const coco = MEDICATION_PRESETS.find((p) => p.key === 'co-codamol');
  assert.match(presetWarning(coco), /AGAINST codeine/);
  assert.match(coco.warning, /AGAINST codeine/);
  withLocale('fr', () => assert.match(presetWarning(coco), /NE PAS prendre de codéine/));
  assert.equal(presetWarning(MEDICATION_PRESETS[0]), null);
});

const dose = (id, name, who, extra = {}) => ({
  id,
  startedAt: '2026-10-03T10:00:00.000Z',
  details: { name, ...(who ? { who } : {}), intervalHours: 6, ...extra },
});

test('doses without `who` (legacy) belong to mum; only exact "baby" is baby', () => {
  assert.equal(medicationWho(dose(1, 'Paracetamol')), 'mom');
  assert.equal(medicationWho(dose(2, 'Paracetamol', 'mom')), 'mom');
  assert.equal(medicationWho(dose(3, 'Vitamin D', 'baby')), 'baby');
  assert.equal(medicationWho(dose(4, 'x', 'Baby')), 'mom');
});

test('medicationsFor splits by person and keeps order', () => {
  const events = [dose(1, 'Vitamin D', 'baby'), dose(2, 'Ibuprofen'), dose(3, 'Calpol', 'baby')];
  assert.deepEqual(medicationsFor(events, 'baby').map((e) => e.id), [1, 3]);
  assert.deepEqual(medicationsFor(events, 'mom').map((e) => e.id), [2]);
});

test('same name for baby and mum never shares a cooldown', () => {
  const events = [dose(1, 'Paracetamol', 'baby'), dose(2, 'Paracetamol')];
  assert.equal(lastDoseFor(medicationsFor(events, 'mom'), 'Paracetamol').id, 2);
  assert.equal(lastDoseFor(medicationsFor(events, 'baby'), 'Paracetamol').id, 1);
});

test('baby has no built-in presets; mum keeps hers', () => {
  assert.deepEqual(getMedicationNames([], 'baby'), []);
  assert.ok(getMedicationNames([], 'mom').includes('Ibuprofen'));
  const babyEvents = [dose(1, 'Ibuprofen', 'baby', { doseAmount: 2.5, doseUnit: 'mL' })];
  assert.deepEqual(loggedMedicationNames(babyEvents, 'baby'), ['Ibuprofen']);
  const presets = getCustomPresets(babyEvents, 'baby');
  assert.equal(presets.length, 1);
  assert.equal(presets[0].doseUnit, 'mL');
  assert.equal(getCustomPresets(babyEvents, 'mom').length, 0);
});
