/**
 * Renders the sleep card and the Charts sleep section for every scenario and prints the text they
 * produce. Run with `npm run check:render` from web/.
 *
 * This exists because the gap between "the engine returns state: overdue" and "the parent reads
 * something sensible" is where the copy bugs live, and neither the unit tests nor the Vite build
 * can see into it. Its first run found two: a card announcing "In about 0 min", and a child of
 * exactly three weeks rendering as two.
 *
 * It is a reading tool, not an assertion suite — the point is to look at the output. `node --test`
 * stays dependency-free and JSX-free; this one needs esbuild, which Vite already brings in.
 */

import { renderToStaticMarkup } from 'react-dom/server';

import { NextSleepCard } from '../src/components/NextSleepCard.jsx';
import { SleepSection } from '../src/components/SleepSection.jsx';
import { SLEEP_SCENARIOS, scenarioChild } from '../src/lib/sleepScenarios.js';

/** Strips tags so the result reads like what someone would see, in order, on the screen. */
function asText(html) {
  return html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ');
}

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(SLEEP_SCENARIOS);
const now = Date.now();
let failures = 0;

for (const name of names) {
  const scenario = SLEEP_SCENARIOS[name];
  if (!scenario) {
    console.error(`Unknown scenario "${name}"`);
    failures += 1;
    continue;
  }

  const events = scenario.build(now);
  const child = scenarioChild(name, now);

  console.log(`\n=== ${name} — ${scenario.summary}`);
  for (const [label, element] of [
    ['CARD  ', <NextSleepCard events={events} child={child} loading={false} />],
    ['CHARTS', <SleepSection events={events} child={child} />],
  ]) {
    try {
      console.log(`${label}: ${asText(renderToStaticMarkup(element))}`);
    } catch (e) {
      console.log(`${label}: RENDER ERROR — ${e.message}`);
      failures += 1;
    }
  }
  console.log('EXPECT:');
  for (const line of scenario.describe) console.log(`  - ${line}`);
}

if (failures > 0) {
  console.error(`\n${failures} scenario(s) failed to render.`);
  process.exit(1);
}
