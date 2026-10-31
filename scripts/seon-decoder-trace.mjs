#!/usr/bin/env node
/** seon-decoder-trace.mjs — patch SEON's _0x20ba string decoder in-flight,
 *  capture every decoded string + hook the session builder. All local. */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';

let sdk = readFileSync('/tmp/opencode/seon/agent.umd.js', 'utf-8');

// Patch the decoder: after `o=_0x20ba.SIftXi(o)` log the decoded string.
// Original: (o=_0x20ba.SIftXi(o),n[u]=o)
const from = '(o=_0x20ba.SIftXi(o),n[u]=o)';
const to   = '(o=_0x20ba.SIftXi(o),n[u]=o,(self.__strs=self.__strs||[]).length<4000&&self.__strs.push([t,o]))';
if (sdk.includes(from)) { sdk = sdk.replace(from, to); console.log('decoder patched'); }
else console.log('DECODER PATCH MISS');

const b = await chromium.launch({ headless:true });
const page = await b.newPage();
await page.route('**/*', async route => {
  const u = route.request().url();
  if (u.startsWith('data:') || u==='about:blank') return route.continue();
  await route.fulfill({ status:200, contentType:'application/json', body:'{}' });
});
const errs=[];
page.on('pageerror', e=>errs.push(String(e).slice(0,200)));
await page.goto('about:blank');
await page.addScriptTag({ content: sdk });
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  const s = await self.seon.getSession({ region:'eu', silentMode:true, networkTimeoutMs:1000, fieldTimeoutMs:1000 });
  return { session: s, strs: self.__strs || [] };
}).catch(e=>({err:String(e).slice(0,200)}));
writeFileSync('/tmp/opencode/seon/decoded-strings.json', JSON.stringify(r.strs||[],null,0));
console.log('decoded strings:', (r.strs||[]).length);
const printable = (r.strs||[]).filter(([i,o])=>o && /[\x20-\x7e]{2,}/.test(o));
console.log('\n=== printable decoded strings ===');
const seen=new Set();
for (const [i,o] of printable) {
  if (seen.has(o)) continue; seen.add(o);
  console.log(`  [${i}] ${o.slice(0,90)}`);
}
console.log('\nerrors:', errs.slice(0,4));
await b.close();
