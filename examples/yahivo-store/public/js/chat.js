// Shopping assistant panel. Replies are rendered with textContent / esc() only.
import { api } from './api.js';
import { esc, money, productMedia } from './ui.js';

const KEY = 'yh_chat_v1';
const SUGGESTIONS = ['Where is my order?', 'Recommend a black hoodie in M', 'How much is delivery?', 'How do I find my size?', 'Can I pay cash on delivery?'];

export function initChat(settings) {
  const launcher = document.getElementById('chat-launcher');
  const panel = document.getElementById('chat-panel');
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const suggest = document.getElementById('chat-suggest');
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY) ?? '[]').slice(-20); } catch { history = []; }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(history.slice(-20))); } catch { /* ignore */ } };

  document.getElementById('chat-mode').innerHTML = settings.aiMode === 'live'
    ? 'AI customer support, 24/7. Answers from YAHIVO store info and checks orders with your order number + email.'
    : '<strong>Basic mode</strong> — automatic answers from store info (full AI not connected yet). Checks orders with your order number + email.';

  function bubble(m) {
    const el = document.createElement('div');
    el.className = `msg msg-${m.role === 'user' ? 'user' : 'bot'}`;
    const text = document.createElement('div');
    text.textContent = m.content;
    el.append(text);
    if (m.notice) { const n = document.createElement('p'); n.className = 'muted small'; n.textContent = m.notice; el.prepend(n); }
    if (m.products?.length) {
      const wrap = document.createElement('div');
      wrap.className = 'msg-products';
      wrap.innerHTML = m.products.map((p) => `<a class="msg-product" href="/product/${esc(p.slug)}" data-link><span class="mp-media">${productMedia(p)}</span><span><strong>${esc(p.name)}</strong><span class="muted small">${esc(money(p.price))} · ${esc(p.colors.map((c) => c.name).join(', '))}</span></span></a>`).join('');
      el.append(wrap);
    }
    if (m.links?.length) {
      const wrap = document.createElement('div');
      wrap.className = 'msg-links';
      wrap.innerHTML = m.links.filter((l) => /^\/[a-z0-9/-]*$/.test(l.href)).map((l) => `<a class="btn btn-ghost btn-small" href="${esc(l.href)}" data-link>${esc(l.label)}</a>`).join('');
      el.append(wrap);
    }
    log.append(el);
    log.scrollTop = log.scrollHeight;
  }

  function renderAll() {
    log.innerHTML = '';
    bubble({ role: 'assistant', content: `Hi! I’m ${settings.brand}’s AI assistant. I can help you choose a hoodie, answer questions about sizing, delivery, payment and returns, and check your order status — just send your order number and the email you used at checkout.` });
    history.forEach(bubble);
    suggest.innerHTML = history.length ? '' : SUGGESTIONS.map((s) => `<button type="button">${esc(s)}</button>`).join('');
  }

  const open = (state) => {
    panel.hidden = !state;
    launcher.setAttribute('aria-expanded', String(state));
    launcher.hidden = state;
    if (state) { renderAll(); input.focus(); } else launcher.focus();
  };
  launcher.addEventListener('click', () => open(true));
  // Any page can open the assistant with a [data-open-chat] button.
  document.addEventListener('click', (e) => { if (e.target.closest('[data-open-chat]')) { e.preventDefault(); open(true); } });
  document.getElementById('chat-close').addEventListener('click', () => open(false));
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  panel.addEventListener('click', (e) => { if (e.target.closest('a[data-link]') && window.matchMedia('(max-width: 599px)').matches) open(false); });
  suggest.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) send(b.textContent); });

  let pending = false;
  async function send(text) {
    const content = text.trim().slice(0, 1000);
    if (!content || pending) return;
    pending = true;
    suggest.innerHTML = '';
    history.push({ role: 'user', content });
    bubble(history[history.length - 1]);
    const typing = document.createElement('div');
    typing.className = 'msg msg-bot typing';
    typing.textContent = 'Thinking';
    log.append(typing);
    try {
      const res = await api('/api/assistant', { method: 'POST', body: { messages: history.slice(-10).map(({ role, content: c }) => ({ role, content: c })) } });
      history.push({ role: 'assistant', content: res.reply, products: res.products, links: res.links, notice: res.notice });
    } catch (e) {
      history.push({ role: 'assistant', content: `Sorry — ${e.message} You can also reach the team via the Contact page.`, links: [{ href: '/contact', label: 'Contact' }] });
    }
    typing.remove();
    bubble(history[history.length - 1]);
    save();
    pending = false;
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; send(v); });
}
