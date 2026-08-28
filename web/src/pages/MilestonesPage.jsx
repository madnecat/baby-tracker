import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { api } from '../api/client.js';
import { MILESTONES, MILESTONE_CATEGORIES } from '../data/milestones.js';
import { Sheet } from '../components/Sheet.jsx';
import { useColorScheme } from '../lib/useColorScheme.js';
import { resolve } from '../lib/palette.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MilestonesPage() {
  const [child, setChild] = useState(null);
  const [completions, setCompletions] = useState({});
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);
  const isDark = useColorScheme();

  function load() {
    setLoading(true);
    Promise.all([api.getChild(), api.milestoneCompletions()])
      .then(([c, comp]) => {
        setChild(c);
        setCompletions(comp);
        if (c) setMonth(startOfMonth(new Date()));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggle(key, completed) {
    setCompletions((prev) => {
      const next = { ...prev };
      if (completed) next[key] = new Date().toISOString();
      else delete next[key];
      return next;
    });
    await api.setMilestoneCompletion(key, completed);
  }

  const rows = useMemo(() => {
    if (!child) return [];
    const dob = startOfDay(new Date(child.dateOfBirth));
    return MILESTONES.map((m) => ({
      ...m,
      dueDate: addDays(dob, m.offsetDays),
      done: Boolean(completions[m.key]),
    })).sort((a, b) => a.dueDate - b.dueDate);
  }, [child, completions]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const m of rows) {
      const key = format(m.dueDate, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return map;
  }, [rows]);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const upcoming = rows.filter((m) => !m.done).slice(0, 5);

  if (loading) return <p>Loading…</p>;

  if (!child) {
    return (
      <div>
        <h1 className="page-title">Calendar</h1>
        <div className="empty-state">
          Set up your child's date of birth on the Growth page to see the milestone calendar.
        </div>
      </div>
    );
  }

  const today = startOfDay(new Date());
  const selectedMilestones = selectedDay ? byDay.get(format(selectedDay, 'yyyy-MM-dd')) || [] : [];

  return (
    <div>
      <h1 className="page-title">Calendar</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: -8 }}>
        UK milestones, plus French nationality steps. Not legal or medical advice.
      </p>

      <div className="calendar-nav">
        <button className="btn" onClick={() => setMonth((m) => subMonths(m, 1))}>
          ‹
        </button>
        <strong>{format(month, 'MMMM yyyy')}</strong>
        <button className="btn" onClick={() => setMonth((m) => addMonths(m, 1))}>
          ›
        </button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-weekday">
            {d}
          </div>
        ))}
        {gridDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayMilestones = byDay.get(key) || [];
          const allDone = dayMilestones.length > 0 && dayMilestones.every((m) => m.done);
          const overdue = dayMilestones.some((m) => !m.done && isBefore(day, today));
          return (
            <button
              key={key}
              className={`calendar-day${isSameMonth(day, month) ? '' : ' other-month'}${
                isToday(day) ? ' today' : ''
              }${selectedDay && isSameDay(day, selectedDay) ? ' selected' : ''}`}
              onClick={() => dayMilestones.length > 0 && setSelectedDay(day)}
              disabled={dayMilestones.length === 0}
            >
              <span className="calendar-day-number">{format(day, 'd')}</span>
              {dayMilestones.length > 0 && (
                <span className="calendar-dot-row">
                  {dayMilestones.slice(0, 4).map((m) => (
                    <span
                      key={m.key}
                      className="dot"
                      style={{
                        background: resolve(MILESTONE_CATEGORIES[m.category].color, isDark),
                        opacity: m.done ? 0.35 : 1,
                        outline: overdue && !m.done ? '1px solid var(--danger)' : 'none',
                      }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <h2 className="section-title">Next up</h2>
      {upcoming.length === 0 && <div className="empty-state">Everything's marked done 🎉</div>}
      {upcoming.map((m) => (
        <div
          key={m.key}
          className="history-item"
          onClick={() => setSelectedDay(m.dueDate)}
          style={{ cursor: 'pointer' }}
        >
          <span
            className="dot"
            style={{ background: resolve(MILESTONE_CATEGORIES[m.category].color, isDark) }}
          />
          <div className="details">
            <div>{m.title}</div>
            <div className="time">
              {format(m.dueDate, 'd MMM yyyy')}
              {isBefore(m.dueDate, today) ? ' — overdue' : ''}
            </div>
          </div>
        </div>
      ))}

      {selectedDay && (
        <Sheet title={format(selectedDay, 'EEEE d MMMM yyyy')} onClose={() => setSelectedDay(null)}>
          {selectedMilestones.map((m) => {
            const cat = MILESTONE_CATEGORIES[m.category];
            return (
              <div key={m.key} className="card" style={{ marginBottom: 10, opacity: m.done ? 0.55 : 1 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={m.done}
                    onChange={(e) => toggle(m.key, e.target.checked)}
                    style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <strong style={{ textDecoration: m.done ? 'line-through' : 'none' }}>
                      {m.title}
                    </strong>
                    <div
                      className="legend-swatch"
                      style={{ margin: '4px 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}
                    >
                      <span className="dot" style={{ background: resolve(cat.color, isDark) }} />
                      {cat.label}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {m.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </Sheet>
      )}
    </div>
  );
}
