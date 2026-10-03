// Sleep: the prediction card on the log page and the Sleep section on the charts page.
export default {
  'sleep.title': 'Sleep',
  'sleep.loadError': "Couldn't load recent sleep — pull down to retry once you're back online.",

  'sleep.runningSince': 'Sleep still running since {time}',
  'sleep.runningLong':
    "That's longer than {name} usually sleeps — if the timer was left on, stop it or fix the entry in History. It's left out of today's totals until then.",
  'sleep.runningLongNoName':
    "That's longer than she usually sleeps — if the timer was left on, stop it or fix the entry in History. It's left out of today's totals until then.",
  'sleep.noPrediction': 'No prediction — nothing logged recently',
  'sleep.staleDetail': 'Last sleep ended {date} at {time}. Predictions come back once logging does.',
  'sleep.notEnoughLogged': 'Not enough sleep logged yet to say anything useful.',

  'sleep.asleepSince': 'Asleep since {time}',
  'sleep.wakeUnknown': 'Not enough of her own sleeps logged yet to guess when she’ll wake.',
  'sleep.wakePastTypical': 'Already longer than her usual stretch — she could wake any time.',
  'sleep.wakeUsually': 'Usually wakes around {range}',
  'sleep.basedOnSleeps_one': 'Based on {count} of her own recent sleeps',
  'sleep.basedOnSleeps_other': 'Based on {count} of her own recent sleeps',

  'sleep.overdue': 'Past the usual window',
  'sleep.nextSleep': 'Next sleep {range}',
  'sleep.overdueDetail': 'Expected around {time} — she may settle more easily now.',
  'sleep.anyTimeNow': 'Any time now',
  'sleep.inAbout': 'In about {duration}',

  'sleep.typical_one': 'Typical at {count} week: {min}–{max} min awake',
  'sleep.typical_other': 'Typical at {count} weeks: {min}–{max} min awake',
  'sleep.typicalUnknownAge': 'Typical at ? weeks: {min}–{max} min awake',
  'sleep.notEnoughOwn': "Not enough of {name}'s own sleeps logged yet ({samples}/3) to predict from her pattern.",
  'sleep.notEnoughOwnNoName': 'Not enough of her own sleeps logged yet ({samples}/3) to predict from her pattern.',

  'sleep.lastWoke': 'Last woke {time} · {ago}',
  'sleep.basedOnWindows_one': 'Based on {count} of her own wake windows',
  'sleep.basedOnWindows_other': 'Based on {count} of her own wake windows',
  'sleep.basedOnWindowsShortNap_one': 'Based on {count} of her own wake windows, shortened after a brief nap',
  'sleep.basedOnWindowsShortNap_other': 'Based on {count} of her own wake windows, shortened after a brief nap',

  'sleep.disturbedBanner':
    'Sleep has been unsettled the last few days (teething, travel, a growth spurt?). The window is widened to match, and her usual pattern is kept rather than relearned.',
  'sleep.lowQualityBanner_one':
    "Some sleeps look like they weren't logged ({suspect} of {count} recent stretch), so predictions will be off until logging catches up.",
  'sleep.lowQualityBanner_other':
    "Some sleeps look like they weren't logged ({suspect} of {count} recent stretches), so predictions will be off until logging catches up.",

  'sleep.phase.1': 'No day/night rhythm yet',
  'sleep.phase.1Long': 'No day/night rhythm yet — sleeps around the clock',
  'sleep.phase.2': 'Day/night rhythm settled',
  'sleep.phase.3': 'Settled nap regime',
  'sleep.napsADay_one': '{count} nap a day',
  'sleep.napsADay_other': '{count} naps a day',
  'sleep.nightWindow': 'night sits around {from}–{to}',
  'sleep.unsettled': 'unsettled the last few days',

  'sleep.empty': 'No sleep logged yet.',
  'sleep.last24h': 'Last 24 hours',
  'sleep.typicalForAge': 'Typical at this age: {min}–{max}h',
  'sleep.typicalForAgeBelow': 'Typical at this age: {min}–{max}h · below the usual range',
  'sleep.countLongest_one': '{count} sleep · longest {duration}',
  'sleep.countLongest_other': '{count} sleeps · longest {duration}',
  'sleep.wakeWindows': 'Wake windows',
  'sleep.wakeWindowsHint': 'Time awake between sleeps — what the prediction is learned from.',
  'sleep.noWakeWindows': 'No complete wake windows yet.',
  'sleep.windowUnlogged': '{duration} — looks like a sleep went unlogged',
  'sleep.awakeRange': 'Awake {from} → {to}',
  'sleep.tapHint': 'Tap a sleep block for its times.',
  'sleep.range': '{from} → {to}',
  'sleep.now': 'now',
};
