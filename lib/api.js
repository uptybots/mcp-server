const BASE_URL = process.env.UPTYBOTS_API_URL || 'https://uptybots.com';
const API_KEY = process.env.UPTYBOTS_API_KEY || '';

let _userIri = null;

export async function getUserIri() {
  if (_userIri) return _userIri;
  const data = await apiRequest('GET', '/api/me');
  _userIri = data['@id'];
  return _userIri;
}

export async function apiRequest(method, path, body = null) {
  const url = `${BASE_URL}${path}`;

  const headers = {
    'X-API-Key': API_KEY,
    'Accept': 'application/ld+json',
  };

  if (body) {
    headers['Content-Type'] = method === 'PATCH'
      ? 'application/merge-patch+json'
      : 'application/ld+json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json['hydra:description'] || json.detail || json.message || text;
    } catch {}
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export function buildQuery(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

function formatCollection(data) {
  return {
    items: data['hydra:member'] || data['member'] || [],
    totalItems: data['hydra:totalItems'] ?? data['totalItems'] ?? null,
  };
}

// --- Monitors ---

// 30 per page is what the list_monitors description promises; the API's own
// default is 10, so it is asked for explicitly, same as the remote server does.
export async function listMonitors({ type, status, page, itemsPerPage = 30 } = {}) {
  const qs = buildQuery({ type, statusSummary: status, page, itemsPerPage });
  const data = await apiRequest('GET', `/api/targets${qs}`);
  return formatCollection(data);
}

export async function getMonitor(id) {
  return apiRequest('GET', `/api/targets/${id}`);
}

export async function createMonitor(endpoint, body) {
  const result = await apiRequest('POST', `/api/targets${endpoint}`, body);
  if (result && result.id) return result;
  // POST returns null body — fetch the newest monitor by name
  const qs = buildQuery({ 'order[id]': 'desc', itemsPerPage: 1 });
  const list = await apiRequest('GET', `/api/targets${qs}`);
  const items = list['hydra:member'] || list['member'] || [];
  return items[0] || { success: true, message: 'Monitor created' };
}

export async function updateMonitor(endpoint, id, body) {
  return apiRequest('PATCH', `/api/targets${endpoint}/${id}`, body);
}

export async function toggleMonitor(id, isActive) {
  const result = await apiRequest('PATCH', `/api/targets/${id}/is_active`, { isActive });
  if (result && result.id) return result;
  return apiRequest('GET', `/api/targets/${id}`);
}

export async function deleteMonitor(id) {
  return apiRequest('DELETE', `/api/targets/${id}`);
}

// --- Incidents ---

export async function getIncidents({ monitorId, page } = {}) {
  const qs = buildQuery({ 'target.id': monitorId, page });
  const data = await apiRequest('GET', `/api/target_incidents${qs}`);
  return formatCollection(data);
}

// --- Stats ---

export async function getStatsHourly({ monitorId, dateFrom, dateTo, page } = {}) {
  const qs = buildQuery({
    'target.id': monitorId,
    'date[after]': dateFrom,
    'date[before]': dateTo,
    page,
  });
  const data = await apiRequest('GET', `/api/target_stats_hourlies${qs}`);
  return formatCollection(data);
}

export async function getStatsDaily({ monitorId, dateFrom, dateTo, page } = {}) {
  const qs = buildQuery({
    'target.id': monitorId,
    'date[after]': dateFrom,
    'date[before]': dateTo,
    page,
  });
  const data = await apiRequest('GET', `/api/target_stats_dailies${qs}`);
  return formatCollection(data);
}

// --- Notifications ---

export async function getNotifications({ channel, status, page } = {}) {
  const qs = buildQuery({ channel, status, page });
  const data = await apiRequest('GET', `/api/user_notifications${qs}`);
  return formatCollection(data);
}
