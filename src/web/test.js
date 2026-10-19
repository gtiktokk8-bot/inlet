// End-to-end test of the standalone build against a fake Google (sign-in + Gmail + Calendar).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const DIST = path.join(__dirname, 'dist'); const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const issues = []; const ok = (c, m) => { if (!c) issues.push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
const b64u = s => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const now = Date.now(); const H = h => String(now - h * 3600e3);
const A = 'gabe@guruconsultans.com', B = 'businessemailgabe@gmail.com';
function msg(id, tid, from, to, subj, body, h, labels, html) {
  const headers = [{ name: 'From', value: from }, { name: 'To', value: to }, { name: 'Subject', value: subj }, { name: 'Message-ID', value: `<${id}@mail.test>` }];
  const payload = html ? { mimeType: 'multipart/alternative', headers, parts: [{ mimeType: 'text/html', body: { data: b64u(body) } }] }
    : { mimeType: 'text/plain', headers, body: { data: b64u(body) } };
  return { id, threadId: tid, internalDate: H(h), snippet: body.replace(/<[^>]+>/g, '').slice(0, 90), labelIds: labels, sizeEstimate: 4000, payload };
}
const DB = {
  [A]: { name: 'Gabe Trastoy', threads: {
    ta1: [msg('a1', 'ta1', 'Jordan Ellis <jordan@uni.edu>', A, 'Recruiting video', 'Do you have his showcase schedule?', 30, ['INBOX']),
          msg('a2', 'ta1', `Gabe Trastoy <${A}>`, 'jordan@uni.edu', 'Re: Recruiting video', 'Yep, PG Fall Classic Nov 7.', 28, ['SENT']),
          msg('a3', 'ta1', 'Jordan Ellis <jordan@uni.edu>', A, 'Re: Recruiting video', 'Perfect. Can you send grades by Friday?', 1, ['INBOX', 'UNREAD'])],
    ta2: [msg('a4', 'ta2', 'Weekly Digest <news@letters.test>', A, 'Weekly digest #12', 'Top stories this week.', 5, ['INBOX', 'CATEGORY_PROMOTIONS'])] } },
  [B]: { name: 'Gabe', threads: {
    tb1: [msg('b1', 'tb1', 'Maya Santos <maya@events.test>', B, 'Final invoice', 'The venue sent the final invoice.', 2, ['INBOX', 'UNREAD'])],
    tb2: [msg('b2', 'tb2', 'Coach Luis <luis@club.test>', B, 'Lineup', '<p>Lineup for <b>Saturday</b> attached.</p><p>Bus at 11.</p>', 3, ['INBOX'], true)] } },
};
const sent = [], events = [], modified = [];
const who = req => (req.headers()['authorization'] || '').replace('Bearer tok-', '');
const GIS = `window.google={accounts:{oauth2:{initTokenClient(cfg){return{requestAccessToken(o){const e=(o&&o.login_hint)||(window.__next||[]).shift();setTimeout(()=>e?cfg.callback({access_token:'tok-'+e,expires_in:3600,scope:'openid email https://www.googleapis.com/auth/gmail.modify'}):cfg.error_callback({type:'popup_closed'}),20);}}},hasGrantedAllScopes(){return true},revoke(t,cb){cb&&cb()}}}};`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); await p.clock.install();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('response', r => { if (r.status() === 404) errs.push('404 ' + r.url()); });
  await ctx.route('**/*', async route => {
    const req = route.request(); const u = new URL(req.url());
    if (u.host === 'inlet.test' && u.pathname === '/api/auth/status') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: false, ai: false, accounts: [] }) });
    if (u.host === 'inlet.test') { const f = path.join(DIST, u.pathname === '/' ? 'index.html' : u.pathname); return fs.existsSync(f) ? route.fulfill({ path: f }) : route.fulfill({ status: 404 }); }
    if (u.host === 'accounts.google.com') return route.fulfill({ contentType: 'text/javascript', body: GIS });
    const json = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
    const email = who(req); const acct = DB[email];
    if (u.pathname === '/oauth2/v3/userinfo') return acct ? json({ email, name: acct.name }) : json({}, 401);
    if (!acct) return json({ error: { message: 'unauth' } }, 401);
    if (u.host === 'www.googleapis.com' && u.pathname.startsWith('/calendar/')) { events.push({ email, ...JSON.parse(req.postData()) }); return json({ id: 'ev1' }); }
    const m = u.pathname.match(/\/gmail\/v1\/users\/me\/(.*)$/); if (!m) return route.fulfill({ status: 404 });
    const rest = m[1];
    if (rest === 'threads') {
      const q = u.searchParams.get('q') || '';
      const ids = Object.keys(acct.threads).filter(id => { const ms = acct.threads[id]; return q.includes('in:sent') ? ms.some(x => x.labelIds.includes('SENT')) : ms.some(x => x.labelIds.includes('INBOX')); });
      return json({ threads: ids.map(id => ({ id, historyId: String(acct.threads[id].length) + acct.threads[id].map(x => x.labelIds.join()).join() })) });
    }
    let mm;
    if ((mm = rest.match(/^threads\/([^/?]+)\/modify$/))) { const body = JSON.parse(req.postData()); modified.push({ email, id: mm[1], ...body }); acct.threads[mm[1]].forEach(x => x.labelIds = x.labelIds.filter(l => !body.removeLabelIds.includes(l))); return json({}); }
    if ((mm = rest.match(/^threads\/([^/?]+)$/))) { const t = acct.threads[mm[1]]; return t ? json({ id: mm[1], messages: t }) : json({}, 404); }
    if (rest === 'messages/send') { const body = JSON.parse(req.postData()); const raw = Buffer.from(body.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); sent.push({ email, threadId: body.threadId, raw }); return json({ id: 'sent' + sent.length, threadId: body.threadId || 'new' }); }
    if ((mm = rest.match(/^messages\/([^/?]+)$/))) { const all = Object.values(acct.threads).flat(); const x = all.find(y => y.id === mm[1]); return x ? json(x) : json({}, 404); }
    return route.fulfill({ status: 404 });
  });
  const T = ms => p.clock.runFor(ms);
  await p.goto('https://inlet.test/'); await p.waitForTimeout(500);
  if (await p.locator('#welcome').isVisible()) { await p.click('#welcomeGo'); await p.waitForTimeout(400); }
  ok(await p.locator('.gate').isVisible(), 'sign-in screen shows when no account is connected');
  await p.screenshot({ path: path.join(OUT, '1-gate.png') });
  await p.evaluate(e => { window.__next = [e]; }, A);
  await p.locator('.gate .gbtn').first().click(); await p.waitForTimeout(800);
  ok(!(await p.locator('.gate').count()), 'sign-in screen closes after Google sign-in');
  ok(await p.locator('#peopleList .row', { hasText: 'Jordan Ellis' }).count() === 1, 'account A mail appears in People');
  ok(await p.locator('#feedBadge').innerText() === '1', 'account A newsletter goes to Feed');
  // add second account from Settings
  await p.click('#editBtn'); await p.waitForTimeout(600);
  await p.evaluate(e => { window.__next = [e]; }, B);
  await p.locator('#setBody button', { hasText: 'Add account' }).click(); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, '2-settings.png') });
  ok(await p.locator('#setBody .acctrow').count() === 2, 'Settings lists both accounts');
  await p.click('#setBack'); await p.waitForTimeout(600); await T(1000); await p.waitForTimeout(400);
  ok(await p.locator('#peopleList .row', { hasText: 'Maya Santos' }).count() === 1, 'account B mail merged into People');
  ok(await p.locator('#peopleList .row', { hasText: 'Jordan Ellis' }).count() === 1, 'account A mail still there');
  await p.screenshot({ path: path.join(OUT, '3-people.png') });
  // reply on B thread goes out from B
  await p.locator('#peopleList .row', { hasText: 'Maya Santos' }).click(); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, '4-conv-b.png') });
  ok(/to businessemailgabe@gmail\.com/.test(await p.locator('#msgs').innerText()), 'conversation shows which account it came to');
  ok(modified.some(x => x.email === B && x.id === 'tb1' && x.removeLabelIds.includes('UNREAD')), 'opening marks it read in the right account');
  await p.fill('#draft', 'Thanks Maya, paying today.'); await p.click('#sendBtn'); await T(11000); await p.waitForTimeout(400);
  const s1 = sent.find(x => x.raw.includes('UGF5aW5n') || x.email === B);
  ok(s1 && s1.email === B, 'reply to account B mail is sent by account B');
  ok(s1 && /^From: .*<businessemailgabe@gmail\.com>/m.test(s1.raw), 'reply From header is the B address');
  ok(s1 && /^To: Maya Santos <maya@events\.test>/m.test(s1.raw), 'reply goes to Maya');
  ok(s1 && /^In-Reply-To: <b1@mail\.test>/m.test(s1.raw) && s1.threadId === 'tb1', 'reply is threaded in Gmail');
  ok(s1 && Buffer.from(s1.raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString() === 'Thanks Maya, paying today.', 'reply body is intact');
  await p.click('#convBack'); await p.waitForTimeout(500);
  // reply on A thread goes out from A
  await p.locator('#peopleList .row', { hasText: 'Jordan Ellis' }).click(); await p.waitForTimeout(800);
  await p.fill('#draft', 'Sending grades Thursday — gracias!'); await p.click('#sendBtn'); await T(11000); await p.waitForTimeout(400);
  const s2 = sent[sent.length - 1];
  ok(s2 && s2.email === A && /^From: .*<gabe@guruconsultans\.com>/m.test(s2.raw) && /^To: Jordan Ellis <jordan@uni\.edu>/m.test(s2.raw), 'reply to account A mail is sent by A to Jordan');
  ok(s2 && Buffer.from(s2.raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8') === 'Sending grades Thursday — gracias!', 'non-English characters survive');
  await p.click('#convBack'); await p.waitForTimeout(500);
  // HTML-only email renders as text
  await p.locator('#peopleList .row', { hasText: 'Coach Luis' }).click(); await p.waitForTimeout(800);
  const t3 = await p.locator('#msgs').innerText();
  ok(/Lineup for Saturday attached/.test(t3) && !/<b>/.test(t3), 'HTML-only email shows as clean text');
  await p.click('#convBack'); await p.waitForTimeout(500);
  // compose with From picker
  await p.click('#newBtn'); await p.waitForTimeout(600);
  ok(await p.locator('#cFrom option').count() === 2, 'New Email has a From picker with both accounts');
  await p.selectOption('#cFrom', B); await p.fill('#cTo', 'coach@example.com'); await p.fill('#cSub', 'Camp'); await p.fill('#cBody', 'Still on?');
  await p.screenshot({ path: path.join(OUT, '5-compose.png') });
  await p.locator('.sheet .bar button').last().click(); await T(11000); await p.waitForTimeout(400);
  const s3 = sent[sent.length - 1];
  ok(s3 && s3.email === B && /^To: coach@example\.com/m.test(s3.raw) && /^Subject: Camp/m.test(s3.raw), 'new email sends from the chosen account');
  // Feed clear archives in the right account
  await p.click('#tabFeed'); await p.waitForTimeout(400); await p.locator('.roundbtns .round').first().click(); await p.waitForTimeout(800);
  ok(modified.some(x => x.email === A && x.id === 'ta2' && x.removeLabelIds.includes('INBOX')), 'Feed Clear archives in the account it came to');
  await p.click('#tabPeople'); await p.waitForTimeout(300);
  // token expiry -> reconnect banner
  await p.evaluate(e => { const a = window.__inletTest.accounts().find(x => x.email === e); a.exp = 0; }, A); await T(31000); await p.waitForTimeout(300);
  ok(await p.locator('#rebar').isVisible(), 'expired account shows a Reconnect bar');
  ok(await p.locator('#peopleList .row', { hasText: 'Jordan Ellis' }).count() === 1, 'signed-out account mail stays visible');
  await p.screenshot({ path: path.join(OUT, '6-reconnect.png') });
  await p.locator('#rebar button').click(); await p.waitForTimeout(600);
  ok(!(await p.locator('#rebar').count()), 'Reconnect clears the bar');
  ok(!errs.length, 'no JS errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  console.log(issues.length ? `\n${issues.length} FAILED` : '\nALL PASSED');
})().catch(e => { console.error('TEST CRASHED', e.message); process.exit(1); });
