// Messages for the `code` the server (or the api client) attaches to a failed call. Shown through
// errorMessage(err) in api/client.js. Keys are the codes themselves.
export default {
  'errors.generic': 'Something went wrong. Please try again.',
  'errors.network': "Can't reach the server. Check your connection and try again.",
  'errors.request_failed': 'The request failed ({status}).',

  'errors.AUTH_MISSING_FIELDS': 'Enter your username and password.',
  'errors.AUTH_INVALID_CREDENTIALS': 'Invalid username or password.',
  'errors.AUTH_NOT_AUTHENTICATED': 'Your session has expired. Please sign in again.',
  'errors.PASSWORD_FIELDS_REQUIRED': 'Enter your current password and a new password.',
  'errors.PASSWORD_WRONG': 'Current password is incorrect.',
  'errors.LANGUAGE_INVALID': 'That language is not supported.',
  'errors.TOKEN_LABEL_REQUIRED': 'Enter a label for the token.',

  'errors.EVENT_TYPE_REQUIRED': 'The event type is missing.',
  'errors.EVENT_TYPE_INVALID': 'That event type is not valid.',
  'errors.EVENT_STARTED_AT_REQUIRED': 'Enter a date and time.',
  'errors.EVENT_NOT_FOUND': 'This entry no longer exists.',
  'errors.GROWTH_MEASURED_AT_REQUIRED': 'Enter the date of the measurement.',
  'errors.GROWTH_NOT_FOUND': 'This measurement no longer exists.',
  'errors.CHILD_FIELDS_REQUIRED': 'Enter a name, a date of birth and the sex.',

  'errors.EMAIL_INVALID': 'That email address does not look valid.',
  'errors.PREFS_ENABLED_INVALID': 'The reminders setting is not valid.',
  'errors.PREFS_EMAIL_REQUIRED': 'Enter an email address first.',
  'errors.MAIL_NOT_CONFIGURED': 'Email reminders are not set up on this server.',
  'errors.MAIL_EMAIL_NOT_SAVED': 'Save an email address first.',
  'errors.RATE_LIMITED': 'Too many test emails. Try again in an hour.',
  'errors.MAIL_SEND_FAILED': 'The test email could not be sent. Check the server mail settings.',
  'errors.ADMIN_CONTACT_MISSING': 'There is no administrator contact set up on this server.',
  'errors.MOM_ALREADY_SET': 'Mum is already set up for this household.',
  'errors.ADMIN_REQUEST_ALREADY_SENT': 'A request was already sent today.',
  'errors.ADMIN_REQUEST_FAILED': 'The request could not be sent.',
};
