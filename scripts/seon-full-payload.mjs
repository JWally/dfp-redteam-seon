#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
const sdk = readFileSync('/tmp/opencode/seon/agent.umd.js', 'utf-8');
const b = await chromium.launch({ headless:true });
const page = await b.newPage();
await page.route('**/*', async route => { const u=route.request().url(); if(u.startsWith('data:')||u==='about:blank') return route.continue(); await route.fulfill({status:200,contentType:'application/json',body:'{}'}); });
await page.addInitScript(() => {
  self.__big=[];
  const oj=JSON.stringify;
  window.JSON.stringify=function(v,...a){ let s; try{s=oj.call(this,v,...a);}catch(e){return oj.apply(this,arguments);} if(typeof s==='string'&&s.length>2000&&self.__big.length<10) self.__big.push(s); return s; };
});
await page.goto('about:blank');
await page.addScriptTag({ content: sdk });
await page.waitForTimeout(1000);
const r = await page.evaluate(async () => { await self.seon.getSession({ region:'eu', silentMode:true, networkTimeoutMs:1000, fieldTimeoutMs:1000 }); return self.__big; }).catch(e=>({err:String(e).slice(0,200)}));
writeFileSync('/tmp/opencode/seon/full-payload.json', JSON.stringify(r,null,2));
if (Array.isArray(r) && r.length) { const p=r[0]; console.log('payload len:', p.length); console.log(p.slice(0,3000)); }
await b.close();
