/* POST {email}: a fresh 1-hour Google access token for an account signed in on this device. */
const { readSession, writeSession, json, guard, body, google } = require("../_lib");
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const { email } = await body(req);
  const s = readSession(req);
  const a = s.a[String(email || "").toLowerCase()];
  if (!a) return json(res, 401, { error: "no_session" });
  const t = await google({ refresh_token: a.rt, grant_type: "refresh_token" });
  if (!t.ok) {
    if (t.j.error === "invalid_grant") { delete s.a[String(email).toLowerCase()]; writeSession(res, s); return json(res, 401, { error: "expired" }); }
    return json(res, 502, { error: "google_error" });
  }
  json(res, 200, { access_token: t.j.access_token, expires_in: t.j.expires_in || 3600 });
};
