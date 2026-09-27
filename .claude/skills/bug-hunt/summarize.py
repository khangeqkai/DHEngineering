#!/usr/bin/env python3
"""Summarise one bug-hunt round's workflow output file, and save any carried
bugs to carried.json next to it (pass them to the next round as args.carried).
Usage: summarize.py <workflow-output-file>"""
import json, os, sys
path = sys.argv[1]
d = json.load(open(path))['result']
for v in d.get('verdicts') or []:
    print('VERDICT', v['decision'], v['severity'], '|', v['title'])
    if v['decision'] == 'owner':
        print('   OWNER PROPOSAL:', v.get('ownerProposal'))
print()
for f in d.get('fixes') or []:
    print('FIX', f['status'], '|', f['title'], '|', ', '.join(f.get('files') or []))
    if f['status'] != 'fixed':
        print('   NOTE:', f.get('note'))
print((d.get('checkOutput') or '')[:300])
for r in d.get('review') or []:
    print('REVIEW', 'PASS' if r['pass'] else 'FAIL', '|', r['title'])
    if not r['pass']:
        print('   PROBLEM:', r.get('problem'))
carried = d.get('carried') or []
out = os.path.join(os.path.dirname(os.path.abspath(path)), 'carried.json')
json.dump(carried, open(out, 'w'))
print(f'carried: {len(carried)} (saved to {out})')
