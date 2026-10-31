#!/usr/bin/env node
/** seon-full-tree.mjs — capture the COMPLETE pre-encryption fingerprint tree
 *  (the {"f":{...}} record object) + the wire session, no truncation. */
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
  self.__f=[];
  const oj=JSON.stringify;
  window.JSON.stringify=function(v,...a){ let s; try{s=oj.call(this,v,...a);}catch(e){return oj.apply(this,arguments);} if(typeof s==='string'&&s.startsWith('{"f":')&&self.__f.length<5) self.__f.push(s); return s; };
  self.__sessions=[];
  const orig = null;
});
await page.goto('about:blank');
await page.addScriptTag({ content: sdk });
await page.waitForTimeout(800);
const r = await page.evaluate(async () => {
  const s = await self.seon.getSession({ region:'eu', silentMode:true, networkTimeoutMs:1000, fieldTimeoutMs:1000 });
  return { session: s, tree: self.__f };
}).catch(e=>({err:String(e).slice(0,200)}));
writeFileSync('/tmp/opencode/seon/full-tree.json', JSON.stringify(r,null,2));
console.log('session len:', typeof r.session==='string'?r.session.length:null);
console.log('tree captured:', (r.tree||[]).length, '| len:', r.tree?.[0]?.length);
if (r.tree?.[0]) {
  const t = r.tree[0];
  console.log('\n=== FULL TREE (first 6000) ===');
  console.log(t.slice(0,6000));
  console.log('\n... tail ...');
  console.log(t.slice(-600));
}
await b.close();
