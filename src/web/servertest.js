/* Unit tests for Inlet's Vercel functions with a fake Google + Anthropic. Run: node servertest.js */
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.ANTHROPIC_API_KEY = "test-key";
const path = require("path");
const D = path.join(__dirname, "dist", "api");
const H = n => require(path.join(D, n));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

let google = {}; const calls = [];
global.fetch = async (url, opt = {}) => {
  calls.push({ url: String(url), opt });
  const u = String(url);
  const J = (o, s = 200) => ({ ok: s < 300, status: s, json: async () => o });
  if (u.includes("oauth2.googleapis.com/token")) {
    const p = new URLSearchParams(opt.body);
    if (p.get("grant_type") === "authorization_code") return J(google.exchange(p), google.exStatus || 200);
    if (p.get("grant_type") === "refresh_token") return p.get("refresh_token") === "RT-good" ? J({ access_token: "AT-new", expires_in: 3599 }) : J({ error: "invalid_grant" }, 400);
  }
  if (u.includes("/revoke")) return J({});
  if (u.includes("userinfo")) return J({ email: "Gabe@Example.com", name: "Gabe T" });
  if (u.includes("api.anthropic.com")) {
    const sse = ['event: message_start\ndata: {"type":"message_start"}\n\n', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n\n', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}\n\ndata: {"type":"message_stop"}\n\n'];
    const body = JSON.parse(opt.body); google.aiBody = body;
    return { ok: true, status: 200, body: new ReadableStream({ start(c) { sse.forEach(s => c.enqueue(new TextEncoder().encode(s))); c.close(); } }) };
  }
  return J({ error: "unexpected " + u }, 500);
};

function req(method, bodyObj, cookie, origin = "https://inlet.test") {
  return { method, body: bodyObj, headers: { host: "inlet.test", origin, "content-type": "application/json", cookie: cookie || "" } };
}
function res() {
  const r = { statusCode: 200, headers: {}, chunks: [], setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, write(c) { this.chunks.push(String(c)); }, end(c) { if (c) this.chunks.push(String(c)); this.done = true; } };
  r.json = () => JSON.parse(r.chunks.join(""));
  r.cookie = () => { const m = /inlet_s=([^;]*)/.exec(r.headers["set-cookie"] || ""); return m ? "inlet_s=" + m[1] : ""; };
  return r;
}

(async () => {
  const GM = "https://www.googleapis.com/auth/gmail.modify";
  // status, empty
  let r = res(); await H("auth/status.js")(req("GET"), r);
  ok(r.json().enabled === true && r.json().ai === true && r.json().accounts.length === 0, "status: enabled, ai on, no accounts");

  // origin guard
  r = res(); await H("auth/exchange.js")(req("POST", { code: "x" }, "", "https://evil.test"), r);
  ok(r.statusCode === 403, "exchange: other website is refused");
  r = res(); await H("auth/exchange.js")(req("GET"), r);
  ok(r.statusCode === 405, "exchange: GET refused");

  // missing Gmail permission
  google.exchange = () => ({ access_token: "AT1", expires_in: 3599, scope: "openid email", refresh_token: "RT-good" });
  r = res(); await H("auth/exchange.js")(req("POST", { code: "c1" }), r);
  ok(r.statusCode === 403 && r.json().error === "gmail_not_granted", "exchange: Gmail box unticked is refused");

  // no refresh token on first try -> 409 + revoke
  calls.length = 0;
  google.exchange = () => ({ access_token: "AT1", expires_in: 3599, scope: "openid " + GM });
  r = res(); await H("auth/exchange.js")(req("POST", { code: "c2" }), r);
  ok(r.statusCode === 409 && r.json().error === "need_consent", "exchange: no refresh token asks for one more approval");
  ok(calls.some(c => c.url.includes("/revoke")), "exchange: old approval revoked so next try gets a refresh token");

  // success
  google.exchange = () => ({ access_token: "AT2", expires_in: 3599, scope: "openid " + GM, refresh_token: "RT-good" });
  r = res(); await H("auth/exchange.js")(req("POST", { code: "c3" }), r);
  const j = r.json(); const ck = r.cookie();
  ok(r.statusCode === 200 && j.email === "gabe@example.com" && j.access_token === "AT2" && !("refresh_token" in j), "exchange: signs in, never sends refresh token to the page");
  ok(/HttpOnly/.test(r.headers["set-cookie"]) && /Secure/.test(r.headers["set-cookie"]) && /SameSite=Strict/.test(r.headers["set-cookie"]) && ck.length > 40 && !ck.includes("RT-good"), "exchange: cookie is httpOnly, secure, encrypted");

  // status lists the account
  r = res(); await H("auth/status.js")(req("GET", null, ck), r);
  ok(r.json().accounts.length === 1 && r.json().accounts[0].email === "gabe@example.com", "status: lists signed-in account");

  // tampered cookie ignored
  r = res(); await H("auth/status.js")(req("GET", null, ck.slice(0, -4) + "AAAA"), r);
  ok(r.json().accounts.length === 0, "status: tampered cookie ignored");

  // refresh
  r = res(); await H("auth/token.js")(req("POST", { email: "gabe@example.com" }, ck), r);
  ok(r.statusCode === 200 && r.json().access_token === "AT-new", "token: renews silently");
  r = res(); await H("auth/token.js")(req("POST", { email: "other@example.com" }, ck), r);
  ok(r.statusCode === 401, "token: unknown account refused");

  // later sign-in without refresh token keeps existing one
  google.exchange = () => ({ access_token: "AT3", expires_in: 3599, scope: "openid " + GM });
  r = res(); await H("auth/exchange.js")(req("POST", { code: "c4" }, ck), r);
  ok(r.statusCode === 200, "exchange: re-sign-in keeps the saved refresh token");

  // AI
  r = res(); await H("ai.js")(req("POST", { prompt: "hi" }, ""), r);
  ok(r.statusCode === 401, "ai: refused when not signed in");
  r = res(); await H("ai.js")(req("POST", { prompt: "hi", tier: "quick" }, ck), r);
  ok(r.statusCode === 200 && r.chunks.join("") === "Hello there" && r.done, "ai: streams text back");
  ok(google.aiBody.model === "claude-haiku-5-5" && google.aiBody.stream === true, "ai: quick tier uses the fast model");
  r = res(); await H("ai.js")(req("POST", { prompt: "draft" }, ck), r);
  ok(google.aiBody.model === "claude-sonnet-5-5", "ai: drafts use the stronger model");

  // expired refresh token -> account dropped
  const { seal } = H("_lib.js");
  const bad = "inlet_s=" + seal({ a: { "x@example.com": { rt: "RT-revoked", name: "" } } });
  r = res(); await H("auth/token.js")(req("POST", { email: "x@example.com" }, bad), r);
  ok(r.statusCode === 401 && r.json().error === "expired" && /Max-Age=0/.test(r.headers["set-cookie"]), "token: revoked access signs that account out");

  // remove
  r = res(); await H("auth/remove.js")(req("POST", { email: "gabe@example.com" }, ck), r);
  ok(r.statusCode === 200 && /Max-Age=0/.test(r.headers["set-cookie"]), "remove: signs out and clears cookie");

  // not configured
  delete require.cache[require.resolve(path.join(D, "_lib.js"))];
  for (const k of Object.keys(require.cache)) if (k.startsWith(D)) delete require.cache[k];
  delete process.env.GOOGLE_CLIENT_SECRET;
  r = res(); await H("auth/status.js")(req("GET"), r);
  ok(r.json().enabled === false && r.json().ai === false, "status: without the secret, server mode is off (app falls back)");
  r = res(); await H("auth/exchange.js")(req("POST", { code: "x" }), r);
  ok(r.statusCode === 501, "exchange: 501 when not configured");

  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
