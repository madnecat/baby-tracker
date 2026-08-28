import { useEffect, useState } from 'react';
import { EventTile } from '../components/EventTile.jsx';
import { TimerTile } from '../components/TimerTile.jsx';
import { OutingTile } from '../components/OutingTile.jsx';
import { FeedingTile } from '../components/FeedingTile.jsx';
import { MedicationTile } from '../components/MedicationTile.jsx';
import { DiaperSheet } from '../components/DiaperSheet.jsx';
import { TemperatureSheet } from '../components/TemperatureSheet.jsx';
import { MedicationSheet } from '../components/MedicationSheet.jsx';
import { GrowthSheet } from '../components/GrowthSheet.jsx';
import { api } from '../api/client.js';
import { EVENT_COLORS } from '../lib/palette.js';
import { MEDICATION_PRESETS } from '../lib/medications.js';

export default function HomePage() {
  const [subject, setSubject] = useState('baby');
  const [openSheet, setOpenSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [medicationEvents, setMedicationEvents] = useState([]);

  function loadMedicationEvents() {
    api.listEvents({ type: 'medication' }).then(setMedicationEvents);
  }

  useEffect(loadMedicationEvents, []);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 1800);
  }

  function closeAndToast(message) {
    setOpenSheet(null);
    showToast(message);
  }

  return (
    <div>
      <h1 className="page-title">Quick log</h1>

      <div className="range-tabs" style={{ marginBottom: 16 }}>
        <button className={subject === 'baby' ? 'active' : ''} onClick={() => setSubject('baby')}>
          👶 Baby
        </button>
        <button className={subject === 'mom' ? 'active' : ''} onClick={() => setSubject('mom')}>
          🤰 Mum
        </button>
      </div>

      {/* Both grids stay mounted (toggled via CSS) so switching tabs never re-fetches or loses timer state. */}
      <div className="tile-grid" style={{ display: subject === 'baby' ? 'grid' : 'none' }}>
        <EventTile
          icon="💧"
          label="Diaper"
          color={EVENT_COLORS.diaper}
          onClick={() => setOpenSheet('diaper')}
        />
        <FeedingTile onChange={() => showToast('Feeding updated')} />
        <TimerTile
          type="sleep"
          icon="😴"
          label="Sleep"
          color={EVENT_COLORS.sleep}
          startChoices={[{ key: null, label: 'Start' }]}
          onChange={() => showToast('Sleep updated')}
        />
        <OutingTile color={EVENT_COLORS.outing} onChange={() => showToast('Outing updated')} />
        <EventTile
          icon="🌡️"
          label="Temperature"
          color={EVENT_COLORS.temperature}
          onClick={() => setOpenSheet('temperature-baby')}
        />
        <EventTile
          icon="📏"
          label="Growth"
          sub="Weight/height/HC"
          onClick={() => setOpenSheet('growth')}
        />
      </div>

      <div className="tile-grid" style={{ display: subject === 'mom' ? 'grid' : 'none' }}>
        <TimerTile
          type="contraction"
          icon="⏱"
          label="Contraction"
          color={EVENT_COLORS.contraction}
          startChoices={[{ key: null, label: 'Start' }]}
          stopChoices={[
            { key: 'mild', label: 'Mild' },
            { key: 'moderate', label: 'Moderate' },
            { key: 'strong', label: 'Strong' },
          ]}
          onChange={() => showToast('Contraction updated')}
        />
        {MEDICATION_PRESETS.map((preset) => (
          <MedicationTile
            key={preset.key}
            preset={preset}
            medicationEvents={medicationEvents}
            onLogged={() => {
              loadMedicationEvents();
              showToast(`${preset.name} logged`);
            }}
          />
        ))}
        <EventTile
          icon="💊"
          label="Other"
          sub="Custom medication"
          color={EVENT_COLORS.medication}
          onClick={() => setOpenSheet('medication-other')}
        />
        <EventTile
          icon="🌡️"
          label="Temperature"
          color={EVENT_COLORS.temperature}
          onClick={() => setOpenSheet('temperature-mom')}
        />
      </div>

      {openSheet === 'diaper' && (
        <DiaperSheet
          onClose={() => setOpenSheet(null)}
          onSaved={() => closeAndToast('Diaper logged')}
        />
      )}
      {openSheet === 'temperature-baby' && (
        <TemperatureSheet
          who="baby"
          onClose={() => setOpenSheet(null)}
          onSaved={() => closeAndToast('Temperature logged')}
        />
      )}
      {openSheet === 'temperature-mom' && (
        <TemperatureSheet
          who="mom"
          onClose={() => setOpenSheet(null)}
          onSaved={() => closeAndToast('Temperature logged')}
        />
      )}
      {openSheet === 'growth' && (
        <GrowthSheet
          onClose={() => setOpenSheet(null)}
          onSaved={() => closeAndToast('Growth measurement logged')}
        />
      )}
      {openSheet === 'medication-other' && (
        <MedicationSheet
          onClose={() => setOpenSheet(null)}
          onSaved={() => {
            loadMedicationEvents();
            closeAndToast('Medication logged');
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
          {toast}
        </div>
      )}
    </div>
  );
}
