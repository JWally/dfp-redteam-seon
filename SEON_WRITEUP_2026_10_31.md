# SEON (v6) Device-Fingerprint JavaScript SDK — Client-Side Red Team

**Executive write-up · 2026-10-31 · authorized, own-stack only · all SEON
telemetry fulfilled locally (nothing forwarded)**

> **One line:** SEON's v6 JavaScript agent (`agent.umd.js`) mints its entire
> device-fingerprint session **client-side with zero network** — the
> pre-encryption payload is a fully readable JSON tree at the
> `JSON.stringify` boundary, the wire session (`W;6.12.4;<salt>;<ciphertext>`)
> is sealed with a **custom (non-WebCrypto) cipher**, and rewriting any signal
> in the plaintext before sealing produces a **different, internally-valid
> session**. A client can rewrite every signal it ships; the real defense is
> server-side scoring.

---

## What we accomplished

1. **Recovered the SDK's string table.** `agent.umd.js` (335 KB, v6.12.4,
   `cdn.dfsdk.com`/`cdn.deviceinf.com`/`cdn.seonintelligence.com`) uses the
   `_0x`-style obfuscator with a base64+URI-decode string array. Patching the
   in-flight decoder recovered **2,857 plaintext strings** — the full signal
   surface, endpoints, blocklists, and field names.
2. **Read the complete pre-encryption payload.** The SDK builds the fingerprint
   as a JSON record tree `{"f":{...}}` and `JSON.stringify`s it before sealing.
   Captured at the boundary: **9,713 bytes, ~70 records** — canvas/webgl/audio
   hashes, WebRTC local+public IPs, timezone, screen, connection, UA/languages/
   cores, CSS media, permissions, per-record status codes, and error strings.
3. **Mapped the session format.** `W;6.12.4;<16B salt b64>;<encrypted payload
   b64>` — fully client-minted. Salt = `crypto.getRandomValues` (1 call), the
   cipher is **custom** (no `crypto.subtle`/AES-GCM in the bundle), payload
   2,832 bytes, high-entropy.
4. **Proved tamperability.** Rewrote the timezone + canvas hash in the
   plaintext tree before sealing → different session. Flipped `webdriver` →
   different session. All internally valid, no client-side integrity failure.
5. **Found the DNS-exfil channel.** The SDK resolves
   `*.seondnsresolve.com` (hash-prefixed subdomains) — DNS used as a
   fingerprint/telemetry channel.

## How we did it (methodology)

- **Runtime instrumentation (Playwright):** hooked `JSON.stringify` (captured
  the full plaintext tree), `btoa`/`atob` (ciphertext + salt boundary),
  `crypto.getRandomValues`, `TextEncoder`, `fetch` (fulfilled all locally).
- **In-flight decoder patch:** injected a log into `_0x20ba` (the string
  decoder) → dumped every decoded string with its index.
- **Tamper differential:** patched `JSON.stringify` to rewrite tree fields
  before the SDK's own sealing ran; compared the three resulting sessions.
- **Static:** confirmed no WebCrypto usage, identified the custom-cipher and
  DNS-resolve paths, enumerated the fraud-browser detection surface.

## What the payload contains (record tree, lettered sections)

| Key | Signal | Observed value (this headless run) |
|---|---|---|
| `f.2` | screen dims | `[22,38]` etc. |
| `f.3` | geolocation | `{lat:0,long:0,accuracy:0,status:-1}` |
| `f.5` | permissions | full permission list + granted/denied |
| `f.6` | WebGL renderer | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader…))` |
| `f.8` | webdriver | `false` |
| `f.9` | devtools-open | `true` (probe) |
| `f.13` | canvas hash | `93b5d4a255d9a775736e677572c5b1ac` |
| `f.30` | incognito flag | `false` |
| `f.34` | pointer coords | `{x:-0.5,y:-0.5}` |
| `f.43` | network info | `{rtt:0,effectiveType:"4g",downlink:9.9,saveData:false}` |
| `f.46` | AI APIs | `{languageDetector:"absent",summarizer:"absent"}` |
| `f.49` | gzip blob | `H4sIAAAA…` (compressed signal blob) |
| `f.b` | UA | `Mozilla/5.0 … HeadlessChrome/148…` (×4 realms) |
| `f.c/d` | language(s) | `en-US` / `["en-US"]` |
| `f.e` | hw concurrency | `12` |
| `f.g` | local WebRTC IPs | `["192.168.68.75"]` |
| `f.h` | public WebRTC IP | `["107.210.133.127"]` |
| `f.j` | timezone | `America/Chicago` |
| `f.k` | tz offset | `-05:00` |
| `f.l` | platform | `Linux x86_64` |
| `f.m` | screen full | `{a:1280,b:720,…orientation:"landscape-primary"}` |
| `f.F` | CSS media | `{prefers-color-scheme,color-gamut,pointer,hover,…}` (30 fields) |
| `f.s` | sealed sub-blob | base64 blob, `c:900` |
| `f.V` | audio timing | `[90,11.1,73.9,0,…]` |
| `f.b` (outer) | browser hash | `13dbc0f0e79b21f7c7de439811634558` |
| `m` | SDK meta | `{t:1053,s:"js-6.12.4-umd-prod",i:"72c7862c…",c:124}` |
| `l` (outer) | large blob | encoded (behavioral/network) |
| `n` | network status | `Error: Network fingerprint is not valid` (local) |

Also: **fraud-browser detection** — a huge embedded list of ad-network /
affiliate link-pattern selectors (`a[href^="…"]`, `.appguide-wrap`, etc.) and
native-app/emulator identifiers (iOS app bundles, `com.*` packages), plus
webdriver probes (`__webdriver_script_fn`, `__driver_evaluate`, `cdpDetected`
family).

## What it proves

- The **client holds everything**: signal collection, serialization, and
  sealing all run in the page. `getSession()` returns a valid session with
  **zero network calls**.
- The session is **tamperable end-to-end**: rewrite the tree at the
  `JSON.stringify` boundary → the SDK seals the rewrite → a different,
  internally-valid session comes out. No client-side MAC/integrity catch.
- The **per-session salt (16B random) blocks verbatim replay** but not live
  re-sealing — same as every other vendor in this project.
- The **real boundary is server-side**: SEON's Fraud API scores the session
  server-side (TLS/JA3/IP correlation, behavioral, device-history). The client
  is a carrier, not a proof.

## How this could be (ab)used

1. **Signal laundering** — rewrite canvas/webgl/audio hashes, timezone, IPs
   before sealing so the fingerprint no longer matches a flagged device.
2. **Fresh-identity minting** — `getSession()` with a modified tree = a new
   "device" per call, fragmenting device-history correlation.
3. **Bot-tell erasure** — flip `webdriver`, devtools, incognito flags.
4. **Telemetry model-building** — read the plaintext tree to learn exactly what
   maps to what, then craft coherent lies.

## Honesty / scope notes

- Authorized, own-stack only; **all SEON telemetry fulfilled locally** — no
  customer/prod traffic, nothing forwarded to SEON.
- We did **not** forge a server-side verdict or contact SEON's API; the
  "Network fingerprint is not valid" status is from the local fulfill.
- The cipher is custom and unbroken here — we read the *plaintext before
  encryption* (the same boundary every client-side red team uses), so the
  session confidentiality wasn't the target; the trust model is.

## Repo layout

```
SEON_WRITEUP_2026_10_31.md        this file
screenshots/seon-full.png         headed demo: session format + full readable
                                  tree + tamper differential
scripts/seon-probe.mjs            load real SDK, find globals, first session
scripts/seon-session.mjs          capture N sessions, dissect format
scripts/seon-decoder-trace.mjs    patch _0x20ba, dump 2,857 decoded strings
scripts/seon-plaintext.mjs/2.mjs  capture JSON.stringify/btoa/encoder boundary
scripts/seon-full-tree.mjs        capture the complete 9,713-byte plaintext tree
scripts/seon-full-payload.mjs     capture the WebGL sub-object
scripts/seon-tamper.mjs           clean vs tampered session differential
scripts/seon-visual.mjs           headed demo → screenshots/seon-full.png
artifacts/decoded-strings.json    2,857 recovered plaintext strings
artifacts/full-tree.json          the complete pre-encryption fingerprint tree
artifacts/sessions.json           raw session blobs
artifacts/plaintext2.json         stringify/b64/encoder capture
artifacts/tamper-results.json     clean vs tz vs webdriver sessions
```

```bash
npm install                        # playwright
node scripts/seon-session.mjs      # capture + dissect sessions (local)
node scripts/seon-full-tree.mjs    # dump the plaintext fingerprint tree
node scripts/seon-tamper.mjs       # tamper differential
node scripts/seon-visual.mjs       # headed demo → screenshots/seon-full.png
```
