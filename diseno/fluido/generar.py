"""Imágenes «fluidas» de Hera, generadas por código (sin fotos ni licencias).

  python3 generar.py        → escribe los .webp/.png en esta carpeta

Motivos:
  via-lactea-*  La Vía Láctea del mito de Hera: estela de luz lechosa sobre un cielo de atardecer
  tinta-*       Tinta en agua: nubes de color que se abren (deformación de dominio sobre ruido fractal)
  seda-*        Seda en movimiento: pliegues suaves iluminados
Todo con la paleta de la marca. Semillas fijas: el resultado es siempre el mismo.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

OUT = Path(__file__).parent

def hexrgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255

C = {k: hexrgb(v) for k, v in dict(
    ivory='#FAF8F5', rose='#F4E6E8', blush='#E9C7CF', peach='#F2B9A0', apricot='#E8946F', mauve='#8E6178',
    plum='#693D55', plumd='#2A1823', night='#1C1018', sage='#DCEBE4', saged='#56695A', cream='#FFF4EA').items()}

# ── Ruido ──────────────────────────────────────────────────────────────────────
class Noise:
    def __init__(self, seed):
        r = np.random.default_rng(seed)
        self.p = np.concatenate([r.permutation(256)] * 2)
        self.v = r.random(256)

    def value(self, x, y):
        xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
        xf, yf = x - xi, y - yi
        u, v = xf ** 3 * (xf * (xf * 6 - 15) + 10), yf ** 3 * (yf * (yf * 6 - 15) + 10)
        xi, yi = xi & 255, yi & 255
        p, val = self.p, self.v
        a = val[p[p[xi] + yi]]; b = val[p[p[xi + 1] + yi]]
        c = val[p[p[xi] + yi + 1]]; d = val[p[p[xi + 1] + yi + 1]]
        return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v

    def fbm(self, x, y, octaves=5, lac=2.0, gain=0.5):
        s, amp, norm = 0.0, 1.0, 0.0
        for i in range(octaves):
            ca, sa = np.cos(0.5 * i), np.sin(0.5 * i)
            s = s + amp * self.value((x * ca - y * sa) * lac ** i + i * 17.3, (x * sa + y * ca) * lac ** i - i * 9.1)
            norm += amp; amp *= gain
        return s / norm

def grid(w, h, scale):
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    return xs / w * scale * (w / h), ys / h * scale, xs / w, ys / h

def ramp(t, stops):
    """t en [0,1] → color interpolando entre [(pos, rgb), …]"""
    t = np.clip(t, 0, 1)[..., None]
    out = np.zeros(t.shape[:-1] + (3,))
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = ((t >= p0) & (t <= p1)).astype(float)
        k = np.clip((t - p0) / max(p1 - p0, 1e-6), 0, 1)
        k = k * k * (3 - 2 * k)
        out = out * (1 - m) + (c0 + (c1 - c0) * k) * m
    return out

def save(arr, name, blur=0, grain=0.012, seed=0):
    arr = np.clip(arr, 0, 1)
    if grain:  # grano fino de película: evita bandas en los degradados
        arr = np.clip(arr + np.random.default_rng(seed).normal(0, grain, arr.shape[:2])[..., None], 0, 1)
    img = Image.fromarray((arr * 255).astype(np.uint8))
    if blur: img = img.filter(ImageFilter.GaussianBlur(blur))
    img.save(OUT / f'{name}.webp', quality=86, method=6)
    img.save(OUT / f'{name}.png')
    print(name, img.size, round((OUT / f'{name}.webp').stat().st_size / 1024), 'KB')

# ── 1. Vía Láctea ─────────────────────────────────────────────────────────────
def via_lactea(name, w, h, seed, theme='dusk', curve=(0.08, 0.78, 0.55, 0.18, 1.02, 0.42)):
    n = Noise(seed)
    X, Y, u, v = grid(w, h, 3.0)
    # Cielo
    if theme == 'dusk':
        sky = ramp(np.clip(1.15 - 0.75 * v - 0.55 * u, 0, 1), [(0, C['apricot']), (0.22, C['mauve']), (0.55, C['plum']), (0.8, C['plumd']), (1, C['night'])])
        glow = np.exp(-(((u - 0.85) / 0.35) ** 2 + ((v - 0.95) / 0.35) ** 2))[..., None]
        sky = sky * (1 - 0.6 * glow) + C['apricot'] * 0.6 * glow
        milk = C['cream']
    else:  # amanecer claro
        sky = ramp(0.6 * v + 0.4 * u, [(0, C['ivory']), (0.45, C['rose']), (0.8, C['blush']), (1, C['peach'])])
        milk = C['plum']
    # Estela: distancia a una curva cuadrática de Bézier
    x0, y0, cx, cy, x1, y1 = curve
    t = np.linspace(0, 1, 400)
    bx = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1
    by = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1
    asp = w / h
    warp = (n.fbm(X * 0.8, Y * 0.8, 4) - 0.5) * 0.12
    d = np.full((h, w), 9.0)
    for i in range(0, 400, 4):
        d = np.minimum(d, np.hypot((u - bx[i]) * asp, (v + warp - by[i])))
    width = 0.11 + 0.05 * n.fbm(X * 0.5 + 3, Y * 0.5, 3)
    band = np.exp(-(d / width) ** 2)
    core = np.exp(-(d / (width * 0.35)) ** 2)
    clouds = n.fbm(X * 2.2, Y * 2.2, 6)
    dust = np.clip((n.fbm(X * 3.5 + 11, Y * 3.5 - 4, 5) - 0.52) * 4, 0, 1)  # franjas oscuras de polvo
    light = band * (0.25 + 1.0 * clouds ** 2.0) + 0.8 * core * clouds ** 1.2
    light = light * (1 - 0.7 * dust * band)
    light = np.clip(light, 0, 1.3)
    # Estrellas: más densas cerca de la estela
    r = np.random.default_rng(seed + 1)
    stars = np.zeros((h, w))
    k = int(w * h / 350)
    sx, sy = r.integers(0, w, k), r.integers(0, h, k)
    keep = r.random(k) < 0.15 + 0.85 * band[sy, sx]
    stars[sy[keep], sx[keep]] = r.random(keep.sum()) ** 3
    star_img = Image.fromarray((np.clip(stars, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    stars = np.asarray(star_img, float) / 255 * 3.0
    # Gotas que caen (en el mito, se vuelven lirios): unas pocas luces suaves bajo la estela
    drops = np.zeros((h, w))
    for i in range(7):
        ti = r.uniform(0.25, 0.8)
        px = (1 - ti) ** 2 * x0 + 2 * (1 - ti) * ti * cx + ti ** 2 * x1
        py = (1 - ti) ** 2 * y0 + 2 * (1 - ti) * ti * cy + ti ** 2 * y1 + r.uniform(0.08, 0.35)
        rad = r.uniform(0.004, 0.012)
        drops += np.exp(-(((u - px) * asp) ** 2 + (v - py) ** 2) / rad ** 2) * r.uniform(0.4, 0.9)
    total = np.clip(light * 0.85 + stars + drops * 0.8, 0, 1.4)[..., None]
    if theme == 'dusk':
        img = sky + (milk - sky) * np.clip(total, 0, 1) + 0.15 * np.clip(total - 1, 0, 1)
        img = img * 0.94 + 0.06 * (C['peach'] * band[..., None])  # halo cálido
    else:
        img = sky + (milk - sky) * np.clip(total * 0.75, 0, 1)
    save(img, name, blur=0.6, seed=seed)

# ── 2. Tinta en agua ──────────────────────────────────────────────────────────
def tinta(name, w, h, seed, stops, scale=1.1, swirl=2.6, blur=7):
    n = Noise(seed)
    X, Y, u, v = grid(w, h, scale)
    qx = n.fbm(X, Y, 5); qy = n.fbm(X + 5.2, Y + 1.3, 5)
    rx = n.fbm(X + swirl * qx + 1.7, Y + swirl * qy + 9.2, 4)
    ry = n.fbm(X + swirl * qx + 8.3, Y + swirl * qy + 2.8, 4)
    f = n.fbm(X + swirl * rx, Y + swirl * ry, 4)
    t = (f - f.min()) / (f.max() - f.min())
    t = 0.75 * t + 0.25 * np.clip(np.hypot(qx - 0.5, ry - 0.5) * 2.2, 0, 1)
    save(ramp(t, stops), name, blur=blur, seed=seed)

# ── 3. Seda ───────────────────────────────────────────────────────────────────
def seda(name, w, h, seed, stops, angle=0.55, freq=7.0):
    n = Noise(seed)
    X, Y, u, v = grid(w, h, 1.0)
    asp = w / h
    warp = n.fbm(X * 0.9, Y * 0.9, 2) - 0.5
    warp2 = n.fbm(X * 0.5 + 7, Y * 0.5 - 3, 2) - 0.5
    ph = (u * asp * np.cos(angle) + v * np.sin(angle)) * freq + warp * 6.0 + np.sin(v * 3.0 + warp2 * 4) * 1.2
    hgt = np.sin(ph) + 0.35 * np.sin(ph * 2.1 + warp2 * 3)
    gy, gx = np.gradient(hgt)
    k = min(w, h) * 0.06
    nx, ny, nz = -gx * k, -gy * k, np.ones_like(gx)
    ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    L = np.array([-0.45, -0.55, 0.7]); L /= np.linalg.norm(L)
    diff = np.clip((nx * L[0] + ny * L[1] + nz * L[2]) / ln, 0, 1)
    spec = np.clip(diff, 0, 1) ** 18
    t = np.clip(0.1 + 0.9 * diff ** 1.6 + 0.15 * (u - 0.5), 0, 1)
    img = ramp(t, stops) + 0.3 * spec[..., None] * C['cream']
    save(img, name, blur=2.5, seed=seed)


if __name__ == '__main__':
    W, H = 1800, 900
    via_lactea('via-lactea-atardecer', W, H, 7, 'dusk')
    via_lactea('via-lactea-alba', W, H, 7, 'light')
    warm = [(0, C['ivory']), (0.3, C['rose']), (0.55, C['peach']), (0.78, C['mauve']), (1, C['plum'])]
    ciruela = [(0, C['plumd']), (0.35, C['plum']), (0.62, C['mauve']), (0.85, C['peach']), (1, C['cream'])]
    salvia = [(0, C['ivory']), (0.35, C['sage']), (0.6, C['blush']), (0.82, C['peach']), (1, C['mauve'])]
    tinta('tinta-calida', 900, 600, 3, warm)
    tinta('tinta-ciruela', 900, 600, 21, ciruela)
    tinta('tinta-salvia', 900, 600, 42, salvia)
    seda('seda-rosa', 1600, 900, 5, [(0, C['plum']), (0.35, C['mauve']), (0.65, C['blush']), (1, C['rose'])])
    seda('seda-melocoton', 1600, 900, 11, [(0, C['mauve']), (0.3, C['apricot']), (0.6, C['peach']), (0.85, C['rose']), (1, C['cream'])], angle=0.9, freq=5.0)
