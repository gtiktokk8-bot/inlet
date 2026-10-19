/* POST {code}: trade a Google sign-in code for tokens. Keeps the refresh token (encrypted, in a cookie). */
const { GMAIL_SCOPE, readSession, writeSession, json, guard, body, google, revoke } = require("../_lib");
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const { code } = await body(req);
  if (!code || typeof code !== "string") return json(res, 400, { error: "no_code" });
  const t = await google({ code, grant_type: "authorization_code", redirect_uri: "postmessage" });
  if (!t.ok) return json(res, 400, { error: "exchange_failed", detail: t.j.error_description || t.j.error || "" });
  if (!String(t.j.scope || "").split(" ").includes(GMAIL_SCOPE)) { revoke(t.j.access_token); return json(res, 403, { error: "gmail_not_granted" }); }
  const u = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + t.j.access_token } }).then(r => r.json()).catch(() => ({}));
  const email = String(u.email || "").toLowerCase();
  if (!email) return json(res, 400, { error: "no_email" });
  const s = readSession(req);
  const rt = t.j.refresh_token || (s.a[email] && s.a[email].rt);
  if (!rt) {
    /* Google only hands out a refresh token on a fresh approval. Clear the old approval so the next try gets one. */
    await revoke(t.j.access_token);
    return json(res, 409, { error: "need_consent", email });
  }
  s.a[email] = { rt, name: u.name || "" };
  writeSession(res, s);
  json(res, 200, { email, name: u.name || "", access_token: t.j.access_token, expires_in: t.j.expires_in || 3600 });
};
