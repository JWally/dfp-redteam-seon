# dfp-redteam-seon — SEON v6 device-fingerprint SDK

Client-side red-team of SEON's JS SDK. Full details in `SEON_WRITEUP_2026_10_31.md`.

---

## What we observed (the shipped payload)

**The pre-encryption payload is a fully readable JSON tree — captured at the
`JSON.stringify` boundary before the custom cipher seals it.** Key facts:

- **9,713-byte** pre-encryption fingerprint tree read in full (2,857-string
  obfuscation table recovered).
- Custom cipher (`W;ver;salt;cipher`) — no WebCrypto/AES-GCM; session fully
  **client-minted with zero network calls**.
- Every signal tamperable before sealing (tz/canvas/webdriver differential
  proven).
- DNS-exfil to `*.seondnsresolve.com`.

The full payload tree (navigator, canvas, webgl, fonts, screen, mouse, storage
probes) is readable end-to-end — see the writeup's captured JSON.

## Status

- 🟢 Read payload: full pre-encryption tree at `JSON.stringify` (plaintext)
- 🟢 Tamper with payload: mint + tamper any signal before the custom cipher seals it
- 🟢 Mint token: session (`W;ver;salt;cipher`) fully client-minted

## Files

- writeup: `SEON_WRITEUP_2026_10_31.md`
- scripts + artifacts in `scripts/` and `artifacts/` (per the writeup)
