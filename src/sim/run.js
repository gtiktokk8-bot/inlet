// Inlet simulation runner: scripted personas + automatic checks. Usage: node run.js <round>
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROUND=process.argv[2]||'r1';const OUT=path.join(__dirname,ROUND);fs.mkdirSync(OUT,{recursive:true});
const APP=fs.readFileSync(path.join(__dirname,'..','app','inlet.html'),'utf8');const MOCK=fs.readFileSync(path.join(__dirname,'mockgmail.js'),'utf8');
const issues=[];const shots=[];
const note=(persona,sev,msg)=>{issues.push({persona,sev,msg});};

async function open(b,persona,sim={},opt={}){
  const ctx=await b.newContext({locale:opt.locale||'en-US',reducedMotion:opt.rm?'reduce':'no-preference',viewport:opt.vp||{width:390,height:844},deviceScaleFactor:2,colorScheme:opt.dark?'dark':'light',hasTouch:false});
  const p=await ctx.newPage();await p.clock.install();
  p.on('pageerror',e=>note(persona,'bug',`JS error: ${e.message}`));
  p.on('console',m=>{if(m.type()==='error')note(persona,'bug',`console error: ${m.text().slice(0,160)}`);});
  await p.setContent(`<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font-size:14px}[hidden]{display:none!important}</style></head><body><script>window.__SIM=${JSON.stringify(sim)}</script><script>${MOCK}</script>${APP}</body></html>`);
  await p.waitForTimeout(400);if(!opt.keepWelcome&&await p.locator('#welcome').isVisible()){await p.click('#welcomeGo');await p.waitForTimeout(380);}return p;}
async function shot(p,persona,name){const f=path.join(OUT,`${persona}-${name}.png`);await p.screenshot({path:f});shots.push(f);}
async function checks(p,persona,where){
  const r=await p.evaluate(()=>{const out=[];const vw=innerWidth;
    const vis=e=>{const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return false;let x=e;while(x){if(x.hidden)return false;x=x.parentElement;}return true;};
    // horizontal overflow of the page or any visible scroller
    if(document.documentElement.scrollWidth>vw+1)out.push(['bug',`page scrolls sideways (${document.documentElement.scrollWidth}px > ${vw}px)`]);
    document.querySelectorAll('.screen,.push,.sheet').forEach(e=>{if(vis(e)&&e.scrollWidth>e.clientWidth+2&&!e.classList.contains('msgs'))out.push(['bug',`#${e.id} content wider than screen by ${e.scrollWidth-e.clientWidth}px`]);});
    // anything visible sticking out past the right edge
    document.querySelectorAll('.app *').forEach(e=>{if(!vis(e))return;const r=e.getBoundingClientRect();if(r.width===0||r.height===0)return;
      if(e.closest('.msgs')&&e.classList.contains('ts'))return;if(e.closest('.swipe'))return;if(e.closest('.fcard,.stack,.chips,.pins'))return;
      if(r.right>vw+2&&r.left<vw)out.push(['polish',`${e.tagName.toLowerCase()}.${[...e.classList].join('.')||'?'} sticks out ${Math.round(r.right-vw)}px: "${(e.textContent||'').trim().slice(0,40)}"`]);});
    // clipped single-line text without ellipsis
    document.querySelectorAll('.app button,.app b,.app span,.app h1,.app h2').forEach(e=>{if(!vis(e)||!e.childElementCount===false)return;const s=getComputedStyle(e);
      if(e.scrollWidth>e.clientWidth+2&&s.overflow==='hidden'&&s.textOverflow!=='ellipsis'&&s.webkitLineClamp==='none')out.push(['polish',`text clipped: "${e.textContent.trim().slice(0,40)}"`]);});
    // small tap targets
    let small=[];document.querySelectorAll('.app button,.app a').forEach(e=>{if(!vis(e)||e.closest('.b'))return;const r=e.getBoundingClientRect();if(r.width&&r.height&&(r.height<30||r.width<30))small.push((e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,24));});
    if(small.length)out.push(['a11y',`small tap targets: ${[...new Set(small)].slice(0,6).join(' | ')}`]);
    // buttons without accessible names
    document.querySelectorAll('.app button').forEach(e=>{if(vis(e)&&!(e.textContent.trim()||e.getAttribute('aria-label')))out.push(['a11y','button with no label']);});
    // ---- theme lint ----
    const SCALE=new Set([10,11,12,13,15,16,17,20,22,28,34]);const offScale=new Map();
    const hues=new Map();const radii=new Set();
    const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return null;const v=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return{r:v[0],g:v[1],b:v[2],a:v.length>3?v[3]:1};};
    const hue=({r,g,b})=>{r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;if(d<.08)return null;const s=d/(1-Math.abs(2*l-1));if(s<.35)return null;
      let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h=Math.round(h*60);if(h<0)h+=360;return h;};
    const name=h=>h<15||h>=335?'red':h<45?'orange':h<70?'yellow':h<165?'green':h<200?'teal':h<255?'blue':h<290?'indigo':'purple';
    document.querySelectorAll('.app *').forEach(e=>{if(!vis(e))return;const rc=e.getBoundingClientRect();if(!rc.width||!rc.height||rc.bottom<0||rc.top>innerHeight)return;
      if(e.closest('.av,.provider,.swipe .acts,svg,.ringcard'))return;const s=getComputedStyle(e);
      const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      if(own){const fs=Math.round(parseFloat(s.fontSize));if(!SCALE.has(fs))offScale.set(fs,(e.className||e.tagName)+'');}
      const cs=[];if(own)cs.push(s.color);cs.push(s.backgroundColor);if(parseFloat(s.borderTopWidth)>0)cs.push(s.borderTopColor);
      for(const c of cs){const p=parse(c);if(!p||p.a<.3)continue;const h=hue(p);if(h!=null){const n=name(h);hues.set(n,(hues.get(n)||[]).concat(String(e.className||e.tagName).slice(0,20)));}}
      const br=parseFloat(s.borderTopLeftRadius);const bg=parse(s.backgroundColor);if(br>0&&br<rc.height/2-1&&bg&&bg.a>.05)radii.add(Math.round(br));});
    // contrast (WCAG AA) for visible text
    const lum=({r,g,b})=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(r)+.7152*f(g)+.0722*f(b);};
    const bgOf=e=>{let x=e;while(x){const c=parse(getComputedStyle(x).backgroundColor);if(c&&c.a>.85)return c;x=x.parentElement;}return{r:255,g:255,b:255,a:1};};
    const lowC=new Set();document.querySelectorAll('.app *').forEach(e=>{if(!vis(e))return;if(!([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())))return;const rc=e.getBoundingClientRect();if(!rc.width||rc.bottom<0||rc.top>innerHeight)return;
      const s=getComputedStyle(e);if(parseFloat(s.opacity)<.9||e.closest('[disabled],.ghost1,.ghost2,.scrim,.av,.fcard .tile'))return;let o=1,x=e;while(x){o*=parseFloat(getComputedStyle(x).opacity);x=x.parentElement;}if(o<.9)return;
      const fg=parse(s.color);if(!fg)return;const bg=bgOf(e);const L1=lum(fg),L2=lum(bg);const cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);const big=parseFloat(s.fontSize)>=18||(parseFloat(s.fontSize)>=14&&+s.fontWeight>=700);
      if(cr<(big?3:4.5))lowC.add(`"${e.textContent.trim().slice(0,18)}" ${cr.toFixed(1)}:1`);});
    if(lowC.size)out.push(['a11y',`low-contrast text: ${[...lowC].slice(0,5).join(' | ')}`]);
    if(offScale.size)out.push(['theme',`font sizes off the type scale: ${[...offScale].map(([k,v])=>k+'px('+v.split(' ')[0]+')').join(', ')}`]);
    if(hues.size>3)out.push(['theme',`${hues.size} accent hues on one screen: ${[...hues].map(([k,v])=>k+'('+[...new Set(v)].slice(0,3).join('/')+')').join(', ')}`]);
    if(radii.size>5)out.push(['theme',`${radii.size} different corner radii: ${[...radii].sort((a,b)=>a-b).join(', ')}px`]);
    return out;});
  for(const[s,m]of r)note(persona,s,`[${where}] ${m}`);}
const T=(p,ms)=>p.clock.runFor(ms);

(async()=>{const b=await chromium.launch();
  // P1 morning triage
  {const P='p1-triage';const p=await open(b,P);await shot(p,P,'1-people');await checks(p,P,'people');
    const rows=await p.$$('.swipe .row, .row');if(!rows.length)note(P,'bug','no people rows rendered');
    const names=await p.$$eval('.row .nm',es=>es.map(e=>e.textContent));
    if(names.some(n=>/stripe|paypal|amazon|nike|linkedin|newsletter/i.test(n)))note(P,'bug',`bulk sender in People: ${names.filter(n=>/stripe|paypal|amazon|nike|linkedin|newsletter/i.test(n)).join(', ')}`);
    await p.locator('.row',{hasText:'Jordan Ellis'}).first().click();await p.waitForTimeout(700);await shot(p,P,'2-jordan');await checks(p,P,'conversation');
    const txt=await p.$eval('#msgs',e=>e.innerText);if(/wrote:|^>/m.test(txt))note(P,'bug','quoted reply text still visible in bubbles');if(/Recruiting Coordinator/.test(txt))note(P,'polish','email signature shown inside bubble');
    await p.click('#moreBtn');await p.waitForTimeout(300);await shot(p,P,'2b-more');await checks(p,P,'more-menu');const cm=p.locator('#menu button',{hasText:'Catch me up'});if(await cm.count()){await cm.click();await p.waitForTimeout(500);await shot(p,P,'3-catchup');}else note(P,'bug','Catch me up missing from the More menu');
    const draftBtn=p.locator('.chips button.ai');if(await draftBtn.count()){await draftBtn.click();await p.waitForTimeout(500);await shot(p,P,'4-draft');await p.click('#dUse');}
    await p.waitForTimeout(200);await shot(p,P,'5-sending');await T(p,11000);await p.waitForTimeout(300);await shot(p,P,'6-sent');
    const calls=await p.evaluate(()=>window.__CALLS.filter(c=>c[1]==='reply').length);if(calls!==1)note(P,'bug',`expected 1 reply call, got ${calls}`);
    await p.click('#convBack');await p.waitForTimeout(500);await shot(p,P,'7-after');
    await p.click('#tabFeed');await p.waitForTimeout(300);await shot(p,P,'8-feed');await checks(p,P,'feed');
    for(let i=0;i<3;i++){const x=p.locator('.roundbtns .round').first();if(await x.count()){await x.click();await p.waitForTimeout(500);}}
    await shot(p,P,'9-feed-after3');await p.click('#tabRing');await p.waitForTimeout(500);await shot(p,P,'10-ring');await checks(p,P,'ring');
    const tf=await p.$eval('#tFeed',e=>e.textContent);if(!/^3 \//.test(tf))note(P,'bug',`Feed tile should show 3 cleared, shows "${tf}"`);
    const tp=await p.$eval('#tPeople',e=>e.textContent);if(!/^1 \//.test(tp))note(P,'bug',`People tile should show 1 replied, shows "${tp}"`);
    await p.context().close();}
  // P2 long-press + reaction + undo
  {const P='p2-react';const p=await open(b,P);await p.locator('.row',{hasText:'Jordan Ellis'}).first().click();await p.waitForTimeout(700);
    const last=p.locator('.mrow.in .b').last();await last.click({button:'right'});await p.waitForTimeout(300);await shot(p,P,'1-menu');await checks(p,P,'menu');
    await p.locator('.reacts button').nth(1).click();await p.waitForTimeout(300);await shot(p,P,'2-react-sending');
    await p.click('#toastBtn');await p.waitForTimeout(300);const d=await p.$eval('#draft',e=>e.value);if(d!=='')note(P,'polish',`after Undo on a reaction the reply box holds "${d}" (should stay empty)`);
    await T(p,12000);const calls=await p.evaluate(()=>window.__CALLS.filter(c=>c[1]==='reply').length);if(calls)note(P,'bug','reply was sent even though Undo was tapped');
    await p.context().close();}
  // P3 group thread + very long email
  {const P='p3-group';const p=await open(b,P);await p.locator('.row',{hasText:/Sam Rivera|Priya/}).first().click();await p.waitForTimeout(700);await shot(p,P,'1-thread');await checks(p,P,'group');
    const whos=await p.$$eval('.whoname',e=>e.map(x=>x.textContent));if(whos.length<2)note(P,'polish','group thread does not label who said what');
    const h=await p.$eval('.mrow.in .b >> nth=-1',e=>e.getBoundingClientRect().height).catch(()=>0);if(h>700)note(P,'polish',`a single bubble is ${Math.round(h)}px tall; very long emails need a "read more" cap`);
    await p.context().close();}
  // P4 odd content
  {const P='p4-edge';const p=await open(b,P);await checks(p,P,'people');
    for(const who of ['Gutiérrez','Coachmike77','Mom','Dana']){const r=p.locator('.row',{hasText:new RegExp(who,'i')}).first();if(!await r.count()){note(P,'bug',`${who} row missing from People`);continue;}
      await r.click();await p.waitForTimeout(600);await shot(p,P,who);await checks(p,P,who);await p.click('#convBack');await p.waitForTimeout(450);}
    await p.context().close();}
  // P5 failures
  for(const[name,sim]of[['reply-toolerr',{fail:{reply:'tool_error'}}],['reply-unavail',{fail:{reply:'server_unavailable'}}],['archive-fail',{fail:{archive:'server_unavailable'}}],['reauth',{fail:{watch:'needs_reauth'}}],['nomcp',{noMcp:true}],['thread-fail',{fail:{thread:'server_unavailable'}}]]){
    const P='p5-'+name;const p=await open(b,P,sim);await p.waitForTimeout(300);
    if(name.startsWith('reply')){await p.locator('.row',{hasText:'Maya'}).first().click();await p.waitForTimeout(600);await p.fill('#draft','Got it, thanks!');await p.click('#sendBtn');await T(p,11000);await p.waitForTimeout(300);await shot(p,P,'1');
      const st=await p.$$eval('.status.err, .notdel',e=>e.map(x=>x.textContent));if(!st.length)note(P,'bug','failed send shows no error');}
    else if(name==='archive-fail'){await p.click('#tabFeed');await p.waitForTimeout(300);await p.locator('.roundbtns .round').first().click();await p.waitForTimeout(800);await shot(p,P,'1');}
    else if(name==='thread-fail'){await p.locator('.row',{hasText:'Maya'}).first().click();await p.waitForTimeout(700);await shot(p,P,'1');}
    else{await shot(p,P,'1');await p.click('#tabFeed');await p.waitForTimeout(200);await shot(p,P,'2-feed');await p.click('#tabRing');await p.waitForTimeout(200);await shot(p,P,'3-ring');}
    await checks(p,P,'state');await p.context().close();}
  // P6 empty inbox
  {const P='p6-empty';const p=await open(b,P,{inbox:'empty'});await shot(p,P,'1');await p.click('#tabFeed');await p.waitForTimeout(200);await shot(p,P,'2-feed');await p.click('#tabRing');await p.waitForTimeout(200);await shot(p,P,'3-ring');await p.context().close();}
  // P7 heavy inbox
  {const P='p7-heavy';const p=await open(b,P,{inbox:'heavy'});const n0=await p.$$eval('.row',e=>e.length);const lm=p.locator('.loadmore');
    if(await lm.count()){await lm.click();await p.waitForTimeout(400);const n1=await p.$$eval('.row',e=>e.length);if(n1<=n0)note(P,'bug','Load older mail added nothing');}else note(P,'bug','no Load older mail button with 150 threads');
    await p.evaluate(()=>document.getElementById('scrPeople').scrollTo(0,400));await p.waitForTimeout(300);await shot(p,P,'1-scrolled');await p.context().close();}
  // P8 dark mode
  {const P='p8-dark';const p=await open(b,P,{}, {dark:true});await shot(p,P,'1-people');await p.locator('.row',{hasText:'Jordan Ellis'}).first().click();await p.waitForTimeout(700);await shot(p,P,'2-conv');
    await p.click('#convBack');await p.waitForTimeout(450);await p.click('#tabFeed');await p.waitForTimeout(300);await shot(p,P,'3-feed');await p.click('#tabRing');await p.waitForTimeout(300);await shot(p,P,'4-ring');
    await p.click('#tabPeople');await p.click('#editBtn');await p.waitForTimeout(600);await shot(p,P,'5-settings');await checks(p,P,'settings-dark');await p.context().close();}
  // P9 screen sizes
  for(const[nm,vp]of[['small',{width:320,height:568}],['tablet',{width:1024,height:768}]]){const P='p9-'+nm;const p=await open(b,P,{}, {vp});await shot(p,P,'1-people');await checks(p,P,'people');
    await p.locator('.row',{hasText:'Jordan Ellis'}).first().click();await p.waitForTimeout(700);await shot(p,P,'2-conv');await checks(p,P,'conv');
    await p.click('#convBack');await p.waitForTimeout(450);await p.click('#tabFeed');await p.waitForTimeout(300);await shot(p,P,'3-feed');await checks(p,P,'feed');await p.context().close();}
  // P10 compose
  {const P='p10-compose';const p=await open(b,P);await p.click('#newBtn');await p.waitForTimeout(600);await shot(p,P,'1-sheet');await checks(p,P,'compose');
    await p.fill('#cTo','not-an-email');await p.locator('.sheet .bar button').last().click();await p.waitForTimeout(200);await shot(p,P,'2-invalid');
    await p.fill('#cTo','coach@example.com');await p.fill('#cSub','Winter camp');await p.fill('#cBody','Are you still in for the winter camp?');await p.locator('.sheet .bar button').last().click();await T(p,11000);await p.waitForTimeout(300);
    const c=await p.evaluate(()=>window.__CALLS.filter(c=>c[1]==='send_message').length);if(c!==1)note(P,'bug',`send_message called ${c} times`);await p.context().close();}
  // P11 search
  {const P='p11-search';const p=await open(b,P);await p.fill('#q','jordan');await p.press('#q','Enter');await p.waitForTimeout(400);await shot(p,P,'1');await checks(p,P,'search');
    const n=await p.$$eval('.row',e=>e.length);if(!n)note(P,'bug','search for "jordan" shows nothing');await p.context().close();}
  // P12 person info, snooze, swipe pin, menu remind
  {const P='p12-person';const p=await open(b,P);await p.locator('.row',{hasText:'Jordan Ellis'}).first().click();await p.waitForTimeout(700);await p.click('#whoBtn');await p.waitForTimeout(700);await shot(p,P,'1-info');await checks(p,P,'info');
    await p.locator('.actiontiles button',{hasText:'Snooze'}).click();await p.waitForTimeout(600);await shot(p,P,'2-snooze');await p.locator('.sheet .group button').first().click();await p.waitForTimeout(700);await shot(p,P,'3-after-snooze');
    const still=await p.locator('#peopleList .row',{hasText:'Jordan Ellis'}).count();if(still)note(P,'bug','snoozed person still listed in People');
    await p.context().close();}
  // P13 swipe actions on rows
  {const P='p13-swipe';const p=await open(b,P);
    const drag=async(txt,dx)=>{const r=await p.locator('.swipe > .row',{hasText:txt}).first().boundingBox();if(!r){note(P,'bug',`no swipe row for ${txt}`);return;}
      await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();for(let i=1;i<=8;i++)await p.mouse.move(r.x+r.width/2+dx*i/8,r.y+r.height/2);await p.waitForTimeout(80);};
    await drag('Jordan Ellis',110);await shot(p,P,'1-right');await checks(p,P,'swipe-right');await p.mouse.up();await p.waitForTimeout(500);
    await drag('Maya Santos',-170);await shot(p,P,'2-left');await checks(p,P,'swipe-left');await p.mouse.up();await p.waitForTimeout(500);await shot(p,P,'3-after');await p.context().close();}
  // P14 add to calendar
  {const P='p14-calendar';const p=await open(b,P);await p.locator('.row',{hasText:'Jordan Ellis'}).first().click();await p.waitForTimeout(700);
    const add=p.locator('.calcard button');if(!await add.count())note(P,'bug','no calendar card for "Friday Oct 16 at 2pm"');else{await add.click();await p.waitForTimeout(600);await shot(p,P,'1-sheet');await checks(p,P,'calendar');}
    await p.context().close();}
  // P15 AI off
  {const P='p15-noai';const p=await open(b,P,{ai:false});await p.locator('.row',{hasText:'Jordan Ellis'}).first().click();await p.waitForTimeout(700);await shot(p,P,'1-conv');
    await p.click('#moreBtn');await p.waitForTimeout(300);if(await p.locator('#menu button',{hasText:'Catch me up'}).count())note(P,'bug','Catch me up offered with no AI connected');await p.keyboard.press('Escape');await p.waitForTimeout(200);if(await p.locator('.chips button.ai').count())note(P,'bug','Draft-a-reply chip shown with no AI');
    await p.click('#convBack');await p.waitForTimeout(450);await p.click('#editBtn');await p.waitForTimeout(600);await shot(p,P,'2-settings');await checks(p,P,'settings-noai');await p.context().close();}
  // P16 clear the whole feed
  {const P='p16-feedzero';const p=await open(b,P);await p.click('#tabFeed');await p.waitForTimeout(300);
    for(let i=0;i<20;i++){const x=p.locator('.roundbtns .round').first();if(!await x.count())break;await x.click();await p.waitForTimeout(450);}
    await shot(p,P,'1-cleared');await checks(p,P,'feed-empty');const t=await p.$eval('#feedBody',e=>e.innerText);if(!/cleared/i.test(t))note(P,'bug',`feed never reached the cleared state: "${t.slice(0,60)}"`);
    await p.click('#tabRing');await p.waitForTimeout(400);await shot(p,P,'2-ring');await p.context().close();}
  // P17 settings in light mode
  {const P='p17-settings';const p=await open(b,P);await p.click('#editBtn');await p.waitForTimeout(600);await shot(p,P,'1');await checks(p,P,'settings');
    await p.evaluate(()=>document.querySelector('#settings .pinfo').scrollTo(0,9999));await p.waitForTimeout(200);await shot(p,P,'2-bottom');await p.context().close();}
  // P18 long-press the very last bubble (menu near the bottom edge)
  {const P='p18-bottommenu';const p=await open(b,P);await p.locator('.row',{hasText:'Maya Santos'}).first().click();await p.waitForTimeout(700);
    await p.locator('.mrow .b').last().click({button:'right'});await p.waitForTimeout(350);await shot(p,P,'1-menu');
    const bb=await p.$eval('#menu',e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right};});
    if(bb.bottom>844||bb.top<0||bb.left<0||bb.right>390)note(P,'bug',`long-press menu goes off screen ${JSON.stringify(bb)}`);await p.context().close();}
  // P19 celebration overlay + toast after a swipe action
  {const P='p19-moments';const p=await open(b,P);await p.evaluate(()=>celebrate(4));await p.waitForTimeout(500);await shot(p,P,'1-celebrate');await checks(p,P,'celebrate');await T(p,2500);
    const r=await p.locator('.swipe > .row',{hasText:'Dana'}).first().boundingBox();await p.mouse.move(r.x+200,r.y+30);await p.mouse.down();for(let i=1;i<=8;i++)await p.mouse.move(r.x+200-170*i/8,r.y+30);await p.mouse.up();await p.waitForTimeout(450);
    await shot(p,P,'1b-swiped');await p.locator('.swipe:has(.row:has-text("Dana")) .acts.r button',{hasText:'To Feed'}).first().click({timeout:4000});await p.waitForTimeout(500);await shot(p,P,'2-toast');await checks(p,P,'toast');
    if(await p.locator('#peopleList .row',{hasText:'Dana'}).count())note(P,'bug','Dana still in People after To Feed');await p.context().close();}
  // P20 long draft in the composer
  {const P='p20-longdraft';const p=await open(b,P);await p.locator('.row',{hasText:'Luis'}).first().click();await p.waitForTimeout(700);
    await p.fill('#draft','Hey Luis,\n\nGot the lineup. A few notes:\n- Bat Diaz second\n- Ruiz catches game two\n- Bus at 11 sharp\n\nThanks!\nGabe');await p.evaluate(()=>{$("draft").dispatchEvent(new Event("input"));});await p.waitForTimeout(200);
    await shot(p,P,'1');await checks(p,P,'longdraft');const h=await p.$eval('#draft',e=>e.getBoundingClientRect().height);if(h<60)note(P,'polish',`composer did not grow for a long draft (${Math.round(h)}px)`);await p.context().close();}
  // P21 scam message opened from search
  {const P='p21-scam';const p=await open(b,P);await p.fill('#q','paypal');await p.press('#q','Enter');await p.waitForTimeout(400);const r=p.locator('#peopleList .row').first();
    if(!await r.count())note(P,'bug','search for paypal found nothing');else{await r.click();await p.waitForTimeout(700);await shot(p,P,'1-conv');await checks(p,P,'scam');
      if(!await p.locator('.scam').count())note(P,'bug','no scam warning on the fake PayPal mail');}await p.context().close();}
  // P22 group thread, dark, small phone
  {const P='p22-darksmall';const p=await open(b,P,{}, {dark:true,vp:{width:320,height:568}});await p.locator('.row',{hasText:/Sam Rivera/}).first().click();await p.waitForTimeout(700);await shot(p,P,'1-group');await checks(p,P,'group-dark-small');
    await p.click('#convBack');await p.waitForTimeout(450);await p.click('#tabFeed');await p.waitForTimeout(300);await shot(p,P,'2-feed');await checks(p,P,'feed-dark-small');await p.context().close();}
  // P23 pin three people (pins grid)
  {const P='p23-pins';const p=await open(b,P);
    for(const who of ['Mom','Jordan Ellis','Maya Santos']){const r=await p.locator('.swipe > .row',{hasText:who}).first().boundingBox();if(!r)continue;await p.mouse.move(r.x+150,r.y+30);await p.mouse.down();for(let i=1;i<=8;i++)await p.mouse.move(r.x+150+100*i/8,r.y+30);await p.mouse.up();await p.waitForTimeout(450);
      await p.locator(`.swipe:has(.row:has-text("${who}")) .acts.l button`).first().click({timeout:4000});await p.waitForTimeout(500);}
    await shot(p,P,'1-pins');await checks(p,P,'pins');const n=await p.$$eval('.pin',e=>e.length);if(n!==3)note(P,'bug',`expected 3 pins, found ${n}`);await p.context().close();}
  // P25 double-tap send
  {const P='p25-doubletap';const p=await open(b,P);await p.locator('.row',{hasText:'Maya'}).first().click();await p.waitForTimeout(600);await p.fill('#draft','On it.');
    await p.click('#sendBtn');await p.click('#sendBtn',{force:true}).catch(()=>{});await T(p,12000);await p.waitForTimeout(200);const c=await p.evaluate(()=>window.__CALLS.filter(c=>c[1]==='reply').length);if(c!==1)note(P,'bug',`double-tap sent ${c} replies`);
    const bubbles=await p.$$eval('.mrow.out .b',e=>e.filter(x=>x.textContent==='On it.').length);if(bubbles!==1)note(P,'bug',`double-tap drew ${bubbles} bubbles`);await p.context().close();}
  // P26 5-second undo window
  {const P='p26-undo5';const p=await open(b,P);await p.click('#editBtn');await p.waitForTimeout(500);await p.locator('.segsmall button',{hasText:'5 s'}).click();await p.click('#setBack');await p.waitForTimeout(500);
    await p.locator('.row',{hasText:'Luis'}).first().click();await p.waitForTimeout(600);await p.fill('#draft','See you there');await p.click('#sendBtn');await T(p,6500);await p.waitForTimeout(200);
    const c=await p.evaluate(()=>window.__CALLS.filter(c=>c[1]==='reply').length);if(c!==1)note(P,'bug',`with a 5 s undo window, reply not sent after 6.5 s (calls=${c})`);await p.context().close();}
  // P27 keyboard only
  {const P='p27-keyboard';const p=await open(b,P);await p.locator('#peopleList .row').first().focus();await p.keyboard.press('Enter');await p.waitForTimeout(700);
    if(await p.locator('#conv').isHidden())note(P,'a11y','Enter on a focused row does not open the conversation');
    await p.locator('.mrow .b').last().focus();await p.keyboard.press('Shift+F10').catch(()=>{});await p.keyboard.press('ContextMenu').catch(()=>{});await p.waitForTimeout(300);
    const menu=!await p.locator('#menu').isHidden();if(!menu)note(P,'a11y','no keyboard way to open the message menu (ContextMenu key)');
    else{await p.keyboard.press('Escape');await p.waitForTimeout(300);if(!await p.locator('#menu').isHidden())note(P,'a11y','Escape does not close the message menu');}
    await p.click('#plusBtn');await p.waitForTimeout(500);await p.keyboard.press('Escape');await p.waitForTimeout(500);if(!await p.locator('#sheet').isHidden())note(P,'a11y','Escape does not close the compose sheet');
    await shot(p,P,'1');const f=await p.evaluate(()=>{const a=document.activeElement;return a&&a!==document.body?a.id||a.className:'body';});if(f==='body')note(P,'a11y','focus lost to <body> after closing the sheet');await p.context().close();}
  // P28 reduced motion: every transition must still land
  {const P='p28-reducedmotion';const p=await open(b,P,{}, {rm:true});await p.locator('.row',{hasText:'Jordan Ellis'}).first().click();await p.waitForTimeout(200);
    if(await p.locator('#conv').isHidden())note(P,'bug','conversation did not open with reduced motion');await p.click('#whoBtn');await p.waitForTimeout(200);await p.click('#pinfoDone');await p.waitForTimeout(200);
    await p.click('#convBack');await p.waitForTimeout(200);if(!await p.locator('#conv').isHidden())note(P,'bug','conversation stuck open with reduced motion');
    await p.click('#newBtn');await p.waitForTimeout(200);await p.locator('.sheet .bar button').first().click();await p.waitForTimeout(200);if(!await p.locator('#sheet').isHidden())note(P,'bug','sheet stuck open with reduced motion');
    await shot(p,P,'1');await p.context().close();}
  // P29 Spanish locale, 24-hour clock
  {const P='p29-es';const p=await open(b,P,{}, {locale:'es-ES'});await shot(p,P,'1-people');await checks(p,P,'people-es');await p.locator('.row',{hasText:'Jordan Ellis'}).first().click();await p.waitForTimeout(700);await shot(p,P,'2-conv');await checks(p,P,'conv-es');
    await p.click('#convBack');await p.waitForTimeout(450);await p.click('#tabRing');await p.waitForTimeout(300);await shot(p,P,'3-ring');await checks(p,P,'ring-es');await p.context().close();}
  // P30 first run: welcome screen
  for(const[nm,o]of[['light',{}],['dark',{dark:true}],['small',{vp:{width:320,height:568}}]]){const P='p30-welcome-'+nm;const p=await open(b,P,{},{...o,keepWelcome:true});
    if(!await p.locator('#welcome').isVisible())note(P,'bug','welcome screen not shown on first run');await shot(p,P,'1');await checks(p,P,'welcome');
    await p.click('#welcomeGo');await p.waitForTimeout(450);if(await p.locator('#welcome').isVisible())note(P,'bug','welcome screen did not close');await p.context().close();}
  fs.writeFileSync(path.join(OUT,'issues.json'),JSON.stringify(issues,null,1));
  const by={};for(const i of issues){const k=i.sev+' | '+i.msg.replace(/\[[^\]]+\] /,'');by[k]=by[k]||new Set();by[k].add(i.persona);}
  console.log(`ROUND ${ROUND}: ${issues.length} findings, ${Object.keys(by).length} unique`);for(const[k,v]of Object.entries(by))console.log(`- ${k}  (${[...v].join(', ')})`);
  await b.close();})().catch(e=>{console.error('RUNNER FAILED',e.message.split('\n')[0]);process.exit(1);});
