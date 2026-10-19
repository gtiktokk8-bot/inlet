// E2E for server mode: lasting sign-in (refresh via /api/auth/*) and AI (/api/ai), against fake Google + fake Inlet API.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const DIST = path.join(__dirname, 'dist'); const OUT = path.join(__dirname, 'shots-server'); fs.mkdirSync(OUT, { recursive: true });
const issues = []; const ok = (c, m) => { if (!c) issues.push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
const b64u = s => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const now = Date.now(); const H = h => String(now - h * 3600e3);
const A = 'gabe@guruconsultans.com', C = 'christen@example.com';
function msg(id, tid, from, to, subj, body, h, labels) {
  const headers = [{ name: 'From', value: from }, { name: 'To', value: to }, { name: 'Subject', value: subj }, { name: 'Message-ID', value: `<${id}@mail.test>` }];
  return { id, threadId: tid, internalDate: H(h), snippet: body.slice(0, 90), labelIds: labels, sizeEstimate: 4000, payload: { mimeType: 'text/plain', headers, body: { data: b64u(body) } } };
}
const DB = {
  [A]: { name: 'Gabe Trastoy', threads: { ta1: [msg('a1', 'ta1', 'Jordan Ellis <jordan@uni.edu>', A, 'Recruiting video', 'Can you send grades by Friday?', 1, ['INBOX', 'UNREAD'])],
                                          ta2: [msg('a2', 'ta2', 'Weekly Digest <news@letters.test>', A, 'Weekly digest', 'Top stories.', 5, ['INBOX', 'CATEGORY_PROMOTIONS'])] } },
  [C]: { name: 'Christen', threads: { tc1: [msg('c1', 'tc1', 'Maria Lopez <maria@venue.test>', C, 'Tasting', 'Tasting is set for Saturday at 2.', 2, ['INBOX'])] } },
};
const session = new Set(); let tokenCalls = 0, exchangeCalls = 0, needConsentOnce = new Set([C]), revokedServer = new Set(), aiPrompts = [], gen = 0;
const tokOf = e => 'tok-' + e + '-' + (++gen);
const valid = new Map(); // token -> email
const GIS = `window.google={accounts:{oauth2:{initCodeClient(cfg){return{requestCode(){const e=cfg.login_hint||(window.__next||[]).shift();setTimeout(()=>e?cfg.callback({code:'code-'+e}):cfg.error_callback({type:'popup_closed'}),20);}}},initTokenClient(){throw new Error('token client should not be used in server mode')},hasGrantedAllScopes(){return true},revoke(t,cb){cb&&cb()}}}};`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); await p.clock.install();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/status of 40[19]/.test(m.text())) errs.push(m.text()); });
  await ctx.route('**/*', async route => {
    const req = route.request(); const u = new URL(req.url());
    const json = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.host === 'inlet.test' && u.pathname.startsWith('/api/')) {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      if (u.pathname === '/api/auth/status') return json({ enabled: true, ai: true, accounts: [...session].map(email => ({ email, name: DB[email].name })) });
      if (req.method() !== 'POST' || req.headers()['content-type'] !== 'application/json') return json({ error: 'bad' }, 405);
      if (u.pathname === '/api/auth/exchange') { exchangeCalls++; const e = body.code.replace('code-', '');
        if (needConsentOnce.has(e)) { needConsentOnce.delete(e); return json({ error: 'need_consent', email: e }, 409); }
        session.add(e); const t = tokOf(e); valid.set(t, e); return json({ email: e, name: DB[e].name, access_token: t, expires_in: 3600 }); }
      if (u.pathname === '/api/auth/token') { tokenCalls++; if (!session.has(body.email) || revokedServer.has(body.email)) { session.delete(body.email); return json({ error: 'expired' }, 401); }
        const t = tokOf(body.email); valid.set(t, body.email); return json({ access_token: t, expires_in: 3600 }); }
      if (u.pathname === '/api/auth/remove') { session.delete(body.email); return json({ ok: true }); }
      if (u.pathname === '/api/ai') { if (!session.size) return json({ error: 'not_signed_in' }, 401); aiPrompts.push(body);
        return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: body.tier === 'quick' ? '• Jordan wants grades.\n• Open: send grades by Friday.' : 'Hi Jordan, I will send the grades by Friday.' }); }
      return json({}, 404);
    }
    if (u.host === 'inlet.test') { const f = path.join(DIST, u.pathname === '/' ? 'index.html' : u.pathname); return fs.existsSync(f) ? route.fulfill({ path: f }) : route.fulfill({ status: 404 }); }
    if (u.host === 'accounts.google.com') return route.fulfill({ contentType: 'text/javascript', body: GIS });
    const email = valid.get((req.headers()['authorization'] || '').replace('Bearer ', '')); const acct = DB[email];
    if (!acct) return json({ error: { message: 'unauth' } }, 401);
    const m = u.pathname.match(/\/gmail\/v1\/users\/me\/(.*)$/); if (!m) return json({ id: 'x' });
    const rest = m[1]; let mm;
    if (rest === 'threads') { const q = u.searchParams.get('q') || ''; const ids = Object.keys(acct.threads).filter(id => q.includes('in:sent') ? false : acct.threads[id].some(x => x.labelIds.includes('INBOX'))); return json({ threads: ids.map(id => ({ id, historyId: '1' + acct.threads[id].map(x => x.labelIds.join()).join() })) }); }
    if ((mm = rest.match(/^threads\/([^/?]+)\/modify$/))) { const bd = JSON.parse(req.postData()); acct.threads[mm[1]].forEach(x => x.labelIds = x.labelIds.filter(l => !bd.removeLabelIds.includes(l))); return json({}); }
    if ((mm = rest.match(/^threads\/([^/?]+)$/))) { const t = acct.threads[mm[1]]; return t ? json({ id: mm[1], messages: t }) : json({}, 404); }
    return json({}, 404);
  });
  const T = ms => p.clock.runFor(ms);
  await p.goto('https://inlet.test/'); await p.waitForTimeout(600);
  if (await p.locator('#welcome').isVisible()) { await p.click('#welcomeGo'); await p.waitForTimeout(400); }
  ok(await p.locator('.gate').isVisible(), 'sign-in screen shows first');
  await p.evaluate(e => { window.__next = [e]; }, A);
  await p.locator('.gate .gbtn').first().click(); await p.waitForTimeout(900);
  ok(!(await p.locator('.gate').count()) && exchangeCalls === 1, 'signs in through the lasting (code) flow');
  ok(await p.locator('#peopleList .row', { hasText: 'Jordan Ellis' }).count() === 1, 'mail loads after sign-in');
  ok(await p.evaluate(() => !JSON.stringify(localStorage).includes('refresh')), 'no refresh token stored in the page');
  // an hour passes: token expires, should renew silently, no banner
  await p.evaluate(() => { window.__inletTest.accounts().forEach(a => { a.exp = 0; }); });
  const before = tokenCalls; await T(61000); await p.waitForTimeout(800);
  ok(tokenCalls > before, 'expired token renews silently in the background');
  ok(!(await p.locator('#rebar').count()), 'no Reconnect bar after an hour');
  ok(await p.locator('#peopleList .row', { hasText: 'Jordan Ellis' }).count() === 1, 'mail keeps loading after renewal');
  // Google rejects a token mid-use (401) -> renew + retry once
  await p.evaluate(() => { window.__inletTest.accounts()[0].token = 'tok-bogus'; window.__inletTest.accounts()[0].exp = Date.now() + 3e6; });
  const b2 = tokenCalls; await T(61000); await p.waitForTimeout(800);
  ok(tokenCalls > b2 && !(await p.locator('#rebar').count()), 'a rejected token is renewed and the request retried');
  // AI: Catch me up + Draft a reply
  await p.locator('#peopleList .row', { hasText: 'Jordan Ellis' }).click(); await p.waitForTimeout(800);
  await p.click('#moreBtn'); await p.waitForTimeout(300);
  ok(await p.locator('.menulist button', { hasText: 'Catch me up' }).count() === 1, 'Catch me up is back in the ⋯ menu');
  await p.locator('.menulist button', { hasText: 'Catch me up' }).click(); await T(200); await p.waitForTimeout(600);
  ok(/Open: send grades by Friday/.test(await p.locator('#aiText').innerText()), 'Catch me up shows the summary');
  ok(aiPrompts.at(-1).tier === 'quick' && /grades by Friday/.test(aiPrompts.at(-1).prompt), 'summary sends this thread to the fast model');
  await p.screenshot({ path: path.join(OUT, '1-catchup.png') });
  const draftBtn = p.locator('button.ai', { hasText: 'Draft a reply' });
  ok(await draftBtn.count() === 1, 'Draft a reply button is back');
  await draftBtn.click(); await p.waitForTimeout(600);
  ok(/send the grades by Friday/.test(await p.locator('#draftText').innerText()), 'reply draft appears');
  await p.screenshot({ path: path.join(OUT, '2-draft.png') });
  await p.click('#convBack'); await p.waitForTimeout(500);
  // add a second account that needs one more approval
  await p.click('#editBtn'); await p.waitForTimeout(600);
  ok(/stays signed in/.test(await p.locator('#setBody').innerText()), 'Settings says the account stays signed in');
  ok(/runs only when you tap/.test(await p.locator('#setBody').innerText()), 'Settings shows AI is available');
  let dialogMsg = ''; p.once('dialog', d => { dialogMsg = d.message(); d.accept(); });
  await p.evaluate(e => { window.__next = [e]; }, C);
  await p.locator('#setBody button', { hasText: 'Add account' }).click(); await p.waitForTimeout(800);
  ok(/Tap once more/.test(dialogMsg), 'first try without a refresh token explains "tap once more"');
  await p.evaluate(e => { window.__next = [e]; }, C);
  await p.locator('#setBody button', { hasText: 'Add account' }).click(); await p.waitForTimeout(800);
  ok(await p.locator('#setBody .acctrow').count() === 2, 'second try adds the account');
  await p.screenshot({ path: path.join(OUT, '3-settings.png') });
  await p.click('#setBack'); await p.waitForTimeout(500); await T(1000); await p.waitForTimeout(500);
  ok(await p.locator('#peopleList .row', { hasText: 'Maria Lopez' }).count() + await p.locator('#peopleList .row', { hasText: 'Jordan' }).count() >= 2, 'both accounts show mail');
  // relaunch the app with page storage wiped: cookie session restores accounts with no sign-in
  await p.evaluate(() => { localStorage.removeItem('inlet.accounts'); });
  await p.reload(); await p.waitForTimeout(1200);
  ok(!(await p.locator('.gate').count()), 'reopening the app needs no sign-in');
  ok(await p.locator('#peopleList .row', { hasText: 'Jordan Ellis' }).count() === 1, 'mail loads on reopen');
  // Google access revoked for one account -> only then a Reconnect bar
  revokedServer.add(C); await p.evaluate(e => { const a = window.__inletTest.accounts().find(x => x.email === e); a.exp = 0; }, C);
  await T(61000); await p.waitForTimeout(800); await T(31000); await p.waitForTimeout(300);
  ok(await p.locator('#rebar').isVisible() && /christen@example\.com/.test(await p.locator('#rebar').innerText()), 'revoked account shows Reconnect');
  await p.screenshot({ path: path.join(OUT, '4-revoked.png') });
  ok(!errs.length, 'no JS errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  console.log(issues.length ? `\n${issues.length} FAILED` : '\nALL PASSED');
})().catch(e => { console.error('TEST CRASHED', e.message); process.exit(1); });
