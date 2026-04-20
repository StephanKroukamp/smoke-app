"""Generate app icons (PNG) for Smoke Break.

Outputs:
  public/icons/icon-192.png
  public/icons/icon-512.png
  public/icons/icon-maskable-512.png
  public/icons/favicon.png (64x64, transparent)

Design: dark gradient backdrop with a neon ember flame and wisps of smoke.
Maskable-safe: all content fits inside the center 80% safe zone.
"""
from __future__ import annotations

import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def vertical_gradient(w: int, h: int, top: tuple, bot: tuple) -> Image.Image:
    img = Image.new("RGB", (w, h), top)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = lerp(top, bot, t)
        for x in range(w):
            px[x, y] = c
    return img


def radial_glow(size: int, cx: float, cy: float, radius: float, color: tuple, alpha: int) -> Image.Image:
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = glow.load()
    r2 = radius * radius
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            d2 = dx * dx + dy * dy
            if d2 >= r2:
                continue
            t = 1 - math.sqrt(d2) / radius
            t = t * t
            a = int(alpha * t)
            if a > 0:
                px[x, y] = (color[0], color[1], color[2], a)
    return glow


def _rotate(pts, cx, cy, angle_deg):
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    return [((x - cx) * ca - (y - cy) * sa + cx, (x - cx) * sa + (y - cy) * ca + cy) for x, y in pts]


def rounded_rect_path(x0, y0, x1, y1, radius, steps=16):
    pts = []
    corners = [
        (x1 - radius, y0 + radius, -90, 0),
        (x1 - radius, y1 - radius, 0, 90),
        (x0 + radius, y1 - radius, 90, 180),
        (x0 + radius, y0 + radius, 180, 270),
    ]
    for cx, cy, a0, a1 in corners:
        for i in range(steps + 1):
            t = i / steps
            ang = math.radians(a0 + (a1 - a0) * t)
            pts.append((cx + radius * math.cos(ang), cy + radius * math.sin(ang)))
    return pts


def _arc(cx: float, cy: float, r: float, a0_deg: float, a1_deg: float, steps: int) -> list[tuple[float, float]]:
    pts = []
    for i in range(steps + 1):
        t = i / steps
        a = math.radians(a0_deg + (a1_deg - a0_deg) * t)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def _pod_silhouette(cx: float, w: float, top: float, bot: float, neck_h: float, neck_w: float, corner: float, steps: int = 30) -> list[tuple[float, float]]:
    """Unified pod-vape outline traced clockwise from the top-left of the mouthpiece."""
    x_mp_l = cx - neck_w / 2
    x_mp_r = cx + neck_w / 2
    x_body_l = cx - w / 2
    x_body_r = cx + w / 2

    mp_r = min(neck_w * 0.32, neck_h * 0.6)
    neck_base_y = top + neck_h
    shoulder_end_y = neck_base_y + (w - neck_w) * 0.45

    pts = []
    # Top-left mouthpiece corner (arc 180 -> 270)
    pts += _arc(x_mp_l + mp_r, top + mp_r, mp_r, 180, 270, steps // 4)
    # Top-right mouthpiece corner (arc 270 -> 360)
    pts += _arc(x_mp_r - mp_r, top + mp_r, mp_r, 270, 360, steps // 4)
    # Right neck down to neck_base
    pts.append((x_mp_r, neck_base_y))
    # Right shoulder curve from mouthpiece to body width
    for i in range(1, steps + 1):
        t = i / steps
        y = neck_base_y + (shoulder_end_y - neck_base_y) * t
        curve = (1 - math.cos(t * math.pi)) / 2
        x = x_mp_r + (x_body_r - x_mp_r) * curve
        pts.append((x, y))
    # Right body side down to bottom corner start
    pts.append((x_body_r, bot - corner))
    # Bottom-right corner (0 -> 90)
    pts += _arc(x_body_r - corner, bot - corner, corner, 0, 90, steps // 4)
    # Bottom edge across
    pts.append((x_body_l + corner, bot))
    # Bottom-left corner (90 -> 180)
    pts += _arc(x_body_l + corner, bot - corner, corner, 90, 180, steps // 4)
    # Left body side up to shoulder start
    pts.append((x_body_l, shoulder_end_y))
    # Left shoulder curve back to mouthpiece
    for i in range(1, steps + 1):
        t = i / steps
        y = shoulder_end_y + (neck_base_y - shoulder_end_y) * t
        curve = (1 - math.cos(t * math.pi)) / 2
        x = x_body_l + (x_mp_l - x_body_l) * curve
        pts.append((x, y))
    # Left neck up to the top-left mouthpiece arc start
    pts.append((x_mp_l, top + mp_r))
    return pts


def draw_vape(size: int) -> Image.Image:
    """Draw a modern sleek pod vape — unified body with integrated mouthpiece."""
    cx = size / 2
    tilt = -8

    body_w = size * 0.32
    neck_w = body_w * 0.55
    body_top = size * 0.30
    body_bot = size * 0.90
    neck_h = size * 0.07
    corner = body_w * 0.28

    outline = _pod_silhouette(cx, body_w, body_top, body_bot, neck_h, neck_w, corner)
    outline_r = _rotate(outline, cx, size / 2, tilt)

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    tip_glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(tip_glow).ellipse(
        [cx - size * 0.35, body_bot - size * 0.15, cx + size * 0.35, body_bot + size * 0.20],
        fill=(255, 100, 30, 170),
    )
    tip_glow = tip_glow.filter(ImageFilter.GaussianBlur(size * 0.06))
    img = Image.alpha_composite(img, tip_glow)

    shadow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sh_pts = [(x, y + size * 0.015) for x, y in outline_r]
    ImageDraw.Draw(shadow_layer).polygon(sh_pts, fill=(0, 0, 0, 200))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(size * 0.02))
    img = Image.alpha_composite(img, shadow_layer)

    body_mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(body_mask).polygon(outline_r, fill=255)

    grad = Image.new("RGB", (size, size), (38, 32, 52))
    gpx = grad.load()
    for y in range(size):
        t = y / max(1, size - 1)
        top_c = (60, 52, 82)
        bot_c = (20, 16, 30)
        c = lerp(top_c, bot_c, t)
        for x in range(size):
            gpx[x, y] = c
    body = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    body.paste(grad, (0, 0), body_mask)
    img = Image.alpha_composite(img, body)

    hl_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hl_pts = rounded_rect_path(
        cx - body_w * 0.30, body_top + neck_h + size * 0.05,
        cx - body_w * 0.20, body_bot - body_w * 0.25,
        body_w * 0.05,
    )
    hl_pts_r = _rotate(hl_pts, cx, size / 2, tilt)
    ImageDraw.Draw(hl_layer).polygon(hl_pts_r, fill=(255, 255, 255, 70))
    hl_layer = hl_layer.filter(ImageFilter.GaussianBlur(size * 0.010))
    masked_hl = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    masked_hl.paste(hl_layer, (0, 0), body_mask)
    img = Image.alpha_composite(img, masked_hl)

    rim_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(rim_layer).polygon(outline_r, outline=(255, 255, 255, 55), width=max(1, int(size * 0.004)))
    img = Image.alpha_composite(img, rim_layer)

    hole_w = neck_w * 0.55
    hole_x0 = cx - hole_w / 2
    hole_x1 = cx + hole_w / 2
    hole_y = body_top + size * 0.012
    hole_pts = rounded_rect_path(hole_x0, hole_y, hole_x1, hole_y + size * 0.012, size * 0.004)
    hole_pts_r = _rotate(hole_pts, cx, size / 2, tilt)
    hole_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(hole_layer).polygon(hole_pts_r, fill=(6, 4, 12, 255))
    img = Image.alpha_composite(img, hole_layer)

    band_y = body_top + (body_bot - body_top) * 0.55
    band_pts = rounded_rect_path(
        cx - body_w * 0.45, band_y - size * 0.006,
        cx + body_w * 0.45, band_y + size * 0.006,
        size * 0.003,
    )
    band_pts_r = _rotate(band_pts, cx, size / 2, tilt)
    band_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(band_layer).polygon(band_pts_r, fill=(255, 160, 70, 230))
    band_masked = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    band_masked.paste(band_layer, (0, 0), body_mask)
    img = Image.alpha_composite(img, band_masked)

    led_x_orig = cx
    led_y_orig = body_top + (body_bot - body_top) * 0.38
    (led_x, led_y), = _rotate([(led_x_orig, led_y_orig)], cx, size / 2, tilt)

    led_glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(led_glow_layer).ellipse(
        [led_x - size * 0.04, led_y - size * 0.04, led_x + size * 0.04, led_y + size * 0.04],
        fill=(255, 130, 50, 230),
    )
    led_glow_layer = led_glow_layer.filter(ImageFilter.GaussianBlur(size * 0.012))
    img = Image.alpha_composite(img, led_glow_layer)

    led_core_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(led_core_layer).ellipse(
        [led_x - size * 0.015, led_y - size * 0.015, led_x + size * 0.015, led_y + size * 0.015],
        fill=(255, 245, 210, 255),
    )
    img = Image.alpha_composite(img, led_core_layer)

    return img


def draw_vapor_cloud(size: int, cx: float, cy: float, width: float, height: float, alpha: int) -> Image.Image:
    """Big soft billowing vapor cloud above the mouthpiece."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Cluster of overlapping soft circles forming a cloud
    puffs = [
        (0.00, 0.60, 0.35),
        (-0.35, 0.55, 0.30),
        (0.35, 0.55, 0.30),
        (-0.60, 0.40, 0.25),
        (0.60, 0.40, 0.25),
        (-0.20, 0.30, 0.28),
        (0.20, 0.30, 0.28),
        (0.00, 0.20, 0.25),
        (-0.45, 0.15, 0.20),
        (0.45, 0.15, 0.20),
        (0.00, 0.00, 0.18),
    ]
    for rx, ry, rsz in puffs:
        x = cx + rx * width
        y = cy - ry * height  # negative because higher y goes up visually
        r = rsz * min(width, height)
        a = int(alpha * (0.6 + 0.4 * (1 - ry)))
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(235, 232, 245, a))
    img = img.filter(ImageFilter.GaussianBlur(size * 0.022))
    return img


def draw_smoke_wisp(size: int, cx: float, y0: float, sway: float, height: float, width: float, alpha: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    steps = 40
    for i in range(steps + 1):
        t = i / steps
        y = y0 - height * t
        x = cx + math.sin(t * math.pi * 1.7) * sway * (0.4 + 0.6 * t)
        r = width * (0.7 + 0.8 * math.sin(t * math.pi * 0.9))
        fade = (1 - t ** 1.8) * (1 - (1 - t) ** 6)
        a = int(alpha * fade)
        if a <= 0:
            continue
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(235, 230, 245, a))
    img = img.filter(ImageFilter.GaussianBlur(size * 0.010))
    return img


def draw_spark(size: int, cx: float, cy: float, radius: float, color: tuple, alpha: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(*color, alpha))
    return img.filter(ImageFilter.GaussianBlur(radius * 0.4))


def _paint_backdrop(size: int) -> Image.Image:
    bg = vertical_gradient(size, size, (18, 10, 28), (42, 8, 20)).convert("RGBA")
    warm = radial_glow(size, size * 0.5, size * 0.68, size * 0.55, (255, 110, 30), 160)
    violet = radial_glow(size, size * 0.28, size * 0.28, size * 0.38, (180, 60, 180), 80)
    bg = Image.alpha_composite(bg, warm)
    bg = Image.alpha_composite(bg, violet)
    return bg


def _paint_content(canvas: Image.Image, size: int, off: tuple[int, int]) -> None:
    vapor = draw_vapor_cloud(
        size, cx=size * 0.50, cy=size * 0.28,
        width=size * 0.58, height=size * 0.42, alpha=180,
    )
    canvas.alpha_composite(vapor, off)

    vape = draw_vape(size)
    canvas.alpha_composite(vape, off)

    # A subtle light vapor puff directly above the mouthpiece
    trail = draw_vapor_cloud(
        size, cx=size * 0.49, cy=size * 0.32,
        width=size * 0.22, height=size * 0.18, alpha=140,
    )
    canvas.alpha_composite(trail, off)


def build_icon(size: int) -> Image.Image:
    bg = _paint_backdrop(size)
    _paint_content(bg, size, (0, 0))

    r = int(size * 0.22)
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rounded.paste(bg, (0, 0), mask)
    return rounded


def build_maskable(size: int) -> Image.Image:
    bg = _paint_backdrop(size)
    safe = int(size * 0.68)
    off = (size - safe) // 2
    content_canvas = Image.new("RGBA", (safe, safe), (0, 0, 0, 0))
    _paint_content(content_canvas, safe, (0, 0))
    bg.alpha_composite(content_canvas, (off, off))
    return bg


def build_favicon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    vape = draw_vape(size)
    img.alpha_composite(vape, (0, 0))
    return img


for s in (192, 512):
    path = OUT / f"icon-{s}.png"
    build_icon(s).save(path, "PNG")
    print("wrote", path)

mpath = OUT / "icon-maskable-512.png"
build_maskable(512).save(mpath, "PNG")
print("wrote", mpath)

fpath = OUT / "favicon.png"
build_favicon(128).save(fpath, "PNG")
print("wrote", fpath)
