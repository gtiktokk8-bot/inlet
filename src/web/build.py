"""Build the standalone Inlet web app: web/dist/index.html (+ icon, manifest).
Usage: python3 build.py [CLIENT_ID]"""
import sys, os, re, json
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
cid = sys.argv[1] if len(sys.argv) > 1 else ""
app = open(os.path.join(ROOT, "inlet-gmail.html"), encoding="utf-8").read()
app = re.sub(r"^\s*<title>.*?</title>", "", app, count=1, flags=re.S)
acc = open(os.path.join(HERE, "accounts.js"), encoding="utf-8").read()

head = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Inlet</title>
<meta name="description" content="Email that feels like texting.">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Inlet">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="icon" href="/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<style>html,body{{margin:0;height:100%}}body{{padding-top:env(safe-area-inset-top)}}</style>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>window.INLET_CLIENT_ID={json.dumps(cid)};</script>
<script>{acc}</script>
</head>
<body>
"""
dist = os.path.join(HERE, "dist"); os.makedirs(dist, exist_ok=True)
open(os.path.join(dist, "index.html"), "w", encoding="utf-8").write(head + app + "\n</body>\n</html>\n")

# icon: blue gradient rounded square with a white chat bubble
for size in (180, 512):
    s = size * 4
    im = Image.new("RGB", (s, s))
    d = ImageDraw.Draw(im)
    for y in range(s):
        t = y / s
        d.line([(0, y), (s, y)], fill=(int(59 + (0 - 59) * t), int(155 + (98 - 155) * t), int(255 + (214 - 255) * t)))
    cx, cy = s / 2, s * 0.47
    w, h = s * 0.58, s * 0.46
    d.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill="white")
    d.polygon([(cx - w * 0.30, cy + h * 0.30), (cx - w * 0.40, cy + h * 0.62), (cx - w * 0.05, cy + h * 0.42)], fill="white")
    im = im.resize((size, size), Image.LANCZOS)
    im.save(os.path.join(dist, f"icon-{size}.png"))

json.dump({"name": "Inlet", "short_name": "Inlet", "start_url": "/", "display": "standalone",
           "background_color": "#ffffff", "theme_color": "#0068D6",
           "icons": [{"src": "/icon-180.png", "sizes": "180x180", "type": "image/png"},
                     {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}]},
          open(os.path.join(dist, "manifest.webmanifest"), "w"))
import shutil
shutil.rmtree(os.path.join(dist, "api"), ignore_errors=True)
shutil.copytree(os.path.join(HERE, "api"), os.path.join(dist, "api"))
open(os.path.join(dist, "vercel.json"), "w").write(json.dumps({"functions": {"api/ai.js": {"maxDuration": 60}}, "headers": [{"source": "/(.*)", "headers": [
    {"key": "X-Content-Type-Options", "value": "nosniff"},
    {"key": "Referrer-Policy", "value": "no-referrer"},
    {"key": "X-Frame-Options", "value": "DENY"},
    {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()"}]}]}))
print("built", os.path.join(dist, "index.html"), "client id:", cid or "(none yet)")
