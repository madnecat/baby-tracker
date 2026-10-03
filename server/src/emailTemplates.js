// Email wording. Deliberately neutral: reminders never name the medication or the dose, only who
// it is for and a link back to the app — health details shouldn't sit in mail servers/inboxes.

const WHO = {
  en: { mom: 'Mum', baby: 'Baby' },
  fr: { mom: 'Maman', baby: 'Bébé' },
};

function link(language, publicUrl) {
  if (!publicUrl) return '';
  return language === 'fr' ? `\nOuvrir Baby Tracker\u00A0: ${publicUrl}\n` : `\nOpen Baby Tracker: ${publicUrl}\n`;
}

export function normaliseLanguage(language) {
  return language === 'fr' ? 'fr' : 'en';
}

/** `who` is 'mom' or 'baby'. */
export function reminderEmail({ who, language, publicUrl }) {
  const lang = normaliseLanguage(language);
  const subject = WHO[lang][who === 'baby' ? 'baby' : 'mom'];
  if (lang === 'fr') {
    return {
      subject: `Baby Tracker\u00A0: une prise pour ${subject} est de nouveau possible`,
      text:
        `Le délai entre deux prises est écoulé\u00A0: une prise de médicament pour ${subject} est de nouveau possible.\n` +
        link(lang, publicUrl) +
        `\nVérifiez toujours dans l'application et sur la notice avant de donner une dose.\n` +
        `Vous pouvez désactiver ces emails dans Paramètres > Rappels par email.\n`,
    };
  }
  return {
    subject: `Baby Tracker: a dose for ${subject} can be taken again`,
    text:
      `The waiting time between doses is over: a medication dose for ${subject} can be taken again.\n` +
      link(lang, publicUrl) +
      `\nAlways check the app and the packet instructions before giving a dose.\n` +
      `You can turn these emails off in Settings > Email reminders.\n`,
  };
}

export function testEmail({ language, publicUrl }) {
  const lang = normaliseLanguage(language);
  if (lang === 'fr') {
    return {
      subject: 'Baby Tracker\u00A0: email de test',
      text: `Ceci est un email de test\u00A0: les rappels par email fonctionnent.\n${link(lang, publicUrl)}`,
    };
  }
  return {
    subject: 'Baby Tracker: test email',
    text: `This is a test email: email reminders are working.\n${link(lang, publicUrl)}`,
  };
}

/**
 * Sent to the add-on administrator when a household asks for Mum to be set up. Always English:
 * the administrator is the add-on owner (not one of the parents), so the requesting parent's
 * language does not apply.
 */
export function adminMomRequestEmail({ householdSlug, requestedBy }) {
  return {
    subject: `Baby Tracker: household "${householdSlug}" needs Mum to be set up`,
    text:
      `${requestedBy} (household "${householdSlug}") would like email reminders for Mum's medication, ` +
      `but this household has no Mum configured.\n\n` +
      `To set it up, open the Baby Tracker add-on Configuration and set mom_parent to 1 or 2 ` +
      `(which parent is Mum) for this household, then restart the add-on.\n`,
  };
}
