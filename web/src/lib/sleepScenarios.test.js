/**
 * Checks that every named scenario really produces what it says it does.
 *
 * This is what keeps the manual walkthrough honest: the guide tells a human to open the app and
 * look for "Settled nap regime" or "Past the usual window", and these assertions are the promise
 * that the engine actually gets there. A scenario whose description stops matching the code fails
 * here rather than wasting someone's time in front of a screen.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { predictNextSleep, sleepStats } from './sleep.js';
import { SLEEP_SCENARIOS, scenarioChild } from './sleepScenarios.js';

const NOW = new Date(2026, 5, 15, 14, 30, 0).getTime();

describe('named scenarios', () => {
  for (const [name, scenario] of Object.entries(SLEEP_SCENARIOS)) {
    it(`${name}: ${scenario.summary}`, () => {
      const events = scenario.build(NOW);
      const child = scenarioChild(name, NOW);
      const p = predictNextSleep(events, child, NOW);
      const e = scenario.expect;

      if (e.state) assert.equal(p.state, e.state, `state for "${name}"`);
      if (e.phase) assert.equal(p.phase, e.phase, `phase for "${name}"`);
      if (e.phaseBelow) assert.ok(p.phase < e.phaseBelow, `expected phase below ${e.phaseBelow}, got ${p.phase}`);
      if (e.source) assert.equal(p.basis.source, e.source, `basis source for "${name}"`);
      if (e.confidence) assert.equal(p.confidence, e.confidence, `confidence for "${name}"`);
      if (e.disturbed !== undefined) assert.equal(p.disturbed, e.disturbed, `disturbed for "${name}"`);
      if (e.pastTypical !== undefined) assert.equal(!!p.pastTypical, e.pastTypical, `pastTypical for "${name}"`);
      if (e.staleHistory) assert.equal(p.staleHistory, true);
      if (e.suspectRunningSleep) assert.equal(p.suspectRunningSleep, true);
      if (e.lowQuality !== undefined) {
        assert.equal(p.dataQuality.lowQuality, e.lowQuality, `data quality for "${name}"`);
      }
      if (e.hasNightWindow) assert.ok(p.nightWindow, `expected a derived night window for "${name}"`);
      if (e.naps) assert.equal(p.napRegime?.naps, e.naps, `nap count for "${name}"`);

      // Any scenario that renders a range must render it the right way round.
      if (e.rangeOrdered || p.from != null) {
        if (p.from != null) assert.ok(p.to > p.from, `range is inverted for "${name}"`);
      }

      // A forgotten timer must not take the rest of the day's sleep down with it.
      if (e.statsSurvive) {
        const stats = sleepStats(events, child, NOW);
        assert.ok(stats.rolling24 > 6 * 60, `stats collapsed for "${name}": ${stats.rolling24} min`);
        assert.ok(stats.sleepCount24 > 2, `sleep count collapsed for "${name}"`);
      }
    });
  }

  it('every scenario is described for the person doing the manual pass', () => {
    for (const [name, scenario] of Object.entries(SLEEP_SCENARIOS)) {
      assert.ok(scenario.describe?.length >= 2, `"${name}" needs a description of what to look for`);
      assert.ok(scenario.summary, `"${name}" needs a summary`);
      assert.ok(Object.keys(scenario.expect).length > 0, `"${name}" asserts nothing`);
    }
  });

  it('teething and regression differ in exactly the way that matters', () => {
    // The pair that justifies the whole hysteresis design: the same broken nights, one temporary
    // and one permanent, must end up in different phases.
    const teething = SLEEP_SCENARIOS.teething;
    const regression = SLEEP_SCENARIOS.regression;
    const a = predictNextSleep(teething.build(NOW), scenarioChild('teething', NOW), NOW);
    const b = predictNextSleep(regression.build(NOW), scenarioChild('regression', NOW), NOW);

    assert.equal(a.phase, 3, 'a passing disturbance must not cost the phase');
    assert.ok(b.phase < 3, 'a permanent regression must eventually cost it');
    assert.equal(a.disturbed, true);
    assert.equal(b.disturbed, false, 'a new normal is not a shock');
  });

  it('a disturbance widens the window rather than narrowing what it claims', () => {
    const calm = predictNextSleep(
      SLEEP_SCENARIOS['naps-settled'].build(NOW),
      scenarioChild('naps-settled', NOW),
      NOW
    );
    const shaken = predictNextSleep(
      SLEEP_SCENARIOS.teething.build(NOW),
      scenarioChild('teething', NOW),
      NOW
    );
    if (calm.from != null && shaken.from != null) {
      assert.ok(
        shaken.to - shaken.from > calm.to - calm.from,
        'the disturbed window should be wider'
      );
    }
  });
});
