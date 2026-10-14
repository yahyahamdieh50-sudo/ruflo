// Shared admin helpers: API (with CSRF header), repeaters for list editing, error display.
import { api, ApiError } from '../api.js';
import { esc } from '../ui.js';

export { esc, ApiError };
export { toast, money } from '../ui.js';

export const adminApi = (path, opts = {}) => api(path, { ...opts, headers: { 'X-YH-Admin': '1', ...(opts.headers ?? {}) } });

const registry = new Map();

function fieldHtml(f, value, idPrefix) {
  const id = `${idPrefix}-${f.key}`;
  const v = value ?? f.default ?? (f.type === 'checkbox' ? false : '');
  const req = f.required ? ' required' : '';
  const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
  if (f.type === 'checkbox') return `<label class="check"><input type="checkbox" name="${f.key}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
  if (f.type === 'textarea') return `<div class="field"><label for="${id}">${esc(f.label)} ${hint}</label><textarea id="${id}" name="${f.key}"${req}>${esc(v)}</textarea></div>`;
  if (f.type === 'select') return `<div class="field"><label for="${id}">${esc(f.label)} ${hint}</label><select id="${id}" name="${f.key}">${f.options.map(([val, label]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>`;
  const val = f.type === 'list' ? (Array.isArray(v) ? v.join(', ') : v) : v;
  const type = f.type === 'number' ? 'number" step="0.01" min="0' : 'text';
  return `<div class="field"><label for="${id}">${esc(f.label)} ${hint}</label><input id="${id}" name="${f.key}" type="${type}" value="${esc(val)}"${req}></div>`;
}

let uid = 0;
function rowHtml(name, fields, row) {
  const p = `r${++uid}`;
  return `<div class="repeater-row" data-row>
    <div class="repeater-grid">${fields.filter((f) => f.type !== 'checkbox' && f.type !== 'textarea').map((f) => fieldHtml(f, row?.[f.key], p)).join('')}</div>
    ${fields.filter((f) => f.type === 'textarea').map((f) => fieldHtml(f, row?.[f.key], p)).join('')}
    ${fields.filter((f) => f.type === 'checkbox').map((f) => fieldHtml(f, row?.[f.key], p)).join('')}
    <button type="button" class="link-btn" data-remove-row>Remove</button>
  </div>`;
}

/** Editable list of objects. Read back with readRepeater(). */
export function repeater(name, fields, rows, { addLabel = 'Add', empty = 'None yet.' } = {}) {
  registry.set(name, fields);
  return `<div data-repeater="${name}">
    <div data-rows>${rows.length ? rows.map((r) => rowHtml(name, fields, r)).join('') : `<p class="muted" data-empty>${esc(empty)}</p>`}</div>
    <button type="button" class="btn btn-ghost btn-small" data-add-row="${name}">+ ${esc(addLabel)}</button>
  </div>`;
}

export function bindRepeaters(root) {
  root.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-row]');
    const rm = e.target.closest('[data-remove-row]');
    if (add) {
      const name = add.dataset.addRow;
      const rows = root.querySelector(`[data-repeater="${name}"] [data-rows]`);
      rows.querySelector('[data-empty]')?.remove();
      rows.insertAdjacentHTML('beforeend', rowHtml(name, registry.get(name), null));
      rows.lastElementChild.querySelector('input, select, textarea')?.focus();
    } else if (rm) rm.closest('[data-row]').remove();
  });
}

export function readValue(el, type) {
  if (type === 'checkbox') return el.checked;
  const v = el.value.trim();
  if (type === 'number') return v === '' ? null : Number(v);
  if (type === 'list') return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return v === '' ? null : v;
}

export function readRepeater(root, name) {
  const fields = registry.get(name);
  return [...root.querySelectorAll(`[data-repeater="${name}"] [data-row]`)].map((row) => Object.fromEntries(fields.map((f) => [f.key, readValue(row.querySelector(`[name="${f.key}"]`), f.type)])));
}

/** Show API validation errors: mark matching inputs and list every message. */
export function showErrors(form, fields = {}, { message } = {}) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  let box = form.querySelector('[data-errors]');
  if (!box) { box = document.createElement('div'); box.dataset.errors = ''; box.setAttribute('role', 'alert'); form.prepend(box); }
  const entries = Object.entries(fields);
  for (const [key] of entries) {
    const parts = key.split('.');
    let el = null;
    if (parts.length >= 3 && /^\d+$/.test(parts[1])) {
      el = form.querySelectorAll(`[data-repeater="${parts[0]}"] [data-row]`)[Number(parts[1])]?.querySelector(`[name="${parts[2]}"]`);
    } else if (parts.length === 2 && /^\d+$/.test(parts[0])) {
      el = form.querySelectorAll('[data-row]')[Number(parts[0])]?.querySelector(`[name="${parts[1]}"]`);
    }
    el ??= form.querySelector(`[name="${CSS.escape(key)}"]`);
    el?.setAttribute('aria-invalid', 'true');
  }
  box.innerHTML = entries.length || message ? `<div class="notice notice-err"><strong>${esc(message ?? 'Please fix the following:')}</strong><ul>${entries.map(([, m]) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : '';
  if (entries.length || message) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

export function clearErrors(form) { showErrors(form, {}); }

export const STATUS = {
  received: 'Received', preparing: 'Preparing', packed: 'Packed',
  handed_to_courier: 'Handed to courier', delivered: 'Delivered', cancelled: 'Cancelled',
};
export const statusPill = (s) => `<span class="status status-${esc(s)}">${esc(STATUS[s] ?? s)}</span>`;
