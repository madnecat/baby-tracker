import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { FrequencyChart } from '../components/FrequencyChart.jsx';
import { GrowthPercentileChart } from '../components/GrowthPercentileChart.jsx';
import { EVENT_COLORS, DIAPER_SUBTYPE_COLORS } from '../lib/palette.js';
import { aggregateByDay } from '../lib/aggregate.js';
import { ageInMonths } from '../lib/dateUtils.js';

const RANGES = [
  { label: '48h', days: 2 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export default function ChartsPage() {
  const [events, setEvents] = useState([]);
  const [growth, setGrowth] = useState([]);
  const [child, setChild] = useState(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listEvents(), api.listGrowth(), api.getChild()])
      .then(([e, g, c]) => {
        setEvents(e);
        setGrowth(g);
        setChild(c);
      })
      .finally(() => setLoading(false));
  }, []);

  const diaperData = useMemo(
    () =>
      aggregateByDay(
        events.filter((e) => e.type === 'diaper'),
        rangeDays,
        () => ({ wet: 0, dirty: 0 }),
        (acc, e) => ({
          wet: acc.wet + (e.details.wet ? 1 : 0),
          dirty: acc.dirty + (e.details.dirty ? 1 : 0),
        })
      ),
    [events, rangeDays]
  );

  const bottleData = useMemo(
    () =>
      aggregateByDay(
        events.filter((e) => e.type === 'bottle'),
        rangeDays,
        () => ({ volumeMl: 0 }),
        (acc, e) => ({ volumeMl: acc.volumeMl + (e.details.volumeMl || 0) })
      ),
    [events, rangeDays]
  );

  const breastfeedingData = useMemo(
    () =>
      aggregateByDay(
        events.filter((e) => e.type === 'breastfeeding' && e.endedAt),
        rangeDays,
        () => ({ minutes: 0 }),
        (acc, e) => ({
          minutes:
            acc.minutes + Math.round((new Date(e.endedAt) - new Date(e.startedAt)) / 60000),
        })
      ),
    [events, rangeDays]
  );

  const sleepData = useMemo(() => {
    const byMinutes = aggregateByDay(
      events.filter((e) => e.type === 'sleep' && e.endedAt),
      rangeDays,
      () => ({ minutes: 0 }),
      (acc, e) => ({
        minutes: acc.minutes + Math.round((new Date(e.endedAt) - new Date(e.startedAt)) / 60000),
      })
    );
    return byMinutes.map((row) => ({ day: row.day, hours: Math.round((row.minutes / 60) * 10) / 10 }));
  }, [events, rangeDays]);

  const growthPoints = useMemo(() => {
    if (!child) return { weight: [], height: [], headCircumference: [] };
    const weight = [];
    const height = [];
    const headCircumference = [];
    for (const g of growth) {
      const ageMonths = ageInMonths(child.dateOfBirth, g.measuredAt);
      if (g.weightKg != null) weight.push({ ageMonths, value: g.weightKg });
      if (g.heightCm != null) height.push({ ageMonths, value: g.heightCm });
      if (g.headCircumferenceCm != null)
        headCircumference.push({ ageMonths, value: g.headCircumferenceCm });
    }
    return { weight, height, headCircumference };
  }, [growth, child]);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1 className="page-title">Charts</h1>

      <div className="range-tabs">
        {RANGES.map((r) => (
          <button
            key={r.days}
            className={rangeDays === r.days ? 'active' : ''}
            onClick={() => setRangeDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <FrequencyChart
        title="Diaper changes / day"
        data={diaperData}
        series={[
          { key: 'wet', label: 'Wet', color: DIAPER_SUBTYPE_COLORS.wet },
          { key: 'dirty', label: 'Dirty', color: DIAPER_SUBTYPE_COLORS.dirty },
        ]}
      />
      <FrequencyChart
        title="Bottle volume / day"
        unitLabel="mL"
        data={bottleData}
        series={[{ key: 'volumeMl', label: 'Volume', color: EVENT_COLORS.bottle }]}
      />
      <FrequencyChart
        title="Breastfeeding minutes / day"
        unitLabel="min"
        data={breastfeedingData}
        series={[{ key: 'minutes', label: 'Minutes', color: EVENT_COLORS.breastfeeding }]}
      />
      <FrequencyChart
        title="Sleep hours / day"
        unitLabel="hrs"
        data={sleepData}
        series={[{ key: 'hours', label: 'Hours', color: EVENT_COLORS.sleep }]}
      />

      <h2 className="section-title">WHO growth percentiles</h2>
      {!child ? (
        <div className="empty-state">
          Set up your child's profile on the Growth page to see percentile charts.
        </div>
      ) : (
        <>
          <GrowthPercentileChart
            title="Weight-for-age"
            unit="kg"
            indicator="weight"
            sex={child.sex}
            childPoints={growthPoints.weight}
          />
          <GrowthPercentileChart
            title="Length/height-for-age"
            unit="cm"
            indicator="height"
            sex={child.sex}
            childPoints={growthPoints.height}
          />
          <GrowthPercentileChart
            title="Head circumference-for-age"
            unit="cm"
            indicator="headCircumference"
            sex={child.sex}
            childPoints={growthPoints.headCircumference}
          />
        </>
      )}
    </div>
  );
}
