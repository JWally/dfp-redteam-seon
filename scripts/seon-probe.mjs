#!/usr/bin/env node
/** seon-probe.mjs — load the REAL SEON v6 agent.umd.js in a browser, hook the
 *  string decoder + network + getSession, capture the session blob and what
 *  the SDK does. All SEON telemetry fulfilled locally. */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';

const sdk = readFileSync('/tmp/opencode/seon/agent.umd.js', 'utf-8');
const b = await chromium.launch({ headless:true });
const ctx = await b.newContext();
const page = await ctx.newPage();

// fulfill ALL outbound requests locally
await page.route('**/*', async route => {
  const u = route.request().url();
  if (u.startsWith('data:') || u==='about:blank') return route.continue();
  const method = route.request().method();
  console.log('NET:', method, u.slice(0,140));
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ statusCode:0, data:{} }) });
});

const errs=[];
page.on('pageerror', e=>errs.push(String(e).slice(0,250)));
page.on('console', m=>{ const t=m.text(); if(/error/i.test(t)) errs.push('console:'+t.slice(0,150)); });

// instrument before SDK loads: hook btoa/atob/JSON/fetch + capture decoded strings
await page.addInitScript(() => {
  self.__cap={ b64:[], json:[], net:[], fn:[] };
  const oa=window.atob; window.atob=function(s){ const r=oa.call(window,s); if(self.__cap.b64.length<300) self.__cap.b64.push([s.slice(0,60),r.slice(0,80)]); return r; };
  const ob=window.btoa; window.btoa=function(s){ const r=ob.call(window,s); if(self.__cap.b64.length<300) self.__cap.b64.push(['btoa:'+s.slice(0,40),r.slice(0,60)]); return r; };
  const oj=JSON.parse; window.JSON.parse=function(s,...a){ const r=oj.call(this,s,...a); if(typeof s==='string'&&s.length>10&&self.__cap.json.length<100) self.__cap.json.push(s.slice(0,200)); return r; };
  const of=window.fetch; window.fetch=function(...a){ const u=a[0] instanceof Request?a[0].url:String(a[0]); self.__cap.net.push(u.slice(0,160)); return of.apply(this,a); };
});

// load on a local secure-context page
await page.goto('about:blank');
await page.addScriptTag({ content: sdk });
await page.waitForTimeout(2000);

// what global did it attach? scan globals
const globs = await page.evaluate(() => Object.keys(self).filter(k=>/seon|agent|df|finger/i.test(k))).catch(()=>[]);
console.log('seon-ish globals:', globs);

// call the API surface
const api = await page.evaluate(async () => {
  const out = {};
  const g = self;
  // try common entry points
  for (const name of ['seon','agent','dfSDK','Seon','SEON']) {
    if (g[name]) { out[name] = Object.keys(g[name]); }
  }
  // try calling getSession/init if exposed
  try {
    if (g.seon && g.seon.getSession) {
      const s = await g.seon.getSession({ region:'eu', silentMode:true, networkTimeoutMs:1000, fieldTimeoutMs:1000 });
      out.sessionType = typeof s;
      out.session = typeof s==='string' ? s.slice(0,120) : JSON.stringify(s).slice(0,120);
      out.sessionLen = typeof s==='string' ? s.length : null;
    }
  } catch(e) { out.getSessionErr = String(e).slice(0,200); }
  return out;
}).catch(e=>({err:String(e).slice(0,200)}));
console.log('\nAPI:', JSON.stringify(api,null,2));
console.log('\nerrors:', errs.slice(0,5));
writeFileSync('/tmp/opencode/seon/probe1.json', JSON.stringify({globs, api},null,2));
await b.close();
