async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  session: () => request('/auth/session'),
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
