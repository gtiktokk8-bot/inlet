/* POST {email}: sign an account out of Inlet and revoke its Google access. */
const { readSession, writeSession, json, guard, body, revoke } = require("../_lib");
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const { email } = await body(req);
  const s = readSession(req), k = String(email || "").toLowerCase();
  if (s.a[k]) { await revoke(s.a[k].rt); delete s.a[k]; }
  writeSession(res, s);
  json(res, 200, { ok: true });
};
