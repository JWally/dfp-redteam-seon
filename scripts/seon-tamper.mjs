#!/usr/bin/env node
/** seon-tamper.mjs — prove SEON payload is tamperable client-side:
 *  rewrite fields in the plaintext fingerprint tree before it's sealed,
 *  compare sessions. All local. */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
const sdk = readFileSync('/tmp/opencode/seon/agent.umd.js', 'utf-8');
const b = await chromium.launch({ headless:true });
const page = await b.newPage();
await page.route('**/*', async route => {
  const u = route.request().url();
  if (u.startsWith('data:') || u==='about:blank') return route.continue();
  await route.fulfill({ status:200, contentType:'application/json', body:'{}' });
});

async function getSession(label, mutate) {
  const p = await b.newPage();
  await p.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith('data:') || u==='about:blank') return route.continue();
    await route.fulfill({ status:200, contentType:'application/json', body:'{}' });
  });
  if (mutate) await p.addInitScript(mutate);
  await p.goto('about:blank');
  await p.addScriptTag({ content: sdk });
  await p.waitForTimeout(600);
  const r = await p.evaluate(async () => {
    const s = await self.seon.getSession({ region:'eu', silentMode:true, networkTimeoutMs:1000, fieldTimeoutMs:1000 });
    return s;
  }).catch(e=>({err:String(e).slice(0,150)}));
  await p.close();
  return { label, session: r };
}

// 1) clean
const clean = await getSession('clean', null);
// 2) tamper: fake timezone + canvas hash in the tree BEFORE sealing
const tamperTZ = () => {
  const oj=JSON.stringify;
  window.JSON.stringify=function(v,...a){ let s; try{s=oj.call(this,v,...a);}catch(e){return oj.apply(this,arguments);} if(typeof s==='string'&&s.startsWith('{"f":')){ try{ const o=JSON.parse(s); if(o.f && o.f.j) o.f.j['0']={v:'Asia/Tokyo',s:0}; if(o.f && o.f['13']) o.f['13']={'0':{v:'faketampercanvas0000000000000000',s:0}}; s=JSON.stringify(o); }catch(e){} } return s; };
};
const tampered = await getSession('tampered', tamperTZ);
// 3) tamper: webdriver flag
const tamperWD = () => {
  const oj=JSON.stringify;
  window.JSON.stringify=function(v,...a){ let s; try{s=oj.call(this,v,...a);}catch(e){return oj.apply(this,arguments);} if(typeof s==='string'&&s.startsWith('{"f":')){ try{ const o=JSON.parse(s); if(o.p) o.p.webdriver = true; s=JSON.stringify(o); }catch(e){} } return s; };
};
const tamperedWD = await getSession('tampered-webdriver', tamperWD);

console.log('=== SESSION DIFFERENTIAL ===');
for (const x of [clean, tampered, tamperedWD]) {
  const s = typeof x.session==='string'?x.session:JSON.stringify(x.session);
  console.log(`${x.label}: len ${s.length} | head: ${s.slice(0,60)}`);
}
const diff1 = clean.session !== tampered.session;
const diff2 = clean.session !== tamperedWD.session;
console.log('\nclean != tz-tampered:', diff1);
console.log('clean != webdriver-tampered:', diff2);
writeFileSync('/tmp/opencode/seon/tamper-results.json', JSON.stringify({clean,tampered,tamperedWD},null,2));
await b.close();
