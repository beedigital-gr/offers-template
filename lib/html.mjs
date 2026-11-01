const HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  if (typeof s !== 'string' && !(typeof s === 'number' && Number.isFinite(s))) throw new TypeError(`escapeHtml: expected text, got ${s === null ? 'null' : typeof s}`);
  return String(s).replace(/[&<>"']/g, (c) => HTML[c]);
}
