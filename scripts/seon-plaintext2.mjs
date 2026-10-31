#!/usr/bin/env node
/** seon-plaintext2.mjs — deeper capture: all JSON.stringify + TextEncoder +
 *  the ciphertext-at-btoa boundary. Look for the FULL fingerprint object. */
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
  self.__cap={ json:[], enc:[], b64:[] };
  const oj=JSON.stringify;
  window.JSON.stringify=function(v,...a){ let s; try{s=oj.call(this,v,...a);}catch(e){return oj.apply(this,arguments);} if(typeof s==='string'&&self.__cap.json.length<500) self.__cap.json.push([s.length,s.slice(0,500)]); return s; };
  const ote=TextEncoder.prototype.encode;
  TextEncoder.prototype.encode=function(s){ const r=ote.call(this,s); if(typeof s==='string'&&s.length>5&&self.__cap.enc.length<300) self.__cap.enc.push([s.slice(0,300)]); return r; };
  const ob=window.btoa; window.btoa=function(s){ const r=ob.call(window,s); if(self.__cap.b64.length<100) self.__cap.b64.push([String(s).length, String(s).slice(0,80)]); return r; };
});
await page.goto('about:blank');
await page.addScriptTag({ content: sdk });
await page.waitForTimeout(1000);
const r = await page.evaluate(async () => {
  await self.seon.getSession({ region:'eu', silentMode:true, networkTimeoutMs:1000, fieldTimeoutMs:1000 });
  return self.__cap;
}).catch(e=>({err:String(e).slice(0,200)}));
writeFileSync('/tmp/opencode/seon/plaintext2.json', JSON.stringify(r,null,2));
// show the largest JSON captures (fingerprint payload candidates)
const js = (r.json||[]).sort((a,b)=>b[0]-a[0]);
console.log('=== largest JSON.stringify (top 8) ===');
for (const [l,s] of js.slice(0,8)) { console.log(`\n--- len ${l} ---`); console.log(s.slice(0,900)); }
console.log('\n=== TextEncoder captures (top 12 by length) ===');
const enc=(r.enc||[]).sort((a,b)=>b[0].length-a[0].length);
for (const [s] of enc.slice(0,12)) { console.log(`  (${s.length}) ${s.slice(0,140)}`); }
console.log('\nb64 (ciphertext lengths):', (r.b64||[]).map(x=>x[0]));
await b.close();
