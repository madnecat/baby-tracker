import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCustomPresets,
  getMedicationNames,
  lastDoseFor,
  loggedMedicationNames,
  medicationWho,
  medicationsFor,
} from './medications.js';

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
