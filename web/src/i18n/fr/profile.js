// Sections des paramètres : profil de bébé, repas, accès assistant IA (jetons d’API).
export default {
  'profile.title': 'Profil de bébé',
  'profile.hint': 'Utilisé pour les courbes de croissance de l’OMS (date de naissance et sexe nécessaires).',
  'profile.name': 'Prénom',
  'profile.dob': 'Date de naissance',
  'profile.sex.female': 'Fille',
  'profile.sex.male': 'Garçon',
  'profile.saved': 'Enregistré.',
  'profile.save': 'Enregistrer le profil',

  'profile.feeding.title': 'Repas',
  'profile.feeding.askAfter': 'Me demander comment s’est passée la tétée après l’avoir arrêtée',
  'profile.feeding.hint': 'Une petite question facultative (par ex. « tétée efficace », « satiété apparente ») que vous pouvez passer. S’applique à tout le foyer. Vous pouvez toujours ajouter ou modifier des remarques depuis l’Historique.',

  'apiTokens.title': 'Accès assistant IA',
  'apiTokens.intro': 'Créez un jeton pour que Claude enregistre des événements à votre place quand vous les décrivez dans la discussion (par ex. « enregistre une tétée de 15 minutes au sein gauche à partir de 15 h »). Fonctionne avec les connecteurs personnalisés distants de Claude (claude.ai, Claude Desktop, mobile). ChatGPT n’est pas encore pris en charge : il exige un serveur OAuth complet plutôt qu’un simple jeton.',
  'apiTokens.copyNow': 'Copiez ce jeton maintenant : il ne sera plus affiché.',
  'apiTokens.inClaude': 'Dans Claude : {path}',
  'apiTokens.connectorPath': 'Paramètres → Connecteurs → Ajouter un connecteur personnalisé',
  'apiTokens.url': 'URL : {url}',
  'apiTokens.header': 'Dans les réglages d’en-tête, ajoutez : nom d’en-tête {name}, valeur {value} suivi directement du jeton complet ci-dessus (avec une espace, sans saut de ligne).',
  'apiTokens.labelPlaceholder': 'Nom, par ex. le Claude de Papa',
  'apiTokens.create': 'Créer',
  'apiTokens.createdNever': 'Créé {created} · jamais utilisé',
  'apiTokens.createdUsed': 'Créé {created} · dernière utilisation {used}',
  'apiTokens.revoke': 'Révoquer',
};
