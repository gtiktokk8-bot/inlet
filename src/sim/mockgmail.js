// Simulated Gmail + Calendar + AI for Inlet. Scenario chosen by window.__SIM = {inbox:'normal'|'empty'|'heavy', fail:{reply,send,archive,thread,watch}, ai:true}
(function(){
const SIM = window.__SIM || {};
const now = Date.now();
const iso = h => new Date(now - h*3600e3).toISOString();
const ME = 'Me <me@example.com>';
let seq = 0; const mid = () => 'm' + (++seq);
const threads = {};
function thread(id, msgs, extraLabels){ // msgs: [from, hoursAgo, subject, body, labels]
  const messages = msgs.map(([from, h, subj, body, labels]) => ({
    id: mid(), threadId: id, date: iso(h), sender: from, subject: subj,
    snippet: (body||'').replace(/\n/g,' ').slice(0,160).replace(/'/g,'&#39;'),
    plaintextBody: body, sizeEstimate: (body||'').length*3+3000,
    labelIds: [...(labels||[]), ...(from===ME?['SENT']:['INBOX']), ...(extraLabels||[])],
    toRecipients: from===ME ? [msgs.find(m=>m[0]!==ME)?.[0] || 'someone@example.com'] : ['me@example.com'],
  }));
  threads[id] = { id, messageCount: messages.length, viewUrl: 'https://mail.google.com/mail/#all/' + id, messages };
}
const P = { jordan:'Jordan Ellis <jordan.ellis@university.edu>', maya:'Maya Santos <maya@santosevents.com>', luis:'Luis Ortega <lortega@gmail.com>',
  dana:'Dana Whitfield <dwhitfield@admissions.uic.edu>', sam:'Sam Rivera <sam@sponsorco.com>', priya:'Priya Kapoor <priya@sponsorco.com>',
  long:'Maria-Fernanda de los Ángeles Gutiérrez-Villanueva <mf.gutierrez@universidaddeportiva.example.org>', bare:'coachmike77@yahoo.com',
  mom:'Mom <rosa.trastoy@gmail.com>' };
const body = {
  quoted: 'Perfect. Can you send his updated grades before Friday Oct 16 at 2pm?\n\nThanks,\nJordan\n--\nJordan Ellis | Recruiting Coordinator\nUniversity Athletics\n\nOn Tue, Oct 13, 2026 at 4:10 PM Me <me@example.com> wrote:\n> Yep, PG Fall Classic Nov 7 and Jupiter the week after.\n>\n> On Mon Jordan wrote:\n>> Do you have his showcase schedule?',
  long: Array.from({length:30},(_,i)=>`Paragraph ${i+1}: Here are the detailed notes from the sponsor meeting covering pricing tiers, banner placement on the outfield wall, social media deliverables and the timeline for the spring season.`).join('\n\n'),
  url: 'Here is the shared folder: https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijklmnopqrstuvwxyz and the deck https://docs.google.com/presentation/d/1zyxwvutsrqponmlkjihgfedcba/edit?usp=sharing',
};
function buildNormal(){
  thread('t1', [[P.jordan, 30, 'Recruiting video', 'Do you have his showcase schedule for the fall?'], [ME, 28, 'Re: Recruiting video', 'Yep — PG Fall Classic Nov 7 and Jupiter the week after.'], [P.jordan, 1, 'Re: Recruiting video', body.quoted, ['UNREAD']]]);
  thread('t2', [[P.maya, 3, 'Final invoice', 'The venue sent the final invoice, take a look when you can. Sent from my iPhone', ['UNREAD']]]);
  thread('t3', [[P.luis, 26, 'Saturday lineup', 'Lineup attached for Saturday 10/18 at 1:30pm. Bus leaves at 11.', []]]);
  thread('t4', [[P.sam, 50, 'Sponsor deck', 'Deck looks great. Can we all meet Thursday at 2 to finalize?'], [P.priya, 49, 'Re: Sponsor deck', 'Works for me. Banner proofs shipped too.'], [ME, 48, 'Re: Sponsor deck', 'I’m in. I’ll bring the updated tiers.'], [P.sam, 2, 'Re: Sponsor deck', body.long, ['UNREAD']]]);
  thread('t5', [[P.long, 5, 'Interés en su receptor — beca deportiva 2027 🇨🇺⚾', '¡Hola Gabe! Nos interesa mucho su receptor. ¿Podemos hablar el jueves 10/16?', ['UNREAD']]]);
  thread('t6', [[P.bare, 70, 'camp', 'yo coach u still running the winter camp? lmk']]);
  thread('t7', [[P.dana, 8, 'Transfer forms', body.url]]);
  thread('t8', [[P.mom, 0.3, '', 'Call me when you can ❤️', ['UNREAD']]]);
  thread('t9', [['Stripe <no-reply@stripe.com>', 0.5, 'Your Stripe login code', 'Your verification code is 482913. It expires in 10 minutes.', ['CATEGORY_UPDATES']]]);
  thread('t10', [['PayPal Security <alert@secure-paypal-verify.co>', 4, 'Unusual sign-in detected', 'Verify within 24 hours or your account will be locked: http://bit.ly/x', ['CATEGORY_UPDATES']]]);
  thread('t11', [['Baseball Weekly <news@baseballweekly.com>', 6, 'Fall showcase season: what scouts are actually watching this year and why it matters for your recruits', 'Exit velo matters less than consistency across at-bats. Catcher pop times get logged on every throw.', ['CATEGORY_PROMOTIONS']]]);
  thread('t12', [['Amazon.com <shipment-tracking@amazon.com>', 9, 'Your package is out for delivery', 'Arriving today by 7 PM. Tracking 1Z999AA10123456784', ['CATEGORY_UPDATES']]]);
  thread('t13', [['Nike <nike@notifications.nike.com>', 30, 'Up to 40% off', '', ['CATEGORY_PROMOTIONS']]]);
  thread('t14', [['LinkedIn <messages-noreply@linkedin.com>', 12, 'You appeared in 14 searches', 'See who is looking at your profile', ['CATEGORY_SOCIAL']]]);
  for(let i=0;i<6;i++) thread('tn'+i, [[`Newsletter ${i} <news${i}@letters.example.com>`, 20+i*7, `Weekly digest #${120+i}`, 'Top stories this week in coaching and player development.', ['CATEGORY_PROMOTIONS']]]);
}
function buildHeavy(){ buildNormal(); for(let i=0;i<120;i++) thread('th'+i, [[`Person ${i} <person${i}@example.com>`, 40+i*4, `Question ${i}`, `Hi Gabe, quick question number ${i} about tryouts.`]]); }
if(SIM.inbox==='heavy') buildHeavy(); else if(SIM.inbox!=='empty') buildNormal();
// sent-only threads (waiting on them)
const sent = [
  { id:'s1', messageCount:1, viewUrl:'https://mail.google.com/mail/#all/s1', messages:[{ id:mid(), threadId:'s1', date:iso(80), sender:ME, subject:'Camp invoice', snippet:'Attached is the invoice for the winter camp.', labelIds:['SENT'], toRecipients:['Ted Ab <ted@example.com>'] }]},
];
const all = () => Object.values(threads).sort((a,b)=>new Date(b.messages.at(-1).date)-new Date(a.messages.at(-1).date));
const preview = t => ({...t, messages: t.messages.slice(0,5).map(({plaintextBody,...m})=>m)});
const err = (code,message) => Object.assign(new Error(message||code),{code,message:message||code,server:'Gmail'});
const log = window.__CALLS = [];
const wait = ms => new Promise(r=>setTimeout(r,ms));
const mcp = {
  watchTool(server, tool, input, handler){ setTimeout(()=>{
      if(SIM.fail&&SIM.fail.watch) return handler({type:'error', error: err(SIM.fail.watch)});
      const list = all().filter(t=>t.messages.some(m=>m.labelIds.includes('INBOX')));
      handler({type:'data', result:{payload:{threads:list.slice(0,50).map(preview), nextPageToken: list.length>50?'p2':undefined}}}); }, 30);
    return ()=>{}; },
  async callTool(server, tool, input){ log.push([server,tool,input]); await wait(20);
    if(server==='Gmail'&&tool==='search_threads'){
      if(input.query.startsWith('in:sent')) return {payload:{threads:[...sent, ...all().filter(t=>t.messages.some(m=>m.labelIds.includes('SENT')))].map(preview)}};
      if(input.pageToken){ const list=all().filter(t=>t.messages.some(m=>m.labelIds.includes('INBOX'))); return {payload:{threads:list.slice(50,100).map(preview), nextPageToken: list.length>100?'p3':undefined}}; }
      if(input.query.includes('has:attachment')) return {payload:{threads:[threads.t3, threads.t7].filter(Boolean).map(preview)}};
      if(input.query.startsWith('in:inbox')) return {payload:{threads:all().slice(0,50).map(preview)}};
      const q=input.query.toLowerCase(); return {payload:{threads:all().filter(t=>JSON.stringify(t).toLowerCase().includes(q.replace(/^from:/,''))).map(preview)}};
    }
    if(tool==='get_thread'){ if(SIM.fail&&SIM.fail.thread) throw err(SIM.fail.thread); const t=threads[input.threadId]||sent.find(s=>s.id===input.threadId); return {payload: t ? JSON.parse(JSON.stringify(t)) : {}}; }
    if(tool==='reply'){ if(SIM.fail&&SIM.fail.reply) throw err(SIM.fail.reply, 'Reply failed'); return {payload:{id:mid()}}; }
    if(tool==='send_message'){ if(SIM.fail&&SIM.fail.send) throw err(SIM.fail.send); return {payload:{id:mid()}}; }
    if(tool==='unlabel_thread'){ if(SIM.fail&&SIM.fail.archive&&input.labelIds.includes('INBOX')) throw err(SIM.fail.archive); const t=threads[input.threadId]; if(t) t.messages.forEach(m=>m.labelIds=m.labelIds.filter(l=>!input.labelIds.includes(l))); return {payload:{}}; }
    if(tool==='create_event') return {payload:{id:'ev1'}};
    throw err('not_in_manifest');
  },
  async invalidate(){}, async listTools(){ return {servers:[]}; }
};
const sample = async (input, opts={}) => { log.push(['AI', String(input).slice(0,60)]); const text = String(input).startsWith('Summarize this email') ? '• Jordan liked the swing video and asked about fall showcases.\n• You sent the schedule.\n• Open: send updated grades before Friday.' : 'Will do! I\'ll send his updated grades by Thursday so you have them before Friday.\n\nGabe';
  let acc=''; for(const w of text.split(/(\s+)/)){ acc+=w; opts.onText&&opts.onText({text:acc,delta:w}); await wait(2);} return {text:acc,truncated:false}; };
window.claude = { use: async n => n==='mcp' ? (SIM.noMcp?null:mcp) : n==='sample' ? (SIM.ai===false?null:sample) : null };
})();
