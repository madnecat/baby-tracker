// Messages for the `code` the server (or the api client) attaches to a failed call. Shown through
// errorMessage(err) in api/client.js. Keys are the codes themselves.
export default {
  'errors.generic': 'Une erreur est survenue. Veuillez réessayer.',
  'errors.network': 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.',
  'errors.request_failed': 'La requête a échoué ({status}).',

  'errors.AUTH_MISSING_FIELDS': "Saisissez votre nom d’utilisateur et votre mot de passe.",
  'errors.AUTH_INVALID_CREDENTIALS': "Nom d’utilisateur ou mot de passe incorrect.",
  'errors.AUTH_NOT_AUTHENTICATED': 'Votre session a expiré. Veuillez vous reconnecter.',
  'errors.PASSWORD_FIELDS_REQUIRED': 'Saisissez votre mot de passe actuel et un nouveau mot de passe.',
  'errors.PASSWORD_WRONG': 'Le mot de passe actuel est incorrect.',
  'errors.LANGUAGE_INVALID': "Cette langue n’est pas prise en charge.",
  'errors.TOKEN_LABEL_REQUIRED': 'Saisissez un nom pour le jeton.',

  'errors.EVENT_TYPE_REQUIRED': "Le type d’événement est manquant.",
  'errors.EVENT_TYPE_INVALID': "Ce type d’événement n’est pas valide.",
  'errors.EVENT_STARTED_AT_REQUIRED': 'Saisissez une date et une heure.',
  'errors.EVENT_NOT_FOUND': "Cette entrée n’existe plus.",
  'errors.GROWTH_MEASURED_AT_REQUIRED': 'Saisissez la date de la mesure.',
  'errors.GROWTH_NOT_FOUND': "Cette mesure n’existe plus.",
  'errors.CHILD_FIELDS_REQUIRED': 'Saisissez un prénom, une date de naissance et le sexe.',

  'errors.EMAIL_INVALID': "Cette adresse email ne semble pas valide.",
  'errors.PREFS_ENABLED_INVALID': "Le réglage des rappels n’est pas valide.",
  'errors.PREFS_EMAIL_REQUIRED': "Saisissez d’abord une adresse email.",
  'errors.MAIL_NOT_CONFIGURED': "Les rappels par email ne sont pas configurés sur ce serveur.",
  'errors.MAIL_EMAIL_NOT_SAVED': "Enregistrez d’abord une adresse email.",
  'errors.RATE_LIMITED': "Trop d’emails de test. Réessayez dans une heure.",
  'errors.MAIL_SEND_FAILED': "L’email de test n’a pas pu être envoyé. Vérifiez les paramètres de messagerie du serveur.",
  'errors.ADMIN_CONTACT_MISSING': "Aucun contact administrateur n’est configuré sur ce serveur.",
  'errors.MOM_ALREADY_SET': 'Maman est déjà configurée pour ce foyer.',
  'errors.ADMIN_REQUEST_ALREADY_SENT': "Une demande a déjà été envoyée aujourd’hui.",
  'errors.ADMIN_REQUEST_FAILED': "La demande n’a pas pu être envoyée.",
};
