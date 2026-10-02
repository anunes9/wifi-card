#!/usr/bin/env python3
"""Inline css/js/fonts/images into ONE self-contained file: dist/index.html
Usage: python3 build.py
"""
import re, base64, pathlib

ROOT = pathlib.Path(__file__).parent
MIME = {'.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png'}

def data_uri(rel, base):
    p = (base / rel).resolve()
    return f"data:{MIME[p.suffix]};base64," + base64.b64encode(p.read_bytes()).decode()

def inline_css(path):
    css = path.read_text(encoding='utf-8')
    return re.sub(r"url\('(\.\./assets/[^']+)'\)",
                  lambda m: f"url('{data_uri(m.group(1), path.parent)}')", css)

def inline_assets(text):
    return re.sub(r"assets/img/[\w.-]+\.png", lambda m: data_uri(m.group(0), ROOT), text)

html = (ROOT / 'index.html').read_text(encoding='utf-8')

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">',
              lambda m: '<style>\n' + inline_css(ROOT / m.group(1)) + '</style>', html)
html = re.sub(r'<script src="([^"]+)"></script>',
              lambda m: '<script>\n' + inline_assets((ROOT / m.group(1)).read_text(encoding='utf-8')) + '</script>', html)
html = inline_assets(html)          # the masthead <img>

out = ROOT / 'dist' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8')
print(f'wrote {out} ({out.stat().st_size/1024:.0f} KB)')
