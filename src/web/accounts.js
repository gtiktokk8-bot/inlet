/* Inlet standalone: multi-account Google sign-in + Gmail/Calendar REST adapter.
   Exposes the same window.claude.use("mcp") interface the app already uses inside Claude,
   so the app code is identical in both builds. No server: the browser talks to Google directly. */
(function () {
  "use strict";
  const CLIENT_ID = window.INLET_CLIENT_ID || "563715878928-ll5nno80bdd0rkaa1l2fmuq28idtht2t.apps.googleusercontent.com"; // public OAuth client ID
  const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
  const SCOPES = ["openid", "email", "profile", GMAIL_SCOPE, "https://www.googleapis.com/auth/calendar.events"].join(" ");
  const LS = "inlet.accounts";
  const API = "https://gmail.googleapis.com/gmail/v1/users/me/";
  const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

  /* ---------- accounts ---------- */
  const load = () => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } };
  let accounts = load(); // [{email, name, token, exp}]
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(accounts)); } catch {} };
  const live = a => a.token && Date.now() < a.exp;
  /* Server mode (Vercel functions + GOOGLE_CLIENT_SECRET): Inlet keeps a refresh token per account in an
     encrypted httpOnly cookie, so access tokens renew silently instead of asking to sign in every hour. */
  let SRV = { enabled: false, ai: false, accounts: [] };
  const srvReady = Promise.race([
    fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => { if (j && typeof j === "object") SRV = j; return SRV; }).catch(() => SRV),
    new Promise(r => setTimeout(() => r(SRV), 6000)),
  ]);
  const keeps = a => SRV.enabled && a.srv;            // can renew itself
  const dead = a => !live(a) && !keeps(a);             // really needs the person to sign in
  async function post(path, data) {
    const r = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) });
    let j = {}; try { j = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, j };
  }
  const inflight = new Map();
  function refresh(acc) {
    if (!keeps(acc)) return Promise.resolve(false);
    if (inflight.has(acc.email)) return inflight.get(acc.email);
    const p = post("/api/auth/token", { email: acc.email }).then(x => {
      if (x.ok && x.j.access_token) { acc.token = x.j.access_token; acc.exp = Date.now() + (Number(x.j.expires_in || 3600) - 90) * 1000; save(); return true; }
      if (x.status === 401) { acc.srv = false; acc.exp = 0; save(); emit(); }
      return false;
    }).catch(() => false).finally(() => inflight.delete(acc.email));
    inflight.set(acc.email, p); return p;
  }
  const listeners = new Set();
  const emit = () => { listeners.forEach(f => { try { f(); } catch {} }); paintBanner(); };
  const err = (code, msg, extra) => Object.assign(new Error(msg || code), { code, server: "Gmail" }, extra || {});
  const find = email => accounts.find(a => a.email === email);
  const split = id => { const s = String(id || ""); const i = s.indexOf("|"); return i < 0 ? [accounts[0] && accounts[0].email, s] : [s.slice(0, i), s.slice(i + 1)]; };

  function gis() {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const ch = () => (window.google && google.accounts && google.accounts.oauth2) ? res()
        : Date.now() - t0 > 15000 ? rej(err("server_unavailable", "Google sign-in did not load")) : setTimeout(ch, 60);
      ch();
    });
  }
  function upsert(acc) {
    const i = accounts.findIndex(a => a.email === acc.email);
    if (i >= 0) accounts[i] = acc; else accounts.push(acc);
    save(); emit(); return acc;
  }
  const popupErr = e => err("cancelled", e && e.type === "popup_closed" ? "Sign-in window closed" : "Sign-in was blocked. Allow pop-ups for this site.");
  function signInCode(hint) {
    return new Promise((res, rej) => {
      const cc = google.accounts.oauth2.initCodeClient({
        client_id: CLIENT_ID, scope: SCOPES, ux_mode: "popup", include_granted_scopes: true,
        select_account: !hint, ...(hint ? { login_hint: hint } : {}),
        callback: async r => {
          if (!r || r.error) return rej(err("not_granted", (r && (r.error_description || r.error)) || "Sign-in was cancelled"));
          try {
            const x = await post("/api/auth/exchange", { code: r.code });
            if (x.status === 409) return rej(err("need_consent", "Almost done. Tap once more and approve Inlet so it can keep you signed in.", { account: x.j.email }));
            if (x.status === 403) return rej(err("not_granted", "Gmail access was not allowed. Sign in again and tick the Gmail box."));
            if (!x.ok || !x.j.access_token) return rej(err("tool_error", "Sign-in didn't finish. Try again."));
            res(upsert({ email: x.j.email, name: x.j.name || "", token: x.j.access_token, exp: Date.now() + (Number(x.j.expires_in || 3600) - 90) * 1000, srv: true }));
          } catch { rej(err("server_unavailable", "No connection")); }
        },
        error_callback: e => rej(popupErr(e)),
      });
      cc.requestCode();
    });
  }
  async function signIn(hint) {
    if (!CLIENT_ID) throw err("not_granted", "Inlet is missing its Google client ID");
    await gis();
    if (SRV.enabled) return signInCode(hint);
    return new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: async t => {
          if (t.error) return rej(err("not_granted", t.error_description || t.error));
          if (!google.accounts.oauth2.hasGrantedAllScopes(t, GMAIL_SCOPE)) return rej(err("not_granted", "Gmail access was not allowed. Sign in again and tick the Gmail box."));
          try {
            const u = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + t.access_token } }).then(r => r.json());
            const email = String(u.email || "").toLowerCase();
            if (!email) throw new Error("no email");
            const acc = { email, name: u.name || "", token: t.access_token, exp: Date.now() + (Number(t.expires_in || 3600) - 90) * 1000 };
            const i = accounts.findIndex(a => a.email === email);
            if (i >= 0) accounts[i] = acc; else accounts.push(acc);
            save(); emit(); res(acc);
          } catch (e) { rej(err("tool_error", "Could not read your Google profile")); }
        },
        error_callback: e => rej(err("cancelled", e && e.type === "popup_closed" ? "Sign-in window closed" : "Sign-in was blocked. Allow pop-ups for this site.")),
      });
      tc.requestAccessToken(hint ? { prompt: "", login_hint: hint } : { prompt: "select_account consent" });
    });
  }
  function removeAccount(email) {
    const a = find(email);
    if (SRV.enabled) post("/api/auth/remove", { email }).catch(() => {});
    else if (a && a.token && window.google && google.accounts && google.accounts.oauth2) { try { google.accounts.oauth2.revoke(a.token, () => {}); } catch {} }
    accounts = accounts.filter(x => x.email !== email); save(); cache.clear(); try { localStorage.removeItem("inlet.cache"); } catch {} emit();
  }

  /* ---------- HTTP ---------- */
  async function call(acc, url, opt = {}, retried) {
    if (!live(acc)) await refresh(acc);
    if (!live(acc)) throw err("needs_reauth", acc.email + " needs to sign in again", { account: acc.email });
    let r;
    try {
      r = await fetch(url, { ...opt, headers: { Authorization: "Bearer " + acc.token, ...(opt.body ? { "Content-Type": "application/json" } : {}), ...(opt.headers || {}) } });
    } catch { throw err("server_unavailable", "No connection"); }
    if (r.status === 401) {
      acc.exp = 0; save();
      if (!retried && keeps(acc) && await refresh(acc)) return call(acc, url, opt, true);
      emit(); throw err("needs_reauth", acc.email + " needs to sign in again", { account: acc.email });
    }
    if (r.status === 429) throw err("rate_limited");
    if (r.status >= 500) throw err("server_unavailable");
    if (!r.ok) { let m = ""; try { m = (await r.json()).error.message; } catch {} throw err("tool_error", m || ("Gmail error " + r.status)); }
    return r.status === 204 ? {} : r.json();
  }
  const g = (acc, path, opt) => call(acc, API + path, opt);
  async function pool(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
    return out;
  }

  /* ---------- Gmail message mapping ---------- */
  const hdr = (p, n) => (((p && p.headers) || []).find(h => h.name.toLowerCase() === n) || {}).value || "";
  const splitAddrs = s => String(s || "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(x => x.trim()).filter(Boolean);
  function b64d(s) {
    const bin = atob(String(s || "").replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  function b64e(str) {
    const bytes = new TextEncoder().encode(str); let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const b64url = str => b64e(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(String(html).replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, "$&\n"), "text/html");
    doc.querySelectorAll("style,script,head").forEach(n => n.remove());
    return (doc.body ? doc.body.textContent : "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function bodyText(p) {
    let plain = "", html = "";
    (function walk(x) {
      if (!x) return;
      const mt = (x.mimeType || "").toLowerCase();
      if (x.body && x.body.data && !(x.filename)) {
        if (mt === "text/plain" && !plain) plain = b64d(x.body.data);
        else if (mt === "text/html" && !html) html = b64d(x.body.data);
      }
      (x.parts || []).forEach(walk);
    })(p);
    return plain || (html ? htmlToText(html) : "");
  }
  function bodyHtml(p) {
    let html = "";
    (function walk(x) { if (!x || html) return; const mt = (x.mimeType || "").toLowerCase();
      if (mt === "text/html" && x.body && x.body.data && !x.filename) { html = b64d(x.body.data); return; } (x.parts || []).forEach(walk); })(p);
    return html.length > 600000 ? "" : html;
  }
  function mapMsg(acc, m, withBody) {
    const p = m.payload || {};
    const o = {
      id: acc.email + "|" + m.id, threadId: acc.email + "|" + m.threadId,
      date: new Date(Number(m.internalDate) || Date.parse(hdr(p, "date")) || Date.now()).toISOString(),
      sender: hdr(p, "from"), subject: hdr(p, "subject"), snippet: m.snippet || "",
      labelIds: m.labelIds || [], toRecipients: splitAddrs(hdr(p, "to")), ccRecipients: splitAddrs(hdr(p, "cc")),
      sizeEstimate: m.sizeEstimate || 0, account: acc.email,
    };
    if (withBody) { o.plaintextBody = bodyText(p); const h = bodyHtml(p); if (h) o.htmlBody = h; }
    return o;
  }
  const viewUrl = (acc, id) => "https://mail.google.com/mail/?authuser=" + encodeURIComponent(acc.email) + "#all/" + id;
  function mapThread(acc, t, withBody) {
    return { id: acc.email + "|" + t.id, messageCount: (t.messages || []).length, viewUrl: viewUrl(acc, t.id), account: acc.email,
      messages: (t.messages || []).map(m => mapMsg(acc, m, withBody)) };
  }

  /* ---------- tools ---------- */
  const cache = new Map(); // email|threadId|historyId -> mapped thread (metadata)
  const META = "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date";

  async function searchOne(acc, query, size, pageToken) {
    const q = "threads?maxResults=" + Math.min(size || 20, 50) + (query ? "&q=" + encodeURIComponent(query) : "") + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const list = await g(acc, q);
    const items = list.threads || [];
    const threads = await pool(items, 8, async it => {
      const key = acc.email + "|" + it.id + "|" + it.historyId;
      if (cache.has(key)) return cache.get(key);
      const t = mapThread(acc, await g(acc, "threads/" + it.id + "?" + META), false);
      cache.set(key, t); return t;
    });
    return { threads, next: list.nextPageToken || null };
  }
  const lastGood = new Map(); // email|query -> threads, so a signed-out account's mail stays visible
  async function searchThreads(input) {
    const size = input.pageSize || 20;
    await Promise.all(accounts.filter(a => !live(a) && keeps(a)).map(refresh));
    let targets = accounts.filter(live), tokens = {};
    const stale = input.pageToken ? [] : accounts.filter(a => !live(a)).flatMap(a => lastGood.get(a.email + "|" + input.query) || []);
    if (input.pageToken) { try { tokens = JSON.parse(atob(input.pageToken)); } catch {} targets = targets.filter(a => tokens[a.email]); }
    if (!targets.length) throw err(accounts.length ? "needs_reauth" : "not_granted", accounts.length ? "Your accounts need to sign in again" : "No account");
    const results = await Promise.allSettled(targets.map(a => searchOne(a, input.query, size, tokens[a.email])));
    targets.forEach((a, i) => { if (!input.pageToken && results[i].status === "fulfilled") lastGood.set(a.email + "|" + input.query, results[i].value.threads); });
    const ok = results.filter(r => r.status === "fulfilled").map(r => r.value);
    if (!ok.length && !stale.length) throw results[0].reason;
    const threads = ok.flatMap(r => r.threads).concat(stale).sort((a, b) => new Date(b.messages.at(-1).date) - new Date(a.messages.at(-1).date));
    const next = {}; targets.forEach((a, i) => { if (results[i].status === "fulfilled" && results[i].value.next) next[a.email] = results[i].value.next; });
    return { threads, nextPageToken: Object.keys(next).length ? btoa(JSON.stringify(next)) : undefined };
  }
  async function getThread(input) {
    const [email, id] = split(input.threadId); const acc = find(email);
    if (!acc) throw err("tool_error", "That account was removed");
    const fmt = input.messageFormat === "METADATA_ONLY" ? META : "format=full";
    return mapThread(acc, await g(acc, "threads/" + id + "?" + fmt), fmt === "format=full");
  }
  const encHeader = s => /^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + b64e(s) + "?=";
  const fromLine = acc => acc.name ? encHeader('"' + acc.name.replace(/"/g, "") + '"') + " <" + acc.email + ">" : acc.email;
  function mime({ from, to, cc, subject, body, inReplyTo, references }) {
    const lines = ["From: " + from, "To: " + to.join(", ")];
    if (cc && cc.length) lines.push("Cc: " + cc.join(", "));
    lines.push("Subject: " + encHeader(subject || ""));
    if (inReplyTo) lines.push("In-Reply-To: " + inReplyTo, "References: " + ((references ? references + " " : "") + inReplyTo).trim());
    lines.push("MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64e(String(body || "").replace(/\r?\n/g, "\r\n")).replace(/.{76}/g, "$&\r\n"));
    return b64url(lines.join("\r\n"));
  }
  const addrOf = s => { const m = String(s || "").match(/<([^>]+)>/); return (m ? m[1] : String(s || "")).trim().toLowerCase(); };
  async function reply(input) {
    const [email, mid] = split(input.messageId); const acc = find(email);
    if (!acc) throw err("tool_error", "That account was removed");
    const m = await g(acc, "messages/" + mid + "?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=To&metadataHeaders=Cc");
    const p = m.payload || {};
    const fromSelf = addrOf(hdr(p, "from")) === acc.email;
    let to = input.to && input.to.length ? input.to : fromSelf ? splitAddrs(hdr(p, "to")) : [hdr(p, "reply-to") || hdr(p, "from")];
    let cc = input.cc || (input.replyAll ? splitAddrs(hdr(p, "cc")).filter(a => addrOf(a) !== acc.email) : []);
    to = to.filter(Boolean); if (!to.length) throw err("tool_error", "Couldn't find who to reply to");
    const subj = hdr(p, "subject"); const subject = /^re:/i.test(subj) ? subj : "Re: " + subj;
    const raw = mime({ from: fromLine(acc), to, cc, subject, body: input.body, inReplyTo: hdr(p, "message-id"), references: hdr(p, "references") });
    const sent = await g(acc, "messages/send", { method: "POST", body: JSON.stringify({ raw, threadId: m.threadId }) });
    cache.clear(); return { id: acc.email + "|" + sent.id, threadId: acc.email + "|" + sent.threadId };
  }
  async function sendMessage(input) {
    const acc = (input.from && find(input.from)) || accounts.find(live) || accounts[0];
    if (!acc) throw err("not_granted");
    const raw = mime({ from: fromLine(acc), to: input.to || [], cc: input.cc, subject: input.subject, body: input.body });
    const sent = await g(acc, "messages/send", { method: "POST", body: JSON.stringify({ raw }) });
    cache.clear(); return { id: acc.email + "|" + sent.id };
  }
  async function unlabel(input) {
    const [email, id] = split(input.threadId); const acc = find(email);
    if (!acc) throw err("tool_error", "That account was removed");
    await g(acc, "threads/" + id + "/modify", { method: "POST", body: JSON.stringify({ removeLabelIds: input.labelIds || [] }) });
    for (const k of [...cache.keys()]) if (k.startsWith(email + "|" + id + "|")) cache.delete(k);
    return {};
  }
  async function label(input) {
    const [email, id] = split(input.threadId); const acc = find(email);
    if (!acc) throw err("tool_error", "That account was removed");
    await g(acc, "threads/" + id + "/modify", { method: "POST", body: JSON.stringify({ addLabelIds: input.labelIds || [] }) });
    for (const k of [...cache.keys()]) if (k.startsWith(email + "|" + id + "|")) cache.delete(k);
    return {};
  }
  async function createEvent(input) {
    const acc = (input.account && find(input.account)) || accounts.find(live) || accounts[0];
    if (!acc) throw err("not_granted");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const ev = input.allDay
      ? { summary: input.summary, start: { date: input.startTime.slice(0, 10) }, end: { date: input.endTime.slice(0, 10) } }
      : { summary: input.summary, start: { dateTime: input.startTime, timeZone: tz }, end: { dateTime: input.endTime, timeZone: tz } };
    const r = await call(acc, CAL, { method: "POST", body: JSON.stringify(ev) });
    return { id: r.id };
  }

  const mcp = {
    async callTool(server, tool, input = {}) {
      let payload;
      if (server === "Gmail" && tool === "search_threads") payload = await searchThreads(input);
      else if (server === "Gmail" && tool === "get_thread") payload = await getThread(input);
      else if (server === "Gmail" && tool === "reply") payload = await reply(input);
      else if (server === "Gmail" && tool === "send_message") payload = await sendMessage(input);
      else if (server === "Gmail" && tool === "unlabel_thread") payload = await unlabel(input);
      else if (server === "Gmail" && tool === "label_thread") payload = await label(input);
      else if (server === "Google Calendar" && tool === "create_event") payload = await createEvent(input);
      else throw err("not_in_manifest", tool);
      return { payload };
    },
    watchTool(server, tool, input, handler) {
      let stopped = false, timer = null;
      const run = async () => {
        if (stopped) return; clearTimeout(timer);
        try { const r = await mcp.callTool(server, tool, input); if (!stopped) handler({ type: "data", result: r }); }
        catch (e) { if (!stopped) handler({ type: "error", error: e }); }
        if (!stopped) timer = setTimeout(run, 60000);
      };
      const onChange = () => run();
      listeners.add(onChange); run();
      return () => { stopped = true; clearTimeout(timer); listeners.delete(onChange); };
    },
    async invalidate() {},
    async listTools() { return { servers: [] }; },
  };

  /* ---------- UI: sign-in gate, reconnect banner, settings ---------- */
  const css = `
  .gate{position:absolute;inset:0;z-index:49;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;gap:10px}
  .gate h1{margin:14px 0 0;font-size:30px;font-weight:800;letter-spacing:-.5px}
  .gate p{margin:0;color:var(--muted);font-size:15px;line-height:21px;max-width:320px}
  .gbtn{margin-top:18px;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:320px;height:52px;border-radius:14px;border:.5px solid var(--line);background:var(--card);color:var(--ink);font-size:17px;font-weight:600}
  .gbtn.primary{background:var(--accent-fill);color:var(--accent-ink);border:0}
  .gnote{font-size:13px!important;margin-top:14px!important}
  .gerr{color:var(--red)!important}
  .rebar{margin:10px 16px 0;padding:10px 12px;border-radius:12px;background:var(--fill2);display:flex;align-items:center;gap:10px;font-size:15px}
  .rebar span{flex:1;min-width:0;color:var(--ink)}
  .rebar button{border:0;background:var(--accent-fill);color:var(--accent-ink);border-radius:999px;height:32px;padding:0 14px;font-size:15px;font-weight:600}
  .acctrow .label small{color:var(--muted)}
  .fld select{appearance:none;-webkit-appearance:none;border:.5px solid var(--line);border-radius:10px;padding:11px 36px 11px 12px;background:var(--fill2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='m1 1 5 5 5-5' fill='none' stroke='%238E8E93' stroke-width='2'/%3E%3C/svg%3E") no-repeat right 14px center;font-size:17px;color:var(--ink)}
  .acctrow .live{color:var(--green)}
  .acctrow .dead{color:var(--red)}
  .acctrow .mini{border:0;background:var(--fill);color:var(--accent);border-radius:999px;height:30px;padding:0 12px;font-size:15px;flex-shrink:0}
  .acctrow .mini.rm{background:none;padding:0 2px}
  .acctrow .mini.rm{color:var(--red)}`;
  const G_ICON = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  let gate = null;
  function showGate(resolve) {
    if (gate) return;
    gate = document.createElement("section"); gate.className = "gate"; gate.setAttribute("role", "dialog"); gate.setAttribute("aria-label", "Sign in");
    const deadList = accounts.filter(dead);
    gate.innerHTML = '<div class="wicon" aria-hidden="true"><svg width="54" height="54" viewBox="0 0 24 24" fill="#fff"><path d="M12 3.5c5 0 9 3.4 9 7.6s-4 7.6-9 7.6c-1 0-2-.1-2.9-.4L5 20.2l.9-3.6C4 15.2 3 13.3 3 11.1 3 6.9 7 3.5 12 3.5Z"/></svg></div>' +
      (deadList.length ? "<h1>Welcome back</h1><p>" + (SRV.enabled ? "Sign in once more and Inlet will keep you signed in from now on." : "Google asks you to sign in again every hour while Inlet is in testing.") + "</p>" : "<h1>Sign in to Inlet</h1><p>Add your Gmail. You can add more accounts later in Settings.</p>");
    const box = document.createElement("div"); box.style.cssText = "width:100%;display:flex;flex-direction:column;align-items:center";
    const ver = document.createElement("p"); ver.className = "gnote"; ver.style.opacity = ".6"; ver.textContent = "Inlet " + (window.INLET_BUILD || "dev") + " · " + location.host;
    const msg = document.createElement("p"); msg.className = "gnote";
    msg.textContent = "Inlet talks to Gmail straight from this phone. Your mail is never stored on a server. If Google says the app isn't verified yet, tap Continue.";
    const go = async (hint, btn) => {
      btn.disabled = true;
      try { await signIn(hint); if (accounts.some(a => !dead(a))) { gate.remove(); gate = null; resolve(); } }
      catch (e) { msg.textContent = e.message; msg.classList.add("gerr"); }
      btn.disabled = false;
    };
    for (const a of deadList) { const b = document.createElement("button"); b.type = "button"; b.className = "gbtn primary"; b.textContent = "Continue as " + a.email; b.onclick = () => go(a.email, b); box.append(b); }
    const add = document.createElement("button"); add.type = "button"; add.className = "gbtn" + (deadList.length ? "" : " primary");
    add.innerHTML = (deadList.length ? "" : G_ICON) + "<span></span>"; add.querySelector("span").textContent = deadList.length ? "Use a different account" : "Continue with Google";
    if (!deadList.length) { add.className = "gbtn"; }
    add.onclick = () => go(null, add); box.append(add, msg, ver); gate.append(box);
    document.getElementById("app").append(gate);
  }
  function paintBanner() {
    const host = document.getElementById("scrPeople"); if (!host) return;
    let bar = document.getElementById("rebar");
    const deadList = accounts.filter(dead);
    if (!deadList.length || !accounts.some(a => !dead(a))) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "rebar"; bar.className = "rebar"; const list = document.getElementById("peopleList"); host.insertBefore(bar, list); }
    bar.replaceChildren();
    const t = document.createElement("span"); t.textContent = deadList.length === 1 ? deadList[0].email + " needs to sign in again" : deadList.length + " accounts need to sign in again";
    const b = document.createElement("button"); b.type = "button"; b.textContent = "Reconnect";
    b.onclick = async () => { b.disabled = true; try { await signIn(deadList[0].email); } catch (e) { t.textContent = e.message; } b.disabled = false; };
    bar.append(t, b);
  }
  function renderSettings(container) {
    const head = document.createElement("div"); head.className = "ghead"; head.textContent = "Accounts";
    const grp = document.createElement("div"); grp.className = "group ic";
    for (const a of accounts) {
      const r = document.createElement("div"); r.className = "acctrow";
      const av = document.createElement("span"); av.className = "chip av"; av.setAttribute("aria-hidden", "true"); av.textContent = (a.name || a.email).trim().charAt(0).toUpperCase();
      const l = document.createElement("span"); l.className = "label"; l.style.flex = "1"; l.style.minWidth = "0";
      const n = document.createElement("span"); n.textContent = a.email; n.style.overflow = "hidden"; n.style.textOverflow = "ellipsis"; n.style.whiteSpace = "nowrap";
      const s = document.createElement("small"); s.className = dead(a) ? "dead" : "live"; s.textContent = dead(a) ? "Signed out" : keeps(a) ? "Connected · stays signed in" : "Connected";
      l.append(n, s); r.append(av, l);
      if (dead(a)) { const rc = document.createElement("button"); rc.type = "button"; rc.className = "mini"; rc.textContent = "Reconnect"; rc.onclick = async () => { try { await signIn(a.email); } catch (e) { if (e.code === "need_consent") alert(e.message); } openSettingsAgain(); }; r.append(rc); }
      const rm = document.createElement("button"); rm.type = "button"; rm.className = "mini rm"; rm.textContent = "Remove"; rm.setAttribute("aria-label", "Remove " + a.email);
      rm.onclick = () => { if (confirm("Remove " + a.email + " from Inlet? Your mail stays in Gmail.")) { removeAccount(a.email); openSettingsAgain(); } };
      r.append(rm); grp.append(r);
    }
    const add = document.createElement("button"); add.type = "button"; add.className = "addrow";
    add.innerHTML = '<span class="chip blue" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span><span class="label">Add account</span>';
    add.onclick = async () => { try { await signIn(null); } catch (e) { if (e.code !== "cancelled") alert(e.message); } openSettingsAgain(); };
    grp.append(add);
    const foot = document.createElement("div"); foot.className = "gfoot"; foot.textContent = "Replies go out from the account the email came to. New emails let you pick which address to send from." + (SRV.enabled && accounts.some(a => !a.srv) ? " Accounts without “stays signed in” will ask once more; after that they stay connected." : "");
    container.append(head, grp, foot);
  }
  const openSettingsAgain = () => { if (typeof window.openSettings === "function") window.openSettings(); };

  window.InletAccounts = { list: () => accounts.map(a => ({ email: a.email, live: !dead(a) })), signIn, remove: removeAccount, renderSettings, onChange: f => listeners.add(f) };

  let readyResolve; const ready = new Promise(r => (readyResolve = r));
  async function boot() {
    const st = document.createElement("style"); st.textContent = css; document.head.append(st);
    const fine = document.querySelector(".wfine"); if (fine) fine.textContent = "Inlet talks to Gmail straight from your phone. Your mail is never stored on a server.";
    await srvReady;
    if (SRV.enabled) {
      const onServer = new Map((SRV.accounts || []).map(a => [a.email, a]));
      for (const a of accounts) a.srv = onServer.has(a.email);
      for (const [email, a] of onServer) if (!find(email)) accounts.push({ email, name: a.name || "", token: "", exp: 0, srv: true });
      save();
      await Promise.race([Promise.all(accounts.filter(a => !live(a) && keeps(a)).map(refresh)), new Promise(r => setTimeout(r, 8000))]);
    }
    if (accounts.some(a => !dead(a))) readyResolve(); else showGate(readyResolve);
    setInterval(paintBanner, 30000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") accounts.filter(a => !live(a) && keeps(a)).forEach(refresh); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  /* AI: Catch me up, reply drafts and Feed summaries, through Inlet's /api/ai (streams plain text). */
  async function sample(prompt, opts = {}) {
    let r;
    try {
      r = await fetch("/api/ai", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, tier: opts.modelTier === "quick" ? "quick" : "" }) });
    } catch { throw err("server_unavailable", "No connection"); }
    if (!r.ok) throw err(r.status === 429 ? "rate_limited" : r.status === 401 ? "not_granted" : "tool_error");
    const rd = r.body.getReader(), dec = new TextDecoder(); let text = "";
    for (;;) { const { done, value } = await rd.read(); if (done) break; text += dec.decode(value, { stream: true }); if (opts.onText) opts.onText({ text }); }
    return { text };
  }
  window.claude = { use: async n => n === "mcp" ? (await ready, mcp) : n === "sample" ? ((await srvReady).ai ? sample : null) : null };
  window.__inletTest = { mapMsg, mapThread, bodyText, mime, b64d, splitAddrs, searchThreads, reply, sendMessage, unlabel, createEvent, accounts: () => accounts, setAccounts: a => { accounts = a; }, srv: () => SRV, sample };
})();
