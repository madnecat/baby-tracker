// Stable machine-readable codes for the JSON errors the web UI can show. The `error` text stays
// English and unchanged (MCP / API-token clients read it); the web app translates by `code`.

// Errors thrown by the services (eventsService, growthService, childService) carry only a message,
// so the routes map the known messages to codes here. server/src/errorCodes.test.js runs the real
// services against this table, so a reworded message fails a test instead of silently losing its code.
const BY_MESSAGE = new Map([
  ['startedAt is required', 'EVENT_STARTED_AT_REQUIRED'],
  ['Event not found', 'EVENT_NOT_FOUND'],
  ['measuredAt is required', 'GROWTH_MEASURED_AT_REQUIRED'],
  ['Growth measurement not found', 'GROWTH_NOT_FOUND'],
  ['name, dateOfBirth and sex (male|female) are required', 'CHILD_FIELDS_REQUIRED'],
]);

export function codeForServiceError(e) {
  const message = e?.message;
  if (typeof message !== 'string') return undefined;
  if (message.startsWith('type must be one of ')) return 'EVENT_TYPE_INVALID';
  return BY_MESSAGE.get(message);
}

/** Sends `{ error, code? }` for an error thrown by a service. */
export function sendServiceError(res, status, e) {
  const code = codeForServiceError(e);
  res.status(status).json(code ? { error: e.message, code } : { error: e.message });
}
