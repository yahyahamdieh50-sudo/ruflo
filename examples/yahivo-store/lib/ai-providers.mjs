// Optional extra AI providers: OpenAI (ChatGPT) and Google Gemini, called over their REST APIs
// from the server only (keys never reach the browser). Claude stays the default and uses the
// official SDK in lib/assistant.mjs. A provider is "configured" only when its key AND model are set.

export const PROVIDER_LABELS = { anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini' };

/** Providers to try, in order: AI_PROVIDER first (if configured), then any other configured ones. */
export function configuredProviders(env) {
  const ok = {
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    openai: Boolean(env.OPENAI_API_KEY && env.OPENAI_MODEL),
    gemini: Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL),
  };
  const preferred = ok[env.AI_PROVIDER] ? [env.AI_PROVIDER] : [];
  return [...new Set([...preferred, ...Object.keys(ok).filter((p) => ok[p])])];
}

async function postJson(fetchImpl, url, headers, body) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? `HTTP ${res.status}`), { status: res.status });
  return data;
}

/**
 * One chat completion. history = [{ role: 'user'|'assistant', content }].
 * schema (optional) asks for JSON matching it. Returns the reply text.
 */
export async function providerChat(provider, { system, history, env, schema = null, fetchImpl = fetch }) {
  if (provider === 'openai') {
    const data = await postJson(fetchImpl, 'https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, {
      model: env.OPENAI_MODEL,
      max_completion_tokens: 2000,
      messages: [{ role: 'system', content: system }, ...history],
      ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'response', strict: true, schema } } } : {}),
    });
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Empty OpenAI reply');
    return text.trim();
  }
  if (provider === 'gemini') {
    const model = encodeURIComponent(env.GEMINI_MODEL);
    const data = await postJson(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { 'x-goog-api-key': env.GEMINI_API_KEY }, {
      systemInstruction: { parts: [{ text: schema ? `${system}\n\nReply with JSON only, matching this JSON schema:\n${JSON.stringify(schema)}` : system }] },
      contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 2000, ...(schema ? { responseMimeType: 'application/json' } : {}) },
    });
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
    if (!text) throw new Error('Empty Gemini reply');
    return text;
  }
  throw new Error(`Unknown provider ${provider}`);
}
