// Fetch wrapper: JSON, same-origin cookies, CSRF-safe header, structured errors, network-failure retry hint.
export class ApiError extends Error {
  constructor(status, body, fallback) { super(body?.error?.message || fallback || 'Request failed'); this.status = status; this.code = body?.error?.code || (status ? 'ERROR' : 'NETWORK'); this.details = (body?.error?.details || body?.error?.fields) || null; this.network = status === 0; }
}
export async function api(path, { method = 'GET', body, headers = {}, raw = false, signal } = {}) {
  const opt = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch', ...(method !== 'GET' ? { 'x-csrf-token': (document.cookie.match(/(?:^|; )csrf=([^;]*)/) || [])[1] ? decodeURIComponent(document.cookie.match(/(?:^|; )csrf=([^;]*)/)[1]) : '' } : {}), ...headers }, signal };
  if (body !== undefined && !raw) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); } else if (raw) opt.body = body;
  let res;
  try { res = await fetch(path, opt); } catch (e) { if (e.name === 'AbortError') throw e; throw new ApiError(0, null, 'We could not reach the server. Please check your internet connection and try again.'); }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ApiError(res.status, data, res.status >= 500 ? 'The server had a problem. Please try again.' : undefined);
  return data;
}
export const get = (p, o) => api(p, o);
export const post = (p, body, o) => api(p, { method: 'POST', body, ...o });
export const put = (p, body, o) => api(p, { method: 'PUT', body, ...o });
export const patch = (p, body, o) => api(p, { method: 'PATCH', body, ...o });
export const del = (p, o) => api(p, { method: 'DELETE', ...o });
export const qs = (o) => { const p = new URLSearchParams(); Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); }); const s = p.toString(); return s ? `?${s}` : ''; };
