import { tOr, t } from '../i18n/index.js';

/** Error thrown by every api call: `.status` (0 = no response at all), `.code` (server code), `.message`. */
export class ApiError extends Error {
  constructor(message, { status = 0, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Text to show a person for a failed call: the translation of the server's `code`
 * (`errors.<CODE>`), else the server's English message, else a generic translated sentence.
 * Components use this instead of `err.message`.
 */
export function errorMessage(err) {
  if (err?.code) {
    const translated = tOr('errors', err.code, { status: err.status });
    if (translated !== String(err.code)) return translated;
  }
  return err?.message || t('errors.generic');
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    });
  } catch {
    throw new ApiError('Cannot reach the server', { status: 0, code: 'network' });
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code = 'request_failed';
    try {
      const body = await res.json();
      if (body?.error) {
        message = body.error;
        code = body.code;
      }
    } catch {
      // ignore
    }
    throw new ApiError(message, { status: res.status, code });
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  session: () => request('/auth/session'),
  updateLanguage: (language) =>
    request('/auth/language', { method: 'PATCH', body: JSON.stringify({ language }) }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  listEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/events${qs ? `?${qs}` : ''}`);
  },
  activeEvent: (type) => request(`/events/active?type=${encodeURIComponent(type)}`),
  createEvent: (event) => request('/events', { method: 'POST', body: JSON.stringify(event) }),
  updateEvent: (id, patch) =>
    request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),

  listGrowth: () => request('/growth'),
  createGrowth: (entry) => request('/growth', { method: 'POST', body: JSON.stringify(entry) }),
  updateGrowth: (id, patch) =>
    request(`/growth/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteGrowth: (id) => request(`/growth/${id}`, { method: 'DELETE' }),

  getChild: () => request('/child'),
  putChild: (child) => request('/child', { method: 'PUT', body: JSON.stringify(child) }),

  getSettings: () => request('/settings'),
  updateSettings: (patch) =>
    request('/settings', { method: 'PATCH', body: JSON.stringify(patch) }),

  getNotifications: () => request('/notifications'),
  updateNotifications: (patch) =>
    request('/notifications', { method: 'PUT', body: JSON.stringify(patch) }),
  sendTestEmail: () => request('/notifications/test', { method: 'POST' }),
  requestMomSetup: () => request('/notifications/request-mom', { method: 'POST' }),

  milestoneCompletions: () => request('/milestones/completions'),
  setMilestoneCompletion: (key, completed) =>
    request(`/milestones/completions/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ completed }),
    }),

  listApiTokens: () => request('/tokens'),
  createApiToken: (label) => request('/tokens', { method: 'POST', body: JSON.stringify({ label }) }),
  revokeApiToken: (id) => request(`/tokens/${id}`, { method: 'DELETE' }),
};
