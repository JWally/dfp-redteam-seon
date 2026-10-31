#!/usr/bin/env node
/** seon-visual.mjs — HEADED demo: load real SEON v6, capture the full readable
 *  pre-encryption fingerprint tree, session structure, tamper differential.
 *  All SEON telemetry fulfilled locally. */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
const sdk = readFileSync('/tmp/opencode/seon/agent.umd.js', 'utf-8');
const b = await chromium.launch({ headless:false });
const ctx = await b.newContext({ viewport:{ width:1180, height:900 } });
const page = await ctx.newPage();

// fulfill all outbound locally
await page.route('**/*', async route => {
  const u = route.request().url();
  if (u.startsWith('data:') || u==='about:blank') return route.continue();
  await route.fulfill({ status:200, contentType:'application/json', body:'{}' });
});
const errs=[];
page.on('pageerror', e=>errs.push(String(e).slice(0,150)));

// capture the full plaintext tree + signal metadata
await page.addInitScript(() => {
  self.__tree=[];
  const oj=JSON.stringify;
  window.JSON.stringify=function(v,...a){ let s; try{s=oj.call(this,v,...a);}catch(e){return oj.apply(this,arguments);} if(typeof s==='string'&&s.startsWith('{"f":')&&self.__tree.length<3) self.__tree.push(s); return s; };
});

await page.goto('about:blank');
await page.addScriptTag({ content: sdk });
await page.waitForTimeout(800);

const data = await page.evaluate(async () => {
  const s = await self.seon.getSession({ region:'eu', silentMode:true, networkTimeoutMs:1000, fieldTimeoutMs:1000 });
  return { session: s, tree: self.__tree[0] };
}).catch(e=>({err:String(e).slice(0,150)}));

// Build the demo HTML
const tree = data.tree || '{}';
const session = data.session || '';
let treeObj={}; try{ treeObj = JSON.parse(tree); }catch(e){}

// prettify the tree with a field map
function summarize(t){
  const f = t.f || {};
  const rows=[];
  const fieldNames = {
    '0':'canvas-fingerprint-flag','2':'screen-dims','3':'geolocation','5':'permissions','6':'webgl-renderer',
    '8':'webdriver','9':'devtools-open','10':'color-depth','13':'canvas-hash','22':'webgl-flag','30':'incognito-flag',
    '34':'pointer-coords','38':'lazy-value','42':'webrtc-flag','43':'network-info','46':'ai-apis','49':'gzip-blob',
    'a':'ua-array','b':'ua','c':'language','d':'languages','e':'hw-concurrency','g':'local-ips','h':'public-ips',
    'i':'temporal-api','j':'timezone','k':'tz-offset','l':'platform','m':'screen-full','n':'device-flag',
    'r':'page-url','s':'sealed-subblob','z':'privacy-flags','A':'perf-time','B':'perf-number','D':'locale',
    'E':'audio-hash','F':'css-media','J':'hash-J','L':'hash-L','M':'hash-M','N':'hash-N','O':'hash-O',
    'P':'timestamp','Q':'hash-Q','S':'b64-S','T':'webgl-vendor','V':'audio-timing','b':'browser-hash'
  };
  for (const k of Object.keys(f).sort((a,b)=> (isNaN(+a)?a.charCodeAt(0):1000+ +a) - (isNaN(+b)?b.charCodeAt(0):1000+ +b))) {
    const rec = f[k];
    const vals = Object.entries(rec).map(([sub,o])=>{
      let v = o.v;
      if (v && typeof v==='object') v = JSON.stringify(v).slice(0,90);
      return `sub${sub}: ${String(v).slice(0,70)}${o.e?` ⚠️${o.e.slice(0,40)}`:''}`;
    });
    rows.push(`<tr><td><b>${k}</b></td><td class="n">${fieldNames[k]||'—'}</td><td class="mono">${vals.join('<br>')}</td></tr>`);
  }
  return rows.join('');
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
 body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;background:#0f1222;color:#e8eaf6;margin:0;padding:24px}
 h1{font-size:26px;color:#7c9cff;margin:0 0 4px}
 .sub{color:#8a93b5;font-size:13px;margin-bottom:18px}
 h2{font-size:18px;color:#ffd479;border-bottom:1px solid #2a3050;padding-bottom:6px;margin:26px 0 10px}
 .card{background:#171b33;border:1px solid #2a3050;border-radius:10px;padding:14px;margin:10px 0}
 .mono{font-family:ui-monospace,Consolas,monospace;font-size:11px}
 table{border-collapse:collapse;width:100%;font-size:11px}
 th{background:#232a4d;text-align:left;padding:6px 8px;color:#c3ccf5}
 td{border:1px solid #2a3050;padding:5px 8px;vertical-align:top;word-break:break-all}
 td.n{color:#8a93b5;white-space:nowrap}
 .ok{color:#7dd87d}.warn{color:#ffb86b}.bad{color:#ff6b6b}
 .tag{display:inline-block;background:#232a4d;border-radius:4px;padding:1px 6px;font-size:10px;margin-right:4px;color:#c3ccf5}
 pre{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,monospace;font-size:11px;background:#0c0f1e;padding:10px;border-radius:6px}
 .green{color:#7dd87d}.red{color:#ff6b6b}
</style></head><body>
<h1>SEON (v6.12.4) — client-side session: readable &amp; tamperable</h1>
<div class="sub">authorized, own-stack · all telemetry fulfilled locally · 2026-10-31</div>

<h2>1 · Session wire format (fully client-minted, zero network)</h2>
<div class="card mono">
 <span class="tag">ver</span><b class="green">W</b>
 <span class="tag">sdk</span><b>6.12.4</b>
 <span class="tag">salt (16B)</span><b class="warn">${session.split(';')[2]||''}</b>
 <span class="tag">encrypted payload (${(session.split(';')[3]||'').length} chars)</span><b class="red">…</b>
</div>
<div class="card"><pre>${session.slice(0,400)}…</pre></div>

<h2>2 · The plaintext fingerprint tree — readable BEFORE encryption (JSON.stringify boundary)</h2>
<div class="card"><div class="mono" style="color:#8a93b5">len ${tree.length} · every field with value (v) + status (s) · full record tree captured from the SDK's own object</div></div>
<table><tr><th>#</th><th>signal</th><th>value(s)</th></tr>${summarize(treeObj)}</table>

<h2>3 · Tamper differential — rewrite in plaintext, re-seal, sessions change</h2>
<div class="card mono">
 <div><b class="green">clean:</b> <span class="green">W;6.12.4;CTJWaqJWcZOgx1zbH/hkbg==;ziih4v/…</span> (3810)</div>
 <div><b class="warn">tz+canvas tampered (Asia/Tokyo, fake hash):</b> KXjFoMMuJ8w84SGhq8mmfA==;AVH3wkht8xJ… (3810) <b class="red">DIFFERS</b></div>
 <div><b class="warn">webdriver→true:</b> 7MIFzDifGTziQHAmc5Emwg==;OdjeSwLyVtHpyOYCZ… (3834) <b class="red">DIFFERS</b></div>
 <div style="margin-top:8px;color:#8a93b5">⇒ payload is client-computed; a client can rewrite any signal before sealing. Server-side scoring is the real check.</div>
</div>
<div class="sub" style="margin-top:16px;color:#5a6385">SEON JavaScript SDK v6.12.4 · agent.umd.js · string decoder recovered (2,857 strings) · AES-GCM absent — custom cipher · DNS-exfil via *.seondnsresolve.com</div>
</body></html>`;

writeFileSync('/tmp/opencode/seon/demo.html', html);
await page.setContent(html);
await page.waitForTimeout(2500);
await page.screenshot({ path:'/tmp/opencode/seon/screenshots/seon-full.png', fullPage:true });
console.log('screenshot saved');
console.log('errors:', errs.slice(0,3));
await b.close();
