#!/usr/bin/env python3
"""Paste the LIVE Lemon Squeezy ids into index.html (replaces every TODO_LIVE_* placeholder).
  python3 release/fill_live_ids.py \
     --product-pro 1234567 --product-lifetime 1234568 \
     --variant-monthly 2234567 --variant-yearly 2234568 --variant-lifetime 2234569 \
     --checkout-monthly  https://autoprod-dev.lemonsqueezy.com/checkout/buy/<uuid> \
     --checkout-yearly   https://autoprod-dev.lemonsqueezy.com/checkout/buy/<uuid> \
     --checkout-lifetime https://autoprod-dev.lemonsqueezy.com/checkout/buy/<uuid>
(--checkout-* also accept just the uuid; if Monthly and Yearly share one product checkout link, pass it twice.)
Refuses the TEST-mode ids from LS_TEST_IDS.md. Store id stays 485739."""
import argparse, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_IDS = {'1395962', '1395968', '2179964', '2179971', '2179974', '1395983', '2179990', '1395989', '2179996'}
TEST_UUIDS = {'26141028-ac72-45a5-95d5-07ebf96e9a2e', 'bbdeab5d-7ff3-48e8-88d1-5d0fec3c620c', 'd69e7ed5-d47d-40af-8d17-a7e599a89314',
              'b651f763-872a-4c99-a1d8-35974d4a7657', 'a60fb931-6ce2-4e80-bfd3-9090736e7a5a'}
ap = argparse.ArgumentParser()
for a in ('product-pro', 'product-lifetime', 'variant-monthly', 'variant-yearly', 'variant-lifetime',
          'checkout-monthly', 'checkout-yearly', 'checkout-lifetime'): ap.add_argument('--' + a, required=True)
a = vars(ap.parse_args())
def num(k):
    v = a[k].strip()
    if not re.fullmatch(r'\d{5,10}', v): sys.exit(f'--{k}: expected a numeric id, got {v!r}')
    if v in TEST_IDS: sys.exit(f'--{k}: {v} is a TEST-mode id (LS_TEST_IDS.md), not live')
    return v
def uuid(k):
    m = re.search(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', a[k].lower())
    if not m: sys.exit(f'--{k}: no checkout uuid found in {a[k]!r}')
    if m.group(1) in TEST_UUIDS: sys.exit(f'--{k}: that is the TEST-mode checkout link')
    return m.group(1)
ids = {'k-' + k: num(k) for k in ('product-pro', 'product-lifetime', 'variant-monthly', 'variant-yearly', 'variant-lifetime')}
if len(set(ids.values())) != 5: sys.exit('ids must all be different')
rep = {
    'TODO_LIVE_PRODUCT_PRO': ids['k-product-pro'], 'TODO_LIVE_PRODUCT_LIFETIME': ids['k-product-lifetime'],
    'TODO_LIVE_VARIANT_MONTHLY': ids['k-variant-monthly'], 'TODO_LIVE_VARIANT_YEARLY': ids['k-variant-yearly'],
    'TODO_LIVE_VARIANT_LIFETIME': ids['k-variant-lifetime'],
    'TODO_LIVE_CHECKOUT_MONTHLY_UUID': uuid('checkout-monthly'), 'TODO_LIVE_CHECKOUT_YEARLY_UUID': uuid('checkout-yearly'),
    'TODO_LIVE_CHECKOUT_LIFETIME_UUID': uuid('checkout-lifetime'),
}
p = os.path.join(ROOT, 'index.html'); h = open(p, encoding='utf-8').read()
for k in sorted(rep, key=len, reverse=True):
    if k not in h: sys.exit(f'{k} not found in index.html (already filled?)')
    h = h.replace(k, rep[k])
if 'TODO_LIVE' in h: sys.exit('TODO_LIVE left after filling: ' + ', '.join(sorted(set(re.findall(r'TODO_LIVE\w*', h)))))
open(p, 'w', encoding='utf-8', newline='\n').write(h)
print('filled', len(rep), 'placeholders in', p)
for k, v in rep.items(): print(f'  {k:34} -> {v}')
