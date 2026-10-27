// Sommeil : carte de prévision (page Saisie) et section Sommeil (page Graphiques).
// Formulations neutres : pas de « il/elle », pas de « de {name} ».
export default {
  'sleep.title': 'Sommeil',
  'sleep.loadError': 'Impossible de charger le sommeil récent. Tirez vers le bas pour réessayer une fois reconnecté.',

  'sleep.runningSince': 'Sommeil toujours en cours depuis {time}',
  'sleep.runningLong':
    'Durée supérieure au sommeil habituel pour {name}. Si le chrono est resté lancé, arrêtez-le ou corrigez la saisie dans l’Historique. Elle est exclue des totaux du jour d’ici là.',
  'sleep.runningLongNoName':
    'Durée supérieure au sommeil habituel. Si le chrono est resté lancé, arrêtez-le ou corrigez la saisie dans l’Historique. Elle est exclue des totaux du jour d’ici là.',
  'sleep.noPrediction': 'Pas de prévision : rien d’enregistré récemment',
  'sleep.staleDetail':
    'Dernier sommeil terminé le {date} à {time}. Les prévisions reviendront dès que les saisies reprendront.',
  'sleep.notEnoughLogged': 'Pas encore assez de sommeil enregistré pour en tirer quelque chose d’utile.',

  'sleep.asleepSince': 'Sommeil en cours depuis {time}',
  'sleep.wakeUnknown': 'Pas encore assez de sommeils enregistrés pour estimer le réveil.',
  'sleep.wakePastTypical': 'Déjà plus long que d’habitude : le réveil peut arriver à tout moment.',
  'sleep.wakeUsually': 'Réveil habituel vers {range}',
  'sleep.basedOnSleeps_one': 'Basé sur {count} sommeil récent',
  'sleep.basedOnSleeps_other': 'Basé sur {count} sommeils récents',

  'sleep.overdue': 'Au-delà de la fenêtre habituelle',
  'sleep.nextSleep': 'Prochain sommeil : {range}',
  'sleep.overdueDetail': 'Attendu vers {time}. L’endormissement peut être plus facile maintenant.',
  'sleep.anyTimeNow': 'D’un instant à l’autre',
  'sleep.inAbout': 'Dans environ {duration}',

  'sleep.typical_one': 'Habituel à {count} semaine : {min}–{max} min d’éveil',
  'sleep.typical_other': 'Habituel à {count} semaines : {min}–{max} min d’éveil',
  'sleep.typicalUnknownAge': 'Habituel à ? semaines : {min}–{max} min d’éveil',
  'sleep.notEnoughOwn':
    '{name} : pas encore assez de sommeils enregistrés ({samples}/3) pour prévoir à partir du rythme observé.',
  'sleep.notEnoughOwnNoName':
    'Pas encore assez de sommeils enregistrés ({samples}/3) pour prévoir à partir du rythme observé.',

  'sleep.lastWoke': 'Dernier réveil à {time} · {ago}',
  'sleep.basedOnWindows_one': 'Basé sur {count} période d’éveil récente',
  'sleep.basedOnWindows_other': 'Basé sur {count} périodes d’éveil récentes',
  'sleep.basedOnWindowsShortNap_one': 'Basé sur {count} période d’éveil récente, raccourcie après une courte sieste',
  'sleep.basedOnWindowsShortNap_other': 'Basé sur {count} périodes d’éveil récentes, raccourcies après une courte sieste',

  'sleep.disturbedBanner':
    'Le sommeil est agité depuis quelques jours (poussée dentaire, voyage, pic de croissance ?). La fenêtre est élargie en conséquence, et le rythme habituel est conservé au lieu d’être réappris.',
  'sleep.lowQualityBanner_one':
    'Certains sommeils semblent ne pas avoir été enregistrés ({suspect} sur {count} période récente), les prévisions seront donc faussées tant que les saisies n’auront pas rattrapé le retard.',
  'sleep.lowQualityBanner_other':
    'Certains sommeils semblent ne pas avoir été enregistrés ({suspect} sur {count} périodes récentes), les prévisions seront donc faussées tant que les saisies n’auront pas rattrapé le retard.',

  'sleep.phase.1': 'Pas encore de rythme jour/nuit',
  'sleep.phase.1Long': 'Pas encore de rythme jour/nuit : sommeil réparti sur toute la journée',
  'sleep.phase.2': 'Rythme jour/nuit installé',
  'sleep.phase.3': 'Rythme de siestes installé',
  'sleep.napsADay_one': '{count} sieste par jour',
  'sleep.napsADay_other': '{count} siestes par jour',
  'sleep.nightWindow': 'nuit vers {from}–{to}',
  'sleep.unsettled': 'agité depuis quelques jours',

  'sleep.empty': 'Aucun sommeil enregistré pour l’instant.',
  'sleep.last24h': 'Dernières 24 heures',
  'sleep.typicalForAge': 'Habituel à cet âge : {min}–{max} h',
  'sleep.typicalForAgeBelow': 'Habituel à cet âge : {min}–{max} h · en dessous de la plage habituelle',
  'sleep.countLongest_one': '{count} sommeil · le plus long : {duration}',
  'sleep.countLongest_other': '{count} sommeils · le plus long : {duration}',
  'sleep.wakeWindows': 'Périodes d’éveil',
  'sleep.wakeWindowsHint': 'Temps d’éveil entre deux sommeils, base de l’apprentissage de la prévision.',
  'sleep.noWakeWindows': 'Aucune période d’éveil complète pour l’instant.',
  'sleep.windowUnlogged': '{duration} : un sommeil semble ne pas avoir été enregistré',
  'sleep.awakeRange': 'Éveil de {from} à {to}',
  'sleep.rhythm.wakes': 'Réveils',
  'sleep.rhythm.sleeps': 'Sommeils',
  'sleep.rhythm.typical': 'Type',
  'sleep.rhythm.legendAsleep': 'endormi',
  'sleep.rhythm.legendAwake': 'éveillé',
  'sleep.rhythm.legendVaries': 'variable',
  'sleep.rhythm.hint': 'Barres : part des jours où un réveil (ambre) ou un sommeil (rouge) commence, par demi-heure ; hauteur max = {percent} %. Foncé = nuit. Encadré = heures habituelles.',
  'sleep.rhythm.range': '{from}–{to}',
  'sleep.rhythm.item': '{range} ({count}/{total})',
  'sleep.rhythm.night_one': 'Nuit : {count} réveil ({min}–{max}), environ {duration} chacun',
  'sleep.rhythm.night_other': 'Nuit : {count} réveils ({min}–{max}), environ {duration} chacun',
  'sleep.rhythm.nightNone': 'Nuit : généralement aucun réveil',
  'sleep.rhythm.nightUsual': 'réveil fréquent vers {list}',
  'sleep.rhythm.day_one': 'Jour : {count} sieste ({min}–{max}), éveil d’environ {duration} avant',
  'sleep.rhythm.day_other': 'Jour : {count} siestes ({min}–{max}), éveil d’environ {duration} avant chacune',
  'sleep.rhythm.dayUsual': 'siestes souvent vers {list}',
  'sleep.rhythm.spread': 'pas d’heure régulière',
  'sleep.tapHint': 'Touchez un bloc de sommeil pour voir ses horaires.',
  'sleep.timeline': "Chronologie du sommeil",
  'sleep.showAllWindows': "Afficher les {count}",
  'sleep.showFewerWindows': "Réduire",
  'sleep.range': '{from} → {to}',
  'sleep.now': 'maintenant',
  'sleep.timeRange': '{from}–{to}',

  'sleep.progress.title': 'Progression des nuits',
  'sleep.progress.hint':
    'Plus long tronçon de sommeil sans pause d’au moins 10 minutes, nuit par nuit (19 h – 7 h).',
  'sleep.progress.series': 'Plus long tronçon',
  'sleep.progress.trendSeries': 'Tendance',
  'sleep.progress.notEnough': 'Pas encore assez de nuits enregistrées pour dégager une tendance ({count}/{needed}).',
  'sleep.progress.typical':
    'Fourchette indicative à cet âge : {min}–{max}. Approximative, et très variable d’un bébé à l’autre.',
  'sleep.progress.trendUp': 'Le plus long tronçon gagne environ {minutes} min par semaine.',
  'sleep.progress.trendDown': 'Le plus long tronçon perd environ {minutes} min par semaine.',
  'sleep.progress.trendFlat': 'Le plus long tronçon est stable.',
  'sleep.progress.trendUnclear': 'Tendance encore incertaine : les nuits varient beaucoup.',
};
