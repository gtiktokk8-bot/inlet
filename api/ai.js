/* POST {prompt, tier}: Catch me up / reply drafts / Feed summaries, streamed back as plain text.
   Only works for someone signed in to Inlet on this device (test users on the Google project). */
const { readSession, json, guard, body } = require("./_lib");
const MODELS = { quick: process.env.INLET_AI_MODEL_QUICK || "claude-haiku-5-5", default: process.env.INLET_AI_MODEL || "claude-sonnet-5-5" };
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  if (!Object.keys(readSession(req).a).length) return json(res, 401, { error: "not_signed_in" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(res, 501, { error: "ai_off" });
  const { prompt, tier } = await body(req);
  if (!prompt || typeof prompt !== "string") return json(res, 400, { error: "no_prompt" });
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: tier === "quick" ? MODELS.quick : MODELS.default, max_tokens: 1024, stream: true,
        messages: [{ role: "user", content: prompt.slice(0, 40000) }] }),
    });
  } catch { return json(res, 502, { error: "ai_unreachable" }); }
  if (!r.ok) return json(res, r.status === 429 || r.status === 529 ? 429 : 502, { error: r.status === 429 || r.status === 529 ? "rate_limited" : "ai_error" });
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      try { const ev = JSON.parse(line.slice(5)); if (ev.type === "content_block_delta" && ev.delta && ev.delta.text) res.write(ev.delta.text); } catch {}
    }
  }
  res.end();
};
