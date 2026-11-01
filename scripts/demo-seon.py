#!/usr/bin/env python3
"""demo-seon.py — print the FULL SEON pre-encryption payload tree (captured
at the JSON.stringify boundary before the custom cipher sealed it)."""
import json, sys

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '/home/justin/Dev/dfp-redteam-seon-2026-10-31/artifacts/plaintext2.json'
    d = json.load(open(src))
    print('=' * 74)
    print('SEON v6 — FULL PRE-ENCRYPTION PAYLOAD TREE (plaintext)')
    print('captured at JSON.stringify boundary, before custom cipher seal')
    print('=' * 74)
    print(json.dumps(d, indent=1, default=str)[:6000])
    print('=' * 74)
    if isinstance(d, dict):
        print(f'SIGNALS SHIPPED: {len(d)}')

if __name__ == '__main__':
    main()
