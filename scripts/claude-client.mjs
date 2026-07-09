// Claude (Anthropic) client for the transcript generator. Raw HTTP, consistent
// with the ElevenLabs/Recraft clients. Key from .env (node --env-file=.env).
// Model: Claude Opus 4.8 with adaptive thinking.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
export const hasAnthropicKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function generateText({ system, user, maxTokens = 16000 }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (add it to .env)');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  if (j.stop_reason === 'refusal') throw new Error('The model declined this request.');
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return { text, truncated: j.stop_reason === 'max_tokens' };
}
