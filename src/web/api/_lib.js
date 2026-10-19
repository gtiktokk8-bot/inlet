/* Shared helpers for Inlet's tiny server.
   The server never stores mail. It only keeps each signed-in account's Google refresh token,
   encrypted, in an httpOnly cookie on the user's own device, so Inlet can stay signed in. */
const crypto = require("crypto");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "563715878928-ll5nno80bdd0rkaa1l2fmuq28idtht2t.apps.googleusercontent.com";
const SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const KEY = SECRET ? crypto.createHash("sha256").update("inlet-session-v1:" + SECRET).digest() : null;
const COOKIE = "inlet_s";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

const b64u = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return b64u(Buffer.concat([iv, c.getAuthTag(), ct]));
}
function unseal(s) {
  try {
    const b = unb64u(s);
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
  } catch { return null; }
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}
/* session = { a: { "<email>": { rt, name } } } */
function readSession(req) {
  if (!KEY) return { a: {} };
  const raw = cookies(req)[COOKIE];
  const s = raw ? unseal(raw) : null;
  return s && s.a && typeof s.a === "object" ? s : { a: {} };
}
function writeSession(res, s) {
  const empty = !Object.keys(s.a).length;
  res.setHeader("Set-Cookie", `${COOKIE}=${empty ? "" : seal(s)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${empty ? 0 : 31536000}`);
}

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
/* Only same-origin JSON POSTs from the Inlet page itself. */
function guard(req, res) {
  if (req.method !== "POST") { json(res, 405, { error: "method" }); return false; }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const origin = req.headers.origin || "";
  if (!origin || origin.replace(/^https?:\/\//, "") !== host) { json(res, 403, { error: "origin" }); return false; }
  if (!/application\/json/i.test(req.headers["content-type"] || "")) { json(res, 415, { error: "type" }); return false; }
  if (!KEY) { json(res, 501, { error: "not_configured" }); return false; }
  return true;
}
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  let s = ""; for await (const c of req) { s += c; if (s.length > 200000) break; }
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
async function google(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: SECRET, ...params }).toString(),
  });
  let j = {}; try { j = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, j };
}
const revoke = token => fetch("https://oauth2.googleapis.com/revoke", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "token=" + encodeURIComponent(token),
}).catch(() => {});

module.exports = { CLIENT_ID, SECRET, KEY, GMAIL_SCOPE, readSession, writeSession, json, guard, body, google, revoke, seal, unseal };
