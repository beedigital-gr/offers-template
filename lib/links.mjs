// encodeURIComponent plus !'()* so a link is also safe in a single-quoted attribute.
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const LOCAL = String.raw`[^\s"<>\\,;:?&#/@%]+`;
const LABEL = String.raw`[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?`;
const EMAIL = new RegExp(`^${LOCAL}@${LABEL}(?:\\.${LABEL})+$`, 'u');

function requireText(value, name, fn) {
  if (typeof value !== 'string' || value === '') throw new Error(`${fn}: ${name} must be non-empty text, got ${JSON.stringify(value)}`);
}

// E.164 digits from "+30 690…" or "0030 690…", else null.
export function internationalPhone(phone) {
  if (typeof phone !== 'string' || /\(\s*0\s*\)/.test(phone)) return null;
  const m = /^(?:\+|00)(\d+)$/.exec(phone.replace(/[\s().-]/g, ''));
  // Greek numbers never keep the trunk 0 after +30; other countries (Italy) may.
  return m && /^[1-9]\d{7,14}$/.test(m[1]) && !m[1].startsWith('300') ? m[1] : null;
}

export const isEmail = (email) => typeof email === 'string' && EMAIL.test(email);

export function chatgptUrlProblem(url) {
  const bad = `must be a https://chatgpt.com/... link without "#", got ${JSON.stringify(url)}`;
  if (typeof url !== 'string' || url.includes('#')) return bad;
  let u;
  try {
    u = new URL(url);
  } catch {
    return bad;
  }
  return u.protocol !== 'https:' || u.hostname !== 'chatgpt.com' || u.port || u.username || u.password ? bad : null;
}

export function isHttpsUrl(v) {
  if (typeof v !== 'string' || !/^https:\/\/[^\s"<>]+$/.test(v)) return false;
  try {
    return new URL(v).hostname !== '';
  } catch {
    return false;
  }
}

// null means "no usable number": the caller hides the button.
export function whatsappLink(phone, text) {
  requireText(text, 'text', 'whatsappLink');
  const digits = internationalPhone(phone);
  return digits && `https://wa.me/${digits}?text=${enc(text)}`;
}

export function mailtoLink(email, subject, body) {
  requireText(subject, 'subject', 'mailtoLink');
  requireText(body, 'body', 'mailtoLink');
  if (!isEmail(email)) return null;
  return `mailto:${email}?subject=${enc(subject)}&body=${enc(body.replace(/\r?\n/g, '\r\n'))}`;
}

// URL parses and drops any old q; q itself is appended with enc() so it matches the other links.
export function chatgptLink(text, projectUrl) {
  requireText(text, 'text', 'chatgptLink');
  if (projectUrl === undefined) return `https://chatgpt.com/?q=${enc(text)}`;
  const problem = chatgptUrlProblem(projectUrl);
  if (problem) throw new Error(`chatgptLink: projectUrl ${problem}`);
  const u = new URL(projectUrl);
  u.searchParams.delete('q');
  return `${u.href}${u.search ? '&' : '?'}q=${enc(text)}`;
}
