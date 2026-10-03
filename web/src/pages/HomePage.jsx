import { useEffect, useMemo, useState } from 'react';
import { EventTile } from '../components/EventTile.jsx';
import { TimerTile } from '../components/TimerTile.jsx';
import { OutingTile } from '../components/OutingTile.jsx';
import { FeedingTile } from '../components/FeedingTile.jsx';
import { MedicationTile } from '../components/MedicationTile.jsx';
import { DiaperSheet } from '../components/DiaperSheet.jsx';
import { TemperatureSheet } from '../components/TemperatureSheet.jsx';
import { MedicationSheet } from '../components/MedicationSheet.jsx';
import { NextSleepCard } from '../components/NextSleepCard.jsx';
import { GrowthSheet } from '../components/GrowthSheet.jsx';
import { api } from '../api/client.js';
import { EVENT_COLORS } from '../lib/palette.js';
import {
  MEDICATION_PRESETS,
  getCustomPresets,
  medicationDisplayName,
  medicationsFor,
} from '../lib/medications.js';
import { t } from '../i18n/index.js';

export default function HomePage() {
  const [subject, setSubject] = useState('baby');
  const [openSheet, setOpenSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [medicationEvents, setMedicationEvents] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [child, setChild] = useState(undefined);
  const [sleepLoading, setSleepLoading] = useState(true);
  const [sleepError, setSleepError] = useState(false);

  function loadMedicationEvents() {
    api.listEvents({ type: 'medication' }).then(setMedicationEvents);
  }

  /**
   * One request, and deliberately not filtered by type: the sleep card's missing-log audit
   * corroborates long wake windows against feeds and nappy changes, so it needs those too. The
   * 22-day span covers the phase engine's 14-day hysteresis window with room to spare while
   * keeping the most-opened screen in the app off a full-history download.
   */
  function loadRecentEvents() {
    const from = new Date(Date.now() - 22 * 86400000).toISOString();
    api
      .listEvents({ from })
      .then((events) => {
        setRecentEvents(events);
        setSleepError(false);
      })
      // Without this the card would state "not enough sleep logged yet" on a failed request,
      // which is a confident claim about the data rather than about the network.
      .catch(() => setSleepError(true))
      .finally(() => setSleepLoading(false));
  }

  useEffect(loadMedicationEvents, []);
  useEffect(loadRecentEvents, []);
  useEffect(() => {
    api
      .getChild()
      .then(setChild)
      .catch(() => setChild(null));
  }, []);

  const momMedicationEvents = useMemo(() => medicationsFor(medicationEvents, 'mom'), [medicationEvents]);
  const babyMedicationEvents = useMemo(() => medicationsFor(medicationEvents, 'baby'), [medicationEvents]);
  const customPresets = useMemo(() => getCustomPresets(momMedicationEvents, 'mom'), [momMedicationEvents]);
  const babyCustomPresets = useMemo(
    () => getCustomPresets(babyMedicationEvents, 'baby'),
    [babyMedicationEvents]
  );

  // The toast keeps a message KEY (plus the stored medication name), resolved when rendered.
  function showToast(key, medicationName) {
    setToast({ key, medicationName });
    setTimeout(() => setToast(null), 1800);
  }

  function closeAndToast(key) {
    setOpenSheet(null);
    showToast(key);
  }

  return (
    <div>
      <h1 className="page-title">{t('home.title')}</h1>

      <div className="range-tabs" style={{ marginBottom: 16 }}>
        <button className={subject === 'baby' ? 'active' : ''} onClick={() => setSubject('baby')}>
          {t('home.subject.baby')}
        </button>
        <button className={subject === 'mom' ? 'active' : ''} onClick={() => setSubject('mom')}>
          {t('home.subject.mom')}
        </button>
      </div>

      {/* Both grids stay mounted (toggled via CSS) so switching tabs never re-fetches or loses timer state. */}
      <div style={{ display: subject === 'baby' ? 'block' : 'none' }}>
        <NextSleepCard
          events={recentEvents}
          child={child}
          loading={sleepLoading}
          error={sleepError}
        />
      </div>

      <div className="tile-grid" style={{ display: subject === 'baby' ? 'grid' : 'none' }}>
        <EventTile
          icon="💧"
          label={t('events.type.diaper')}
          color={EVENT_COLORS.diaper}
          onClick={() => setOpenSheet('diaper')}
        />
        <FeedingTile
          onChange={() => {
            showToast('home.toast.feedingUpdated');
            loadRecentEvents();
          }}
        />
        <TimerTile
          type="sleep"
          icon="😴"
          label={t('events.type.sleep')}
          color={EVENT_COLORS.sleep}
          startChoices={[{ key: null, label: t('home.start') }]}
          onChange={() => {
            showToast('home.toast.sleepUpdated');
            loadRecentEvents(); // otherwise the card keeps counting down for a baby already asleep
          }}
        />
        <OutingTile color={EVENT_COLORS.outing} onChange={() => showToast('home.toast.outingUpdated')} />
        {babyCustomPresets.map((preset) => (
          <MedicationTile
            key={preset.key}
            preset={preset}
            who="baby"
            medicationEvents={babyMedicationEvents}
            onLogged={() => {
              loadMedicationEvents();
              showToast('home.toast.medicationNamed', preset.name);
            }}
          />
        ))}
        <EventTile
          icon="💊"
          label={t('events.type.medication')}
          sub={t('home.sub.medication')}
          color={EVENT_COLORS.medication}
          onClick={() => setOpenSheet('medication-other-baby')}
        />
        <EventTile
          icon="🌡️"
          label={t('events.type.temperature')}
          color={EVENT_COLORS.temperature}
          onClick={() => setOpenSheet('temperature-baby')}
        />
        <EventTile
          icon="📏"
          label={t('events.type.growth')}
          sub={t('home.sub.growth')}
          onClick={() => setOpenSheet('growth')}
        />
      </div>

      <div className="tile-grid" style={{ display: subject === 'mom' ? 'grid' : 'none' }}>
        <TimerTile
          type="contraction"
          icon="⏱"
          label={t('events.type.contraction')}
          color={EVENT_COLORS.contraction}
          startChoices={[{ key: null, label: t('home.start') }]}
          stopChoices={[
            { key: 'mild', label: t('home.intensity.mild') },
            { key: 'moderate', label: t('home.intensity.moderate') },
            { key: 'strong', label: t('home.intensity.strong') },
          ]}
          onChange={() => showToast('home.toast.contractionUpdated')}
        />
        {MEDICATION_PRESETS.map((preset) => (
          <MedicationTile
            key={preset.key}
            preset={preset}
            medicationEvents={momMedicationEvents}
            onLogged={() => {
              loadMedicationEvents();
              showToast('home.toast.medicationNamed', preset.name);
            }}
          />
        ))}
        {customPresets.map((preset) => (
          <MedicationTile
            key={preset.key}
            preset={preset}
            medicationEvents={momMedicationEvents}
            onLogged={() => {
              loadMedicationEvents();
              showToast('home.toast.medicationNamed', preset.name);
            }}
          />
        ))}
        <EventTile
          icon="💊"
          label={t('home.other')}
          sub={t('home.sub.customMedication')}
          color={EVENT_COLORS.medication}
          onClick={() => setOpenSheet('medication-other')}
        />
        <EventTile
          icon="🌡️"
          label={t('events.type.temperature')}
          color={EVENT_COLORS.temperature}
          onClick={() => setOpenSheet('temperature-mom')}
        />
      </div>

      {openSheet === 'diaper' && (
        <DiaperSheet
          onClose={() => setOpenSheet(null)}
          onSaved={() => closeAndToast('home.toast.diaper')}
        />
      )}
      {openSheet === 'temperature-baby' && (
        <TemperatureSheet
          who="baby"
          onClose={() => setOpenSheet(null)}
          onSaved={() => closeAndToast('home.toast.temperature')}
        />
      )}
      {openSheet === 'temperature-mom' && (
        <TemperatureSheet
          who="mom"
          onClose={() => setOpenSheet(null)}
          onSaved={() => closeAndToast('home.toast.temperature')}
        />
      )}
      {openSheet === 'growth' && (
        <GrowthSheet
          onClose={() => setOpenSheet(null)}
          onSaved={() => closeAndToast('home.toast.growth')}
        />
      )}
      {openSheet === 'medication-other-baby' && (
        <MedicationSheet
          who="baby"
          onClose={() => setOpenSheet(null)}
          onSaved={() => {
            loadMedicationEvents();
            closeAndToast('home.toast.medication');
          }}
        />
      )}
      {openSheet === 'medication-other' && (
        <MedicationSheet
          who="mom"
          onClose={() => setOpenSheet(null)}
          onSaved={() => {
            loadMedicationEvents();
            closeAndToast('home.toast.medication');
          }}
        />
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--text-primary)',
            color: 'var(--page)',
            padding: '8px 16px',
            borderRadius: 999,
            fontSize: '0.85rem',
            zIndex: 30,
          }}
        >
          {t(
            toast.key,
            toast.medicationName != null ? { name: medicationDisplayName(toast.medicationName) } : undefined
          )}
        </div>
      )}
    </div>
  );
}
