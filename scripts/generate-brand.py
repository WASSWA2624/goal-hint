"""Generate original SVG brand geometry, outlined type and portable exports.

Python owns geometry, documents and files. The existing Sharp installation is
used only as an SVG-to-PNG codec through the application's private pipe adapter.
"""
import html
import json
import math
from pathlib import Path
import struct

from lib.runtime import ROOT, main_guard, service


def fmt(value, digits=3):
    return f"{value:.{digits}f}".rstrip("0").rstrip(".") if value else "0"


def svg(width, height, title, body, description=""):
    desc = f"<desc>{html.escape(description)}</desc>" if description else ""
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title, quote=True)}"><title>{html.escape(title)}</title>{desc}{body}</svg>\n'


def raw_svg(source):
    return source.split("?>", 1)[-1].lstrip()


def sub(a, b):
    return [x - y for x, y in zip(a, b)]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def norm(value):
    length = math.hypot(*value)
    return [item / length for item in value]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def lerp(a, b, ratio):
    return [x + (y - x) * ratio for x, y in zip(a, b)]


def ball_geometry():
    phi = (1 + math.sqrt(5)) / 2
    ico = list(map(norm, [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]]))
    edge = min(math.hypot(*sub(value, ico[0])) for value in ico[1:])
    neighbours = [[other for other in ico if other is not value and abs(math.hypot(*sub(value, other)) - edge) < 1e-6] for value in ico]
    z = ico[0]
    y = norm(sub([item * dot(neighbours[0][0], z) for item in z], neighbours[0][0]))
    x = cross(y, z)
    view = lambda value: [dot(value, x), dot(value, y), dot(value, z)]

    def angle_around(point, axis):
        k = norm(axis)
        u = norm(cross([0, 0, 1] if abs(k[2]) < 0.9 else [0, 1, 0], k))
        w = cross(k, u)
        d = sub(point, axis)
        return math.atan2(dot(d, w), dot(d, u))

    pentagons = [sorted([view(lerp(value, other, 1 / 3)) for other in neighbours[i]], key=lambda point: angle_around(point, view(value))) for i, value in enumerate(ico)]
    seams = [[view(lerp(z, other, 1 / 3)), view(lerp(z, other, 2 / 3))] for other in neighbours[0]]
    return pentagons, seams


def sphere_line(a, b, steps=8):
    return [norm(lerp(a, b, i / steps)) for i in range(steps + 1)]


def front_polygon(points):
    output = []
    for i, point in enumerate(points):
        other = points[(i + 1) % len(points)]
        if point[2] >= 0:
            output.append(point)
        if (point[2] >= 0) != (other[2] >= 0):
            output.append(lerp(point, other, point[2] / (point[2] - other[2])))
    return output


class Brand:
    def __init__(self, root=ROOT):
        self.root = Path(root)
        self.brand_dir, self.output_dir = self.root / "assets/brand", self.root / "public/brand"
        self.tokens = json.loads((self.brand_dir / "brand-tokens.json").read_text(encoding="utf-8"))
        self.type = json.loads((self.brand_dir / "source/type-outlines.json").read_text(encoding="utf-8"))
        self.colors = self.tokens["colors"]
        self.pentagons, self.seams = ball_geometry()
        self.mask_count = 0
        self.logo_width = math.ceil(133.4 + self.type["wordmark"]["advance"] * 93 / self.type["wordmark"]["unitsPerEm"] + 8)
        self.baseline = 64 + sum(self.type["wordmark"]["bounds"][index] for index in (3, 1)) * 93 / self.type["wordmark"]["unitsPerEm"] / 2
        self.exports, self.renders = [], []

    def g_path(self, tip):
        angle, outer, inner, cx, cy, bar = math.radians(-42), 74, 52, 80, 80, 21
        ox, oy = fmt(cx + outer * math.cos(angle)), fmt(cy + outer * math.sin(angle))
        ix, iy = fmt(cx + inner * math.cos(angle)), fmt(cy + inner * math.sin(angle))
        return f"M{ox} {oy}A{outer} {outer} 0 1 0 {cx + outer} {cy}H{tip}V{cy + bar}H{fmt(cx + math.sqrt(inner**2 - bar**2))}A{inner} {inner} 0 1 1 {ix} {iy}Z"

    def project_ball(self, inset, hidden):
        scale, angle = 46 - inset, math.radians(-36)
        cos, sin = math.cos(angle), math.sin(angle)
        place = lambda point: [80 + (point[0] * cos - point[1] * sin) * scale, 80 + (point[0] * sin + point[1] * cos) * scale]
        project = lambda point: " ".join(fmt(item, 2) for item in place(point))
        panels = []
        for ring in self.pentagons:
            points = front_polygon([point for i, item in enumerate(ring) for point in sphere_line(item, ring[(i + 1) % len(ring)])[:-1]])
            if len(points) > 2:
                panels.append("M" + "L".join(map(project, points)) + "Z")
        seams = ["M" + "L".join(map(project, sphere_line(a, b))) for a, b in self.seams if not hidden(*place(sphere_line(b, b, 1)[0]))]
        return "".join(panels), "".join(seams)

    def mark(self, accent=None, ink=None, micro=False, ball_background=None):
        c = self.colors
        accent, ink = accent or c["teal"], ink or c["navy"]
        self.mask_count += 1
        identifier = f"goal-hint-ball-{self.mask_count}"
        tip, gap = (110, 5.5) if micro else (106, 6)
        hidden = lambda x, y: x >= tip - gap and 80 - gap <= y <= 101 + gap
        knockout = f'<rect x="{fmt(tip - gap)}" y="{fmt(80 - gap)}" width="{fmt(160 - tip + gap)}" height="{fmt(21 + gap * 2)}" fill="black"/>'
        if ink == c["white"]:
            rim = 0 if micro else 4.6
            panels, seams = self.project_ball(rim, hidden)
            body = f'<circle cx="80" cy="80" r="46" fill="white"/><path d="{panels}" fill="black"/>'
            if not micro:
                body += f'<path d="{seams}" fill="none" stroke="black" stroke-width="3"/><circle cx="80" cy="80" r="{fmt(46 - rim / 2)}" fill="none" stroke="white" stroke-width="{rim}"/>'
        else:
            panels, seams = self.project_ball(2.3, hidden)
            body = f'<circle cx="80" cy="80" r="43.7" fill="none" stroke="white" stroke-width="4.6"/><path d="{panels}" fill="white"/>'
            if not micro:
                body += f'<path d="{seams}" fill="none" stroke="white" stroke-width="3"/>'
        background = ""
        if ball_background:
            background = f'<mask id="{identifier}-background" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="160"><circle cx="80" cy="80" r="43.7" fill="white"/>{knockout}</mask><rect x="34" y="34" width="92" height="92" fill="{ball_background}" mask="url(#{identifier}-background)"/>'
        return f'<path d="{self.g_path(tip)}" fill="{accent}"/>{background}<mask id="{identifier}" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="160">{body}{knockout}</mask><rect x="34" y="34" width="92" height="92" fill="{ink}" mask="url(#{identifier})"/>'

    def favicon(self):
        # An opaque white football and navy panels stay visible on either tab theme.
        c = self.colors
        return svg(160, 160, "Goal Hint", self.mark(c["tealOnDark"], c["navy"], micro=True, ball_background=c["white"]))

    def text_path(self, key, x, baseline, size, color):
        item = self.type[key]
        scale = size / item["unitsPerEm"]
        return f'<g fill="{color}" transform="translate({x} {baseline}) scale({scale} {-scale})"><path d="{item["path"]}"/></g>'

    def logo_body(self, accent, ink):
        return '<g transform="translate(8 8) scale(.7)">' + self.mark(accent, ink) + '</g>' + self.text_path("wordmark", 133.4, self.baseline, 93, ink)

    def logo_at(self, x, y, width, accent, ink):
        return f'<g transform="translate({x} {y}) scale({width / self.logo_width})">{self.logo_body(accent, ink)}</g>'

    def icon_body(self, size):
        c = self.colors
        return f'<rect width="{size}" height="{size}" fill="{c["navy"]}"/><g transform="translate({size * .14} {size * .14}) scale({size * .72 / 160})">{self.mark(c["tealOnDark"], c["white"])}</g>'

    def save_svg(self, name, source, scale=0):
        target = self.output_dir / (name + ".svg")
        target.write_text(source, encoding="utf-8", newline="\n")
        self.exports.append(target.name)
        if scale:
            import xml.etree.ElementTree as ET
            element = ET.fromstring(source)
            self.renders.append({"source": str(target), "target": str(target.with_suffix(".png")),
                                 "width": round(int(element.attrib["width"]) * scale), "height": round(int(element.attrib["height"]) * scale)})
            self.exports.append(name + ".png")

    def generate(self):
        c = self.colors
        self.output_dir.mkdir(parents=True, exist_ok=True)
        variants = [("primary", c["teal"], c["navy"]), ("inverse", c["tealOnDark"], c["white"]), ("monochrome", c["navy"], c["navy"]), ("monochrome-inverse", c["white"], c["white"])]
        logos = {}
        for name, accent, ink in variants:
            logos[name] = svg(self.logo_width, 128, "Goal Hint", self.logo_body(accent, ink), "A geometric G around a football beside the Goal Hint wordmark.")
            self.save_svg("goal-hint-logo-" + name, logos[name], 2)
            self.save_svg("goal-hint-mark-" + name, svg(160, 160, "Goal Hint mark", self.mark(accent, ink)), 4)
        # Keep the surrounding tab strip transparent and the football itself bright.
        favicon = self.favicon()
        self.save_svg("goal-hint-favicon", favicon)
        for size in (16, 32, 48):
            target = f"goal-hint-favicon-{size}.png"
            self.renders.append({"source": str(self.output_dir / "goal-hint-favicon.svg"), "target": str(self.output_dir / target), "width": size, "height": size})
            self.exports.append(target)
        for name, size in (("apple-touch-icon", 180), ("app-icon-192", 192), ("app-icon-512", 512), ("social-avatar", 512)):
            self.save_svg("goal-hint-" + name, svg(size, size, "Goal Hint", self.icon_body(size)), 1)
        og = f'<rect width="1200" height="630" fill="{c["navy"]}"/>' + self.logo_at(64, 45, 326, c["tealOnDark"], c["white"])
        og += f'<path d="M64 158 H1136" stroke="{c["white"]}" stroke-opacity=".2"/>' + self.text_path("headline1", 64, 287, 62, c["white"]) + self.text_path("headline2", 64, 369, 62, c["tealOnDark"])
        og += '<g transform="translate(882 220) scale(1.46)">' + self.mark(c["tealOnDark"], c["white"]) + '</g>' + self.text_path("descriptor", 64, 457, 22, c["white"]) + self.text_path("domain", 64, 566, 25, c["tealOnDark"])
        self.save_svg("goal-hint-open-graph", svg(1200, 630, "Goal Hint — Football predictions. Clearly explained.", og, "AI analysis, estimated probabilities and verified outcomes. goalhint.com."), 1)
        css_names = {"navy": "navy", "teal": "teal", "tealOnDark": "teal-on-dark", "paper": "paper", "white": "white", "muted": "text-muted", "border": "border"}
        css = "/* Generated from assets/brand/brand-tokens.json. */\n:root {\n" + "".join(f"  --gh-{css_names[key]}: {value};\n" for key, value in c.items())
        css += f"  --gh-font-family: {self.tokens['typography']['family']};\n  --gh-radius: {self.tokens['shape']['componentRadius']};\n}}\n"
        (self.output_dir / "goal-hint-brand-tokens.css").write_text(css, encoding="utf-8", newline="\n")
        (self.output_dir / "goal-hint-brand-tokens.json").write_text(json.dumps(self.tokens, indent=2) + "\n", encoding="utf-8", newline="\n")
        self.exports.extend(("goal-hint-brand-tokens.css", "goal-hint-brand-tokens.json"))
        self.write_preview(variants, logos, favicon, og)
        service("brand-raster", {"renders": self.renders}, timeout=120)
        self.write_ico()
        (self.brand_dir / "asset-manifest.json").write_text(json.dumps({"name": self.tokens["name"], "publicPath": "/brand/", "files": sorted(self.exports)}, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"Generated {len(self.exports)} public assets, a standalone HTML preview and the brand contact sheet.")

    def write_ico(self):
        buffers = [(size, (self.output_dir / f"goal-hint-favicon-{size}.png").read_bytes()) for size in (16, 32, 48)]
        offset, entries = 6 + len(buffers) * 16, []
        for size, buffer in buffers:
            entries.append(struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(buffer), offset))
            offset += len(buffer)
        (self.output_dir / "goal-hint-favicon.ico").write_bytes(struct.pack("<HHH", 0, 1, len(buffers)) + b"".join(entries) + b"".join(buffer for _, buffer in buffers))
        self.exports.append("goal-hint-favicon.ico")

    def write_preview(self, variants, logos, favicon, og):
        c = self.colors
        labels = {"navy": "Navy", "teal": "Teal", "tealOnDark": "Teal on dark", "paper": "Paper", "white": "White", "muted": "Muted text", "border": "Border"}
        figures = "".join(f'<figure class="{"dark" if "inverse" in name else ""}"><div class="art">{raw_svg(logos[name])}</div><figcaption>Horizontal logo / {name.replace("-", " ")}</figcaption></figure>' for name, _, _ in variants)
        palette = "".join(f'<li><span style="background:{color}"></span><strong>{labels[key]}</strong><code>{color}</code></li>' for key, color in c.items())
        styles = f'*{{box-sizing:border-box}}body{{margin:0;background:{c["paper"]};color:{c["navy"]};font:16px/1.6 Arial,sans-serif}}main{{max-width:1240px;margin:auto;padding:40px 24px}}h1{{font-size:40px;line-height:1.15}}h2{{margin-top:40px;font-size:22px}}a{{color:{c["teal"]}}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}figure{{margin:0;background:white;border:1px solid {c["border"]}}}.art{{padding:32px;min-height:180px;display:flex;align-items:center}}.art svg,.social svg{{width:100%;height:auto}}.dark .art{{background:{c["navy"]}}}figcaption{{padding:12px 20px;border-top:1px solid {c["border"]};font-size:14px}}.symbols{{display:flex;gap:40px;align-items:center;flex-wrap:wrap;padding:24px;background:white}}.symbols svg{{width:120px;height:120px}}.symbols .favicon{{width:32px;height:32px}}.palette{{list-style:none;padding:0;display:grid;grid-template-columns:repeat(7,1fr);gap:12px}}.palette span{{display:block;height:64px;border:1px solid {c["border"]}}}.palette strong,.palette code{{display:block;font-size:13px;overflow-wrap:anywhere}}.notes{{padding:24px;background:white;border-left:4px solid {c["teal"]}}}@media(max-width:650px){{.grid{{grid-template-columns:1fr}}.art{{padding:20px;min-height:120px}}.palette{{grid-template-columns:repeat(3,1fr)}}h1{{font-size:32px}}}}'
        symbols = raw_svg(svg(160, 160, "Primary mark", self.mark())) + raw_svg(svg(160, 160, "Monochrome mark", self.mark(c["navy"], c["navy"]))) + raw_svg(favicon).replace('<svg ', '<svg class="favicon" ')
        preview = f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Goal Hint — Brand assets</title><style>{styles}</style></head><body><main><p>GOAL HINT / BRAND SYSTEM</p><h1>Football predictions.<br>Clearly explained.</h1><p>A solid football inside a heavy open geometric G, beside a bold Manrope wordmark. Deep navy establishes the reading surface; teal is the navigation and identity accent.</p><h2>Horizontal logos</h2><div class="grid">{figures}</div><h2>Full symbol and small-size favicon</h2><div class="symbols">{symbols}</div><h2>Shared palette</h2><ul class="palette">{palette}</ul><h2>Social preview</h2><div class="social">{raw_svg(svg(1200, 630, "Goal Hint social preview", og))}</div><h2>Use consistently</h2><div class="notes"><p>Use primary artwork on white or paper; inverse artwork on navy. Keep clear space equal to one quarter of the mark width. Use the micro favicon at 16–32 pixels. Do not stretch, recolor, add shadows or apply rounded containers.</p><p>The wordmark is Manrope, converted to paths. The source font and its SIL Open Font License are preserved. Label icon-only links accessibly.</p><p>See <a href="README.md">the asset guide</a> for files, metadata integration and regeneration. The existing raster logo is preserved unchanged under <code>reference/</code>.</p></div></main></body></html>\n'
        (self.brand_dir / "goal-hint-brand-preview.html").write_text(preview, encoding="utf-8", newline="\n")
        label = lambda text, x, y, size=22, color=c["muted"], weight=400: f'<text x="{x}" y="{y}" font-family="Arial, sans-serif" font-size="{size}" font-weight="{weight}" fill="{color}">{html.escape(text)}</text>'
        panel = lambda x, y, width, height, fill, body: f'<rect x="{x}" y="{y}" width="{width}" height="{height}" fill="{fill}"/>{body}'
        sheet = f'<rect width="1600" height="1480" fill="{c["paper"]}"/>' + label("GOAL HINT / BRAND SYSTEM", 64, 68, 20, c["teal"], 700) + label("A clear view of the match.", 64, 121, 40, c["navy"], 700)
        sheet += label("PRIMARY / NAVY + TEAL", 64, 180, 18) + label("INVERSE / DARK SURFACES", 836, 180, 18)
        sheet += panel(64, 204, 708, 230, c["white"], self.logo_at(112, 256, 612, c["teal"], c["navy"])) + panel(836, 204, 700, 230, c["navy"], self.logo_at(880, 256, 612, c["tealOnDark"], c["white"]))
        sheet += label("MONOCHROME", 64, 484, 18) + label("SYMBOL / FULL + SMALL SIZE", 836, 484, 18)
        sheet += panel(64, 506, 708, 180, c["white"], self.logo_at(128, 538, 580, c["navy"], c["navy"]))
        sheet += panel(836, 506, 700, 180, c["white"], '<g transform="translate(878 516)">' + self.mark() + '</g><g transform="translate(1088 516)">' + self.mark(c["navy"], c["navy"]) + '</g><g transform="translate(1324 540) scale(.68)">' + raw_svg(favicon) + '</g>')
        sheet += label("CORE PALETTE", 64, 736, 18)
        for i, key in enumerate(("navy", "teal", "tealOnDark", "paper", "white")):
            x = 64 + i * 296
            sheet += f'<rect x="{x}" y="758" width="288" height="72" fill="{c[key]}" stroke="{c["border"]}"/>' + label(labels[key].upper(), x, 858, 16) + label(c[key], x, 884, 20, c["navy"])
        sheet += label("SOCIAL / OPEN GRAPH 1200 × 630", 64, 952, 18) + '<g transform="translate(64 974) scale(.65)">' + og + '</g>' + label("APP ICON + SOCIAL AVATAR", 900, 952, 18) + '<g transform="translate(900 974)">' + self.icon_body(288) + '</g>'
        for y, text in ((1026, "Manrope / outlined wordmark"), (1066, "Square component corners"), (1106, "Original SVG geometry"), (1146, "Remote team logos stay remote")):
            sheet += label(text, 1220, y, 19, c["navy"])
        sheet += label("Use estimated probabilities, never guaranteed wins.", 900, 1320, 18) + label("Source of truth: assets/brand/brand-tokens.json + scripts/generate-brand.py", 64, 1432, 19)
        target = self.brand_dir / "goal-hint-brand-sheet.svg"
        target.write_text(svg(1600, 1480, "Goal Hint brand asset overview", sheet), encoding="utf-8", newline="\n")
        self.renders.append({"source": str(target), "target": str(target.with_suffix(".png"))})


if __name__ == "__main__":
    main_guard(lambda: Brand().generate(), "Brand generation failed; check Python, Node.js and the Sharp installation.")
