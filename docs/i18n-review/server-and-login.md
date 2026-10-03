# French review notes: server emails, login, errors, email reminders, add-on options

Strings I am unsure about or that are sensitive. English source, French chosen, why.

## Emails (server/src/emailTemplates.js)

- "Baby Tracker: a dose for Mum can be taken again" -> "Baby Tracker : une prise pour Maman est de nouveau possible".
  "une prise" for a medication dose is natural but informal; "dose" alone is also used in French. Owner to confirm.
- "Always check the app and the packet instructions before giving a dose." -> "Vérifiez toujours dans l'application et sur la notice avant de donner une dose." Medical safety wording: please review.
- "You can turn these emails off in Settings > Email reminders." -> "Vous pouvez désactiver ces emails dans Paramètres > Rappels par email." Previously mixed languages ("Réglages (Settings) > Email reminders"); now matches the French Settings page and the section title `emailReminders.title`. If either is renamed, change both.
- Typography: no-break space (U+00A0) now used before ":" in subjects and bodies.
- "email" vs "e-mail" / "courriel": the app uses "email" everywhere (existing choice, kept). Owner may prefer "e-mail".
- Register: "Vérifiez/Vous" (vous form) used throughout, as in the UI.
- The administrator "set up Mum" email stays English by design (recipient is the add-on owner).

## Errors (web/src/i18n/fr/errors.js)

- AUTH_NOT_AUTHENTICATED "Votre session a expiré. Veuillez vous reconnecter." (English source was only "Not authenticated"; I made it friendlier because the practical cause is an expired session.)
- CHILD_FIELDS_REQUIRED "Saisissez un prénom, une date de naissance et le sexe." The English says "name"; "prénom" fits a child's first name but the field label in the form decides. Check against the child profile labels.
- MOM_ALREADY_SET "Maman est déjà configurée pour ce foyer." "foyer" for household (also used in add-on options); alternative "famille".
- TOKEN_LABEL_REQUIRED "jeton" for API token: check the Settings (API tokens) wording used by the other worker.

## Email reminders section (web/src/i18n/fr/emailReminders.js)

- "Mum's reminders go to Mum only" -> "Les rappels de Maman ne vont qu'à Maman". "Maman" as the person label follows the glossary.
- "Ask the administrator to set it up" -> "Demander à l'administrateur de la configurer" ("la" = Maman).
- Placeholder "vous@exemple.fr" (example address, harmless).

## Add-on options (translations/fr.yaml)

- "slug" translated as "Nom du foyer" / "Identifiant court"; "household" -> "foyer".
- Not verified in a real Home Assistant instance (translation file format follows the HA add-on docs: configuration.<option>.name/description, nested options under `fields`).
