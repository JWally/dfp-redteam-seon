#!/usr/bin/env node
/** seon-plaintext.mjs — capture what SEON builds during getSession():
 *  every JSON.stringify (plaintext candidate), btoa, atob, getRandomValues.
 *  All local. */
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
await page.addInitScript(() => {
  self.__cap={ json:[], b64:[], rand:0, net:[] };
  const oj=JSON.stringify; window.JSON.stringify=function(v,...a){
    let s; try{ s=oj.call(this,v,...a); }catch(e){ return oj.apply(this,arguments); }
    if (typeof s==='string' && s.length>8 && self.__cap.json.length<200) self.__cap.json.push([s.length, s.slice(0,400)]);
    return s;
  };
  const ob=window.btoa; window.btoa=function(s){ const r=ob.call(window,s); if(self.__cap.b64.length<200) self.__cap.b64.push(['btoa', String(s).slice(0,120), r.slice(0,60)]); return r; };
  const oa=window.atob; window.atob=function(s){ const r=oa.call(window,s); if(self.__cap.b64.length<200) self.__cap.b64.push(['atob', s.slice(0,120)]); return r; };
  const oc=window.crypto.getRandomValues.bind(window.crypto);
  window.crypto.getRandomValues=function(a){ self.__cap.rand++; return oc(a); };
  const of=window.fetch; window.fetch=function(...a){ const u=a[0] instanceof Request?a[0].url:String(a[0]); if(self.__cap.net.length<30) self.__cap.net.push(u.slice(0,160)); return of.apply(this,a); };
});
await page.goto('about:blank');
await page.addScriptTag({ content: sdk });
await page.waitForTimeout(1000);
const r = await page.evaluate(async () => {
  const s = await self.seon.getSession({ region:'eu', silentMode:true, networkTimeoutMs:1000, fieldTimeoutMs:1000 });
  return { session: s.slice(0,80), cap: self.__cap };
}).catch(e=>({err:String(e).slice(0,200)}));
writeFileSync('/tmp/opencode/seon/plaintext-cap.json', JSON.stringify(r,null,2));
console.log('session head:', r.session);
console.log('\n=== JSON.stringify captures (len > 100) ===');
const big = (r.cap?.json||[]).filter(([l])=>l>100);
console.log('count >100:', big.length);
for (const [l,s] of big.slice(0,10)) { console.log(`\n--- len ${l} ---`); console.log(s.slice(0,600)); }
console.log('\n=== b64 ops ===');
for (const x of (r.cap?.b64||[]).slice(0,20)) console.log(' ', JSON.stringify(x).slice(0,200));
console.log('\ngetRandomValues calls:', r.cap?.rand, '| net:', (r.cap?.net||[]).slice(0,5));
await b.close();
