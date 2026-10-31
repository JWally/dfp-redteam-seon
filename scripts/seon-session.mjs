#!/usr/bin/env node
/** seon-session.mjs — capture full SEON session, decode base64 segments,
 *  dump structure. All telemetry local. */
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
await page.goto('about:blank');
await page.addScriptTag({ content: sdk });
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  const out = { sessions: [], methods: Object.keys(self.seon) };
  for (let i=0;i<3;i++){
    try { const s = await self.seon.getSession({ region:'eu', silentMode:true, networkTimeoutMs:1000, fieldTimeoutMs:1000 }); out.sessions.push(s); } catch(e){ out.err=String(e).slice(0,150); }
  }
  return out;
}).catch(e=>({err:String(e).slice(0,200)}));
writeFileSync('/tmp/opencode/seon/sessions.json', JSON.stringify(r,null,2));
console.log('methods:', r.methods);
for (let i=0;i<r.sessions.length;i++){
  const s=r.sessions[i];
  console.log(`\n=== session ${i}: len ${s.length} ===`);
  console.log('  head:', s.slice(0,120));
  console.log('  tail:', s.slice(-60));
  // structure: split on ';'
  const parts = s.split(';');
  console.log('  ;-parts:', parts.length, '| first:', JSON.stringify(parts.slice(0,4)));
}
console.log('\nerr:', r.err);
await b.close();
