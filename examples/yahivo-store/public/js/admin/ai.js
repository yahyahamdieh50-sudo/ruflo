// AI admin assistant: today's summary + plain-language commands. Proposed changes are
// listed with checkboxes and only run after the owner presses Confirm.
import { adminApi, esc, toast } from './core.js';

const EXAMPLES = ['Today’s summary', 'mark YH-1001 packed', 'YH-1001 shipped with iMile 6031225370927', 'YH-1001 paid', 'set Crown black M stock to 5', 'low stock'];

export default async function aiView(el) {
  const { text } = await adminApi('/api/admin/summary');
  el.innerHTML = `
    <h1>AI assistant</h1>
    <p class="muted">Tell the assistant what to do in plain words. It shows each change first; nothing happens until you press <strong>Confirm</strong>.</p>
    <div class="ai-log" id="ai-log" aria-live="polite"></div>
    <div class="ai-examples" id="ai-examples">${EXAMPLES.map((x) => `<button type="button" class="btn btn-ghost btn-small">${esc(x)}</button>`).join('')}</div>
    <form class="ai-form" id="ai-form">
      <label for="ai-input" class="sr-only">Request</label>
      <input id="ai-input" maxlength="1000" autocomplete="off" placeholder="e.g. mark YH-1003 packed">
      <button class="btn" type="submit">Send</button>
    </form>
    <section class="panel ai-reply"><h2>Reply helper</h2>
      <p class="muted">Got a message on TikTok, Instagram, WhatsApp or by email? Paste it here and the AI writes a reply from your store’s information. Check it, then copy and send it yourself. Nothing on the store changes.</p>
      <form id="reply-form">
        <div class="field"><label for="rp-msg">Customer’s message</label><textarea id="rp-msg" maxlength="1000" required placeholder="e.g. Do you have the Crown hoodie in black, size L? How much is delivery to Sharjah?"></textarea></div>
        <div class="field-row">
          <div class="field"><label for="rp-no">Order number <span class="hint">(optional)</span></label><input id="rp-no" maxlength="20" placeholder="YH-1001"></div>
          <div class="field"><label for="rp-em">Order email <span class="hint">(optional)</span></label><input id="rp-em" type="email" maxlength="254"></div>
        </div>
        <button class="btn" type="submit">Suggest a reply</button>
      </form>
      <div id="rp-out" hidden>
        <div class="field"><label for="rp-text">Suggested reply <span class="hint" id="rp-mode"></span></label><textarea id="rp-text" rows="8"></textarea></div>
        <button class="btn btn-ghost btn-small" type="button" id="rp-copy">Copy reply</button>
      </div>
    </section>`;
  const log = el.querySelector('#ai-log');
  const input = el.querySelector('#ai-input');

  const say = (who, content) => {
    const m = document.createElement('div');
    m.className = `ai-msg ai-${who}`;
    m.textContent = content;
    log.append(m);
    m.scrollIntoView({ block: 'nearest' });
    return m;
  };

  function proposal(actions) {
    const box = document.createElement('div');
    box.className = 'ai-msg ai-bot ai-proposal';
    box.innerHTML = `<ul>${actions.map((a, i) => `<li><label class="check"><input type="checkbox" data-i="${i}" ${a.ok ? 'checked' : 'disabled'}> ${esc(a.description)}${a.ok ? '' : ` <span class="field-error">— ${esc(a.error)}</span>`}</label></li>`).join('')}</ul>
      <div class="actions"><button type="button" class="btn btn-small" data-confirm ${actions.some((a) => a.ok) ? '' : 'disabled'}>Confirm</button> <button type="button" class="btn btn-ghost btn-small" data-cancel>Cancel</button></div>`;
    log.append(box);
    box.scrollIntoView({ block: 'nearest' });
    box.querySelector('[data-cancel]').addEventListener('click', () => { box.querySelector('.actions').innerHTML = '<span class="muted small">Cancelled — nothing changed.</span>'; box.querySelectorAll('input').forEach((x) => { x.disabled = true; }); });
    box.querySelector('[data-confirm]').addEventListener('click', async (e) => {
      const chosen = [...box.querySelectorAll('input:checked')].map((x) => actions[Number(x.dataset.i)].action);
      if (!chosen.length) return;
      e.target.disabled = true;
      try {
        const { results } = await adminApi('/api/admin/ai/apply', { method: 'POST', body: { actions: chosen } });
        box.querySelector('.actions').innerHTML = `<ul>${results.map((r) => `<li>${r.ok ? '✓' : '✗'} ${esc(r.description)}${r.ok ? '' : ` — <span class="field-error">${esc(r.error)}</span>`}</li>`).join('')}</ul>`;
        box.querySelectorAll('input').forEach((x) => { x.disabled = true; });
        toast(results.every((r) => r.ok) ? 'Done' : 'Some changes were not applied', { error: !results.every((r) => r.ok) });
      } catch (err) {
        e.target.disabled = false;
        toast(err.message, { error: true });
      }
    });
  }

  async function send(message) {
    const text = message.trim();
    if (!text) return;
    say('me', text);
    const thinking = say('bot', 'Thinking…');
    try {
      const res = await adminApi('/api/admin/ai', { method: 'POST', body: { message: text } });
      thinking.textContent = res.reply || 'Done.';
      if (res.actions.length) proposal(res.actions);
    } catch (err) {
      thinking.textContent = `Sorry — ${err.message}`;
    }
  }

  const rf = el.querySelector('#reply-form');
  rf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = rf.querySelector('button');
    btn.disabled = true;
    try {
      const res = await adminApi('/api/admin/ai/reply', { method: 'POST', body: { message: el.querySelector('#rp-msg').value, orderNumber: el.querySelector('#rp-no').value, email: el.querySelector('#rp-em').value } });
      el.querySelector('#rp-text').value = res.reply;
      el.querySelector('#rp-mode').textContent = res.mode === 'live' ? `(written by ${res.provider === 'openai' ? 'ChatGPT' : res.provider === 'gemini' ? 'Gemini' : 'Claude'})` : '(basic mode — add an AI key for better replies)';
      el.querySelector('#rp-out').hidden = false;
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      btn.disabled = false;
    }
  });
  el.querySelector('#rp-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.querySelector('#rp-text').value); toast('Copied'); } catch { el.querySelector('#rp-text').select(); }
  });

  say('bot', text);
  el.querySelector('#ai-examples').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) send(b.textContent === 'Today’s summary' ? 'summary' : b.textContent); });
  el.querySelector('#ai-form').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; send(v); });
  input.focus();
}
