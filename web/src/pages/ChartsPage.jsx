import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { FrequencyChart } from '../components/FrequencyChart.jsx';
import { GrowthPercentileChart } from '../components/GrowthPercentileChart.jsx';
import { SleepSection } from '../components/SleepSection.jsx';
import { FeedInsightsCard } from '../components/FeedInsightsCard.jsx';
import { EVENT_COLORS, DIAPER_SUBTYPE_COLORS } from '../lib/palette.js';
import { aggregateByDay } from '../lib/aggregate.js';
import { sleepStats } from '../lib/sleep.js';
import { ageInMonths, formatDayShort } from '../lib/dateUtils.js';
import { t } from '../i18n/index.js';

// Labels are catalog keys (with the number as a placeholder), resolved when rendered.
const RANGES = [
  { labelKey: 'chartsPage.range.hours', n: 48, days: 2 },
  { labelKey: 'chartsPage.range.days', n: 7, days: 7 },
  { labelKey: 'chartsPage.range.days', n: 30, days: 30 },
  { labelKey: 'chartsPage.range.days', n: 90, days: 90 },
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

  /**
   * Sleep is the one event type that routinely crosses midnight, so unlike the charts above it
   * cannot be bucketed by the day it started on — that hands a 23:10 -> 02:40 stretch entirely to
   * the earlier day and overstates it by hours. sleepStats clips each stretch at local midnight
   * (and merges any overlapping entries first), which is also what the Sleep section below reports,
   * so the two never disagree on the same page.
   */
  const sleepData = useMemo(
    () =>
      sleepStats(events, child, Date.now(), rangeDays).perDay.map((row) => ({
        day: formatDayShort(row.dayStart),
        hours: Math.round((row.minutes / 60) * 10) / 10,
      })),
    [events, child, rangeDays]
  );

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

  if (loading) return <p>{t('common.loading')}</p>;

  return (
    <div>
      <h1 className="page-title">{t('chartsPage.title')}</h1>

      <div className="range-tabs">
        {RANGES.map((r) => (
          <button
            key={r.days}
            className={rangeDays === r.days ? 'active' : ''}
            onClick={() => setRangeDays(r.days)}
          >
            {t(r.labelKey, { n: r.n })}
          </button>
        ))}
      </div>

      <FrequencyChart
        title={t('chartsPage.diaper.title')}
        data={diaperData}
        series={[
          { key: 'wet', label: t('chartsPage.diaper.wet'), color: DIAPER_SUBTYPE_COLORS.wet },
          { key: 'dirty', label: t('chartsPage.diaper.dirty'), color: DIAPER_SUBTYPE_COLORS.dirty },
        ]}
      />
      <FrequencyChart
        title={t('chartsPage.bottle.title')}
        unitLabel={t('chartsPage.unit.ml')}
        data={bottleData}
        series={[{ key: 'volumeMl', label: t('chartsPage.bottle.series'), color: EVENT_COLORS.bottle }]}
      />
      <FrequencyChart
        title={t('chartsPage.breastfeeding.title')}
        unitLabel={t('chartsPage.unit.min')}
        data={breastfeedingData}
        series={[{ key: 'minutes', label: t('chartsPage.breastfeeding.series'), color: EVENT_COLORS.breastfeeding }]}
      />
      <FeedInsightsCard events={events} />
      <FrequencyChart
        title={t('chartsPage.sleep.title')}
        unitLabel={t('chartsPage.unit.hours')}
        data={sleepData}
        series={[{ key: 'hours', label: t('chartsPage.sleep.series'), color: EVENT_COLORS.sleep }]}
      />

      <SleepSection events={events} child={child} />

      <h2 className="section-title">{t('chartsPage.who.title')}</h2>
      {!child ? (
        <div className="empty-state">
          {t('chartsPage.who.noChild')}
        </div>
      ) : (
        <>
          <GrowthPercentileChart
            title={t('chartsPage.who.weight')}
            unit={t('chartsPage.unit.kg')}
            indicator="weight"
            sex={child.sex}
            childPoints={growthPoints.weight}
          />
          <GrowthPercentileChart
            title={t('chartsPage.who.height')}
            unit={t('chartsPage.unit.cm')}
            indicator="height"
            sex={child.sex}
            childPoints={growthPoints.height}
          />
          <GrowthPercentileChart
            title={t('chartsPage.who.head')}
            unit={t('chartsPage.unit.cm')}
            indicator="headCircumference"
            sex={child.sex}
            childPoints={growthPoints.headCircumference}
          />
        </>
      )}
    </div>
  );
}
