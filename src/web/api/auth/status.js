/* GET: is the server set up, is AI on, and which accounts are signed in on this device. */
const { KEY, readSession, json } = require("../_lib");
module.exports = async (req, res) => {
  const s = readSession(req);
  json(res, 200, {
    enabled: !!KEY,
    ai: !!(KEY && process.env.ANTHROPIC_API_KEY),
    accounts: Object.entries(s.a).map(([email, v]) => ({ email, name: v.name || "" })),
  });
};
