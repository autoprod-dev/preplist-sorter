#!/usr/bin/env python3
"""Build the paid offline Windows edition (Prepline-Pro-Windows.zip) from the LIVE source.
    python3 release/build_pro_zip.py
Strips the public-site SEO block (the offline file has no web address), then runs
build_offline.py --edition pro, then stages the zip in ../prepline-pro-live-release/lemonsqueezy-upload/<branch>/
for attaching to the live Lemon Squeezy variants. The zip is a PAID file: never put it in the public site."""
import os, re, shutil, subprocess, sys, hashlib, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
if "mode: 'live'," not in src: sys.exit('source is not in live mode')
src, n = re.subn(r'<!-- SEO:START.*?<!-- SEO:END -->\n', '', src, flags=re.S)
if n != 1: sys.exit('SEO block not found')
tmp = os.path.join(ROOT, 'dist', '_pro_src.html'); os.makedirs(os.path.dirname(tmp), exist_ok=True)
open(tmp, 'w', encoding='utf-8', newline='\n').write(src)
try:
    subprocess.run([sys.executable, os.path.join(ROOT, 'build_offline.py'), '--src', tmp, '--edition', 'pro'], check=True)
finally:
    os.remove(tmp)
z = os.path.join(ROOT, 'dist', 'Prepline-Pro-Windows.zip')
html = zipfile.ZipFile(z).read('Prepline Pro.html').decode('utf-8')
if not re.search(r"var LICENSE_CONFIG = \{\n  mode: 'live',[^\n]*\n  edition: 'offline-pro',", html): sys.exit('zip check failed: not live mode + offline-pro edition')
branch = subprocess.run(['git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], capture_output=True, text=True).stdout.strip() or 'unknown'
stage = os.path.join(os.path.dirname(ROOT), 'prepline-pro-live-release', 'lemonsqueezy-upload', branch); os.makedirs(stage, exist_ok=True)
shutil.copy2(z, os.path.join(stage, 'Prepline-Pro-Windows.zip'))
h = hashlib.sha256(open(z, 'rb').read()).hexdigest()
open(os.path.join(stage, 'Prepline-Pro-Windows.zip.sha256'), 'w').write(f'{h}  Prepline-Pro-Windows.zip\n')
print('staged', os.path.join(stage, 'Prepline-Pro-Windows.zip'), h, 'TODO_LIVE placeholders left in zip:', html.count('TODO_LIVE'))
