// fetus-core.js
// Motor de modelado del feto (campo de distancias + surface nets). Se ejecuta en un Worker.
// Basado en el prototipo compartido por Gonzalo. Modelo estilizado, no anatómico.
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function smin(a, b, k) { var h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }

function sdEll(px, py, pz, rx, ry, rz) {
  var ax = px / rx, ay = py / ry, az = pz / rz;
  var k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  var bx = px / (rx * rx), by = py / (ry * ry), bz = pz / (rz * rz);
  var k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return k0 * (k0 - 1) / k1;
}

function makeRoundCone(a, b, r1, r2) {
  var bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  var l2 = bax * bax + bay * bay + baz * baz;
  var rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return function (px, py, pz) {
    var pax = px - a[0], pay = py - a[1], paz = pz - a[2];
    var y = pax * bax + pay * bay + paz * baz;
    var z = y - l2;
    var xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
    var x2 = xx * xx + xy * xy + xz * xz;
    var y2 = y * y * l2, z2 = z * z * l2;
    var k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  };
}

function makeFetus(w) {
  var e = Math.exp(-(w - 8) / 10);
  var rh = 0.3 + 0.25 * e;
  var ry = (0.9 - 0.2 * e) / 2;
  var p = 0.72 + 0.5 * smooth(18, 40, w);
  var fat = smooth(24, 40, w);
  var rx = 0.3 * p, rz = 0.28 * p;
  var lf = 0.55 + 0.45 * (1 - e);
  var face = 0.45 + 0.55 * smooth(9, 18, w);
  var eyesOpen = w < 10 || w >= 26;

  var H = [0, ry * 0.85 + rh * 0.7, rh * 0.32];
  var flex = 0.32, cf = Math.cos(flex), sf = Math.sin(flex);
  function headToBody(v) {
    return [v[0] + H[0], v[1] * cf - v[2] * sf + H[1], v[1] * sf + v[2] * cf + H[2]];
  }

  var body = [], head = [], headSub = [], bounds = [];
  function ellB(c, r, k) {
    var R = Math.max(r[0], r[1], r[2]);
    body.push({ f: function (x, y, z) { return sdEll(x - c[0], y - c[1], z - c[2], r[0], r[1], r[2]); }, k: k, c: c, R: R });
    bounds.push([c, R]);
  }
  function coneB(a, b, r1, r2, k) {
    body.push({ f: makeRoundCone(a, b, r1, r2), k: k, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], R: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + Math.max(r1, r2) });
    bounds.push([a, r1]); bounds.push([b, r2]);
  }
  function ellH(c, r, k, list) {
    (list || head).push({ f: function (x, y, z) { return sdEll(x - c[0], y - c[1], z - c[2], r[0], r[1], r[2]); }, k: k, c: c, R: Math.max(r[0], r[1], r[2]) });
    if (!list) bounds.push([headToBody(c), Math.max(r[0], r[1], r[2])]);
  }
  function coneH(a, b, r1, r2, k) {
    head.push({ f: makeRoundCone(a, b, r1, r2), k: k, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], R: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + Math.max(r1, r2) });
    bounds.push([headToBody(a), r1]); bounds.push([headToBody(b), r2]);
  }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function towards(o, t, f) { return [o[0] + (t[0] - o[0]) * f, o[1] + (t[1] - o[1]) * f, o[2] + (t[2] - o[2]) * f]; }

  ellB([0, ry * 0.45, 0.01], [rx * 0.95, ry * 0.5, rz * 0.85], 0.1);
  ellB([0, -ry * 0.08, 0.05], [rx * 0.98, ry * 0.55, rz * 1.04], 0.12);
  ellB([0, -ry * 0.62, -0.05], [rx * 0.9, ry * 0.42, rz * 0.95], 0.12);
  ellB([-rx * 0.38, -ry * 0.72, -rz * 0.42], [rx * 0.45, rx * 0.45, rx * 0.42], 0.08);
  ellB([rx * 0.38, -ry * 0.72, -rz * 0.42], [rx * 0.45, rx * 0.45, rx * 0.42], 0.08);
  ellB([-rx * 0.75, ry * 0.7, 0], [rx * 0.34, rx * 0.32, rx * 0.34], 0.08);
  ellB([rx * 0.75, ry * 0.7, 0], [rx * 0.34, rx * 0.32, rx * 0.34], 0.08);
  coneB([0, ry * 0.8, 0], headToBody([0, -rh * 0.55, -rh * 0.15]), rx * 0.48, rx * 0.5, 0.1);

  var ra = 0.06 * p + 0.012;
  var hands = [];
  [-1, 1].forEach(function (s) {
    var S = [s * rx * 0.92, ry * 0.7, 0.02];
    var E = towards(S, [s * (rx + 0.16), ry * 0.05, rz * 0.8], lf);
    var target = s < 0 ? headToBody([-rh * 0.12, -rh * 1.0, rh * 0.85]) : [rx * 0.35, ry * 0.45, rz * 1.35];
    var Wr = towards(E, target, lf * 0.82);
    var dir = [target[0] - E[0], target[1] - E[1], target[2] - E[2]];
    var dl = Math.hypot(dir[0], dir[1], dir[2]); dir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
    var hl = ra * 2.2;
    var tip = add(Wr, [dir[0] * hl, dir[1] * hl, dir[2] * hl]);
    coneB(S, E, ra * 1.1, ra * 0.92, 0.06);
    coneB(E, Wr, ra * 0.88, ra * 0.62, 0.05);
    coneB(Wr, tip, ra * 0.72, ra * 0.62, 0.04);
    ellB(add(tip, [0, -ra * 0.25, ra * 0.1]), [ra * 0.75, ra * 0.55, ra * 0.6], 0.04);
    coneB(add(Wr, [s * ra * 0.5, 0, ra * 0.3]), add(Wr, [s * ra * 0.6 + dir[0] * hl * 0.7, dir[1] * hl * 0.7, ra * 0.5 + dir[2] * hl * 0.7]), ra * 0.32, ra * 0.26, 0.03);
    hands.push([Wr, tip]);
  });

  var rl = 0.085 * p + 0.015;
  var feet = [];
  [-1, 1].forEach(function (s) {
    var Hp = [s * rx * 0.55, -ry * 0.7, 0];
    var K = towards(Hp, [s * rx * 1.0, -ry * 0.0, rz * 1.6], lf);
    var A = towards(Hp, [s * (rx * 0.28 + 0.03), -ry * 0.85, rz * 1.45], lf);
    var fl = rl * 2.4;
    var toe = add(A, [-s * rl * 0.2, -fl * 0.2, fl]);
    coneB(Hp, K, rl * 1.2, rl * 0.85, 0.07);
    coneB(K, A, rl * 0.85, rl * 0.52, 0.05);
    ellB(add(K, [0, -rl * 0.3, -rl * 0.5]), [rl * 0.75, rl * 1.1, rl * 0.7], 0.05);
    coneB(add(A, [0, 0, -rl * 0.25]), toe, rl * 0.58, rl * 0.48, 0.04);
    ellB(add(toe, [0, rl * 0.05, -rl * 0.1]), [rl * 0.55, rl * 0.38, rl * 0.45], 0.03);
    feet.push([A, toe]);
  });

  ellH([0, -rh * 0.02, -rh * 0.08], [rh * 0.9, rh * 0.95, rh * 1.02], 0);
  ellH([0, -rh * 0.1, -rh * 0.35], [rh * 0.8, rh * 0.85, rh * 0.75], 0.1);
  ellH([0, -rh * 0.42, rh * 0.38], [rh * (0.6 + 0.06 * fat), rh * 0.5, rh * (0.5 + 0.04 * fat)], 0.12);
  var ck = rh * (0.22 + 0.09 * fat);
  ellH([-rh * 0.33, -rh * 0.48, rh * 0.55], [ck, ck * 0.9, ck], 0.08);
  ellH([rh * 0.33, -rh * 0.48, rh * 0.55], [ck, ck * 0.9, ck], 0.08);
  ellH([0, -rh * 0.78, rh * 0.62], [rh * 0.22 * face, rh * 0.16, rh * 0.2 * face], 0.08);
  ellH([0, -rh * 0.02, rh * 0.68], [rh * 0.55, rh * 0.18, rh * 0.25], 0.1);
  coneH([0, -rh * 0.2, rh * 0.9], [0, -rh * 0.38, rh * (0.94 + 0.08 * face)], rh * 0.06, rh * 0.1 * face, 0.05);
  ellH([-rh * 0.08, -rh * 0.4, rh * 0.94], [rh * 0.075 * face, rh * 0.06, rh * 0.06], 0.04);
  ellH([rh * 0.08, -rh * 0.4, rh * 0.94], [rh * 0.075 * face, rh * 0.06, rh * 0.06], 0.04);
  var lipU = [0, -rh * 0.55, rh * (0.9 + 0.06 * face)], lipL = [0, -rh * 0.645, rh * (0.86 + 0.06 * face)];
  ellH(lipU, [rh * 0.18, rh * 0.06, rh * 0.08 * face + 0.01], 0.03);
  ellH(lipL, [rh * 0.15, rh * 0.06, rh * 0.08 * face + 0.01], 0.03);
  var lids = [];
  [-1, 1].forEach(function (s) {
    var c = [s * rh * 0.31, -rh * 0.17, rh * 0.8];
    ellH(c, [rh * 0.18, rh * 0.11, rh * 0.1], 0.05);
    lids.push(c);
  });
  var earY = -rh * (0.2 + 0.25 * e);
  var ears = [];
  [-1, 1].forEach(function (s) {
    ellH([s * rh * 0.88, earY, -rh * 0.08], [rh * 0.09, rh * 0.24, rh * 0.17], 0.04);
    ellH([s * rh * 0.98, earY + rh * 0.01, -rh * 0.05], [rh * 0.06, rh * 0.13, rh * 0.09], 0.02, headSub);
    ears.push([s * rh * 0.9, earY, -rh * 0.08]);
  });

  function toHead(x, y, z) {
    var dx = x - H[0], dy = y - H[1], dz = z - H[2];
    return [dx, dy * cf + dz * sf, -dy * sf + dz * cf];
  }

  function sdf(x, y, z) {
    var d = 1e9, i, pr, lb, c;
    for (i = 0; i < body.length; i++) {
      pr = body[i]; c = pr.c;
      lb = Math.sqrt((x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1]) + (z - c[2]) * (z - c[2])) - pr.R;
      if (lb > d + pr.k) continue;
      d = pr.k ? smin(d, pr.f(x, y, z), pr.k) : Math.min(d, pr.f(x, y, z));
    }
    var dx = x - H[0], dy = y - H[1], dz = z - H[2];
    var hx = dx, hy = dy * cf + dz * sf, hz = -dy * sf + dz * cf;
    for (i = 0; i < head.length; i++) {
      pr = head[i]; c = pr.c;
      lb = Math.sqrt((hx - c[0]) * (hx - c[0]) + (hy - c[1]) * (hy - c[1]) + (hz - c[2]) * (hz - c[2])) - pr.R;
      if (lb > d + pr.k) continue;
      d = pr.k ? smin(d, pr.f(hx, hy, hz), pr.k) : Math.min(d, pr.f(hx, hy, hz));
    }
    for (i = 0; i < headSub.length; i++) {
      pr = headSub[i]; c = pr.c;
      lb = Math.sqrt((hx - c[0]) * (hx - c[0]) + (hy - c[1]) * (hy - c[1]) + (hz - c[2]) * (hz - c[2])) - pr.R;
      if (lb > pr.k) continue;
      d = smax(d, -pr.f(hx, hy, hz), pr.k);
    }
    return d;
  }

  function distSeg(px, py, pz, a, b) {
    var bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
    var t = clamp(((px - a[0]) * bx + (py - a[1]) * by + (pz - a[2]) * bz) / (bx * bx + by * by + bz * bz), 0, 1);
    return Math.hypot(px - a[0] - bx * t, py - a[1] - by * t, pz - a[2] - bz * t);
  }

  function tags(x, y, z) {
    var hp = toHead(x, y, z), hx = hp[0], hy = hp[1], hz = hp[2];
    var t = { lip: 0, line: 0, dark: 0, red: 0 };
    var dl = Math.min(sdEll(hx - lipU[0], hy - lipU[1], hz - lipU[2], rh * 0.18, rh * 0.06, rh * 0.08 * face + 0.01),
                      sdEll(hx - lipL[0], hy - lipL[1], hz - lipL[2], rh * 0.15, rh * 0.06, rh * 0.08 * face + 0.01));
    if (hz > rh * 0.6) t.lip = clamp(1 - Math.max(dl, 0) / (rh * 0.05), 0, 1) * face;
    var my = (lipU[1] + lipL[1]) / 2;
    if (hz > rh * 0.75 && Math.abs(hx) < rh * 0.16) {
      var fall = 1 - Math.pow(Math.abs(hx) / (rh * 0.16), 3);
      t.line = Math.max(t.line, clamp(1 - Math.abs(hy - my) / (rh * 0.022), 0, 1) * fall);
    }
    for (var i = 0; i < 2; i++) {
      var c = lids[i], ddx = hx - c[0];
      if (hz > rh * 0.72 && Math.abs(ddx) < rh * 0.15) {
        var q = 1 - Math.pow(ddx / (rh * 0.15), 2);
        var yl = c[1] - rh * 0.01 - q * rh * 0.015;
        if (eyesOpen) {
          var half = rh * 0.06 * Math.sqrt(q);
          t.dark = Math.max(t.dark, clamp(1 - Math.abs(hy - yl) / half, 0, 1) * clamp(q * 1.4, 0, 1) * 0.85);
        } else {
          t.line = Math.max(t.line, clamp(1 - Math.abs(hy - yl) / (rh * 0.02), 0, 1) * q);
        }
      }
    }
    var r = 0;
    for (i = 0; i < 2; i++) {
      var ea = ears[i];
      r = Math.max(r, clamp(1 - Math.hypot(hx - ea[0], hy - ea[1], hz - ea[2]) / (rh * 0.3), 0, 1));
      r = Math.max(r, clamp(1 - distSeg(x, y, z, hands[i][0], hands[i][1]) / (ra * 2.2), 0, 1));
      r = Math.max(r, clamp(1 - distSeg(x, y, z, feet[i][0], feet[i][1]) / (rl * 1.6), 0, 1));
    }
    t.red = r;
    return t;
  }

  var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  bounds.forEach(function (b) {
    for (var i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], b[0][i] - b[1]);
      mx[i] = Math.max(mx[i], b[0][i] + b[1]);
    }
  });
  for (var i = 0; i < 3; i++) { mn[i] -= 0.08; mx[i] += 0.08; }

  return {
    sdf: sdf, tags: tags, bmin: mn, bmax: mx,
    belly: [0, -ry * 0.15, rz * 1.02],
    eyesOpen: eyesOpen, e: e
  };
}

var SKIN_STOPS = [[8, [0.85, 0.50, 0.47]], [14, [0.89, 0.57, 0.52]], [22, [0.91, 0.64, 0.56]], [30, [0.93, 0.70, 0.60]], [40, [0.94, 0.75, 0.64]]];
function skinRGB(w) {
  for (var i = 0; i < SKIN_STOPS.length - 1; i++) {
    var a = SKIN_STOPS[i], b = SKIN_STOPS[i + 1];
    if (w <= b[0]) {
      var t = (w - a[0]) / (b[0] - a[0]);
      return [a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t];
    }
  }
  return SKIN_STOPS[SKIN_STOPS.length - 1][1];
}

function buildFetusMesh(w, res) {
  var F = makeFetus(w), sdf = F.sdf;
  var ext = [F.bmax[0] - F.bmin[0], F.bmax[1] - F.bmin[1], F.bmax[2] - F.bmin[2]];
  var cell = Math.max(ext[0], ext[1], ext[2]) / (res || 110);
  var nx = Math.ceil(ext[0] / cell) + 1, ny = Math.ceil(ext[1] / cell) + 1, nz = Math.ceil(ext[2] / cell) + 1;
  var ox = F.bmin[0], oy = F.bmin[1], oz = F.bmin[2];
  var field = new Float32Array(nx * ny * nz);

  var cs = 4;
  var cnx = Math.ceil((nx - 1) / cs) + 1, cny = Math.ceil((ny - 1) / cs) + 1, cnz = Math.ceil((nz - 1) / cs) + 1;
  var coarse = new Float32Array(cnx * cny * cnz);
  var i, j, k, ci, cj, ck;
  for (ck = 0; ck < cnz; ck++) for (cj = 0; cj < cny; cj++) for (ci = 0; ci < cnx; ci++) {
    coarse[ci + cnx * (cj + cny * ck)] = sdf(ox + Math.min(ci * cs, nx - 1) * cell, oy + Math.min(cj * cs, ny - 1) * cell, oz + Math.min(ck * cs, nz - 1) * cell);
  }
  var thr = cell * cs * 2.2;
  var n = 0;
  for (k = 0; k < nz; k++) {
    var kc = Math.min(Math.round(k / cs), cnz - 1);
    for (j = 0; j < ny; j++) {
      var jc = Math.min(Math.round(j / cs), cny - 1);
      for (i = 0; i < nx; i++) {
        var ic = Math.min(Math.round(i / cs), cnx - 1);
        var cv = coarse[ic + cnx * (jc + cny * kc)];
        field[n++] = Math.abs(cv) > thr ? cv : sdf(ox + i * cell, oy + j * cell, oz + k * cell);
      }
    }
  }

  var EDGES = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  var COFF = [];
  for (var c = 0; c < 8; c++) COFF.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
  var cx = nx - 1, cy = ny - 1, cz = nz - 1;
  var cellVert = new Int32Array(cx * cy * cz).fill(-1);
  var pos = [];
  var vals = new Float32Array(8);
  var fidx = function (a, b, c) { return a + nx * (b + ny * c); };

  for (k = 0; k < cz; k++) for (j = 0; j < cy; j++) for (i = 0; i < cx; i++) {
    var mask = 0;
    for (c = 0; c < 8; c++) {
      var v = field[fidx(i + COFF[c][0], j + COFF[c][1], k + COFF[c][2])];
      vals[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    var sx = 0, sy = 0, sz = 0, cnt = 0;
    for (var ee = 0; ee < 12; ee++) {
      var a = EDGES[ee][0], b = EDGES[ee][1];
      var va = vals[a], vb = vals[b];
      if ((va < 0) === (vb < 0)) continue;
      var t = va / (va - vb);
      sx += COFF[a][0] + (COFF[b][0] - COFF[a][0]) * t;
      sy += COFF[a][1] + (COFF[b][1] - COFF[a][1]) * t;
      sz += COFF[a][2] + (COFF[b][2] - COFF[a][2]) * t;
      cnt++;
    }
    cellVert[i + cx * (j + cy * k)] = pos.length / 3;
    pos.push(ox + (i + sx / cnt) * cell, oy + (j + sy / cnt) * cell, oz + (k + sz / cnt) * cell);
  }

  var idx = [];
  var cv_ = function (a, b, c) { return cellVert[a + cx * (b + cy * c)]; };
  function quad(v0, v1, v2, v3, axis, outSign) {
    if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) return;
    var ax = pos[v1 * 3] - pos[v0 * 3], ay = pos[v1 * 3 + 1] - pos[v0 * 3 + 1], az = pos[v1 * 3 + 2] - pos[v0 * 3 + 2];
    var bx = pos[v2 * 3] - pos[v0 * 3], by = pos[v2 * 3 + 1] - pos[v0 * 3 + 1], bz = pos[v2 * 3 + 2] - pos[v0 * 3 + 2];
    var nrm = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx][axis];
    if (nrm * outSign >= 0) idx.push(v0, v1, v2, v0, v2, v3);
    else idx.push(v0, v2, v1, v0, v3, v2);
  }
  for (k = 0; k < nz; k++) for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
    var f0 = field[fidx(i, j, k)];
    if (i < cx && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) {
      var f1 = field[fidx(i + 1, j, k)];
      if ((f0 < 0) !== (f1 < 0)) quad(cv_(i, j - 1, k - 1), cv_(i, j, k - 1), cv_(i, j, k), cv_(i, j - 1, k), 0, f0 < 0 ? 1 : -1);
    }
    if (j < cy && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) {
      var f2 = field[fidx(i, j + 1, k)];
      if ((f0 < 0) !== (f2 < 0)) quad(cv_(i - 1, j, k - 1), cv_(i, j, k - 1), cv_(i, j, k), cv_(i - 1, j, k), 1, f0 < 0 ? 1 : -1);
    }
    if (k < cz && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) {
      var f3 = field[fidx(i, j, k + 1)];
      if ((f0 < 0) !== (f3 < 0)) quad(cv_(i - 1, j - 1, k), cv_(i, j - 1, k), cv_(i, j, k), cv_(i - 1, j, k), 2, f0 < 0 ? 1 : -1);
    }
  }

  var nv = pos.length / 3;
  var normals = new Float32Array(nv * 3), colNat = new Float32Array(nv * 3);
  var eps = cell * 0.6;
  var skin = skinRGB(w);
  var red = [skin[0] * 1.0, skin[1] * 0.78, skin[2] * 0.8];
  var lipC = [0.80, 0.45, 0.44], lineC = [0.5, 0.25, 0.24], darkC = [0.18, 0.09, 0.09];
  for (var vI = 0; vI < nv; vI++) {
    var x = pos[vI * 3], y = pos[vI * 3 + 1], z = pos[vI * 3 + 2];
    var gx = sdf(x + eps, y, z) - sdf(x - eps, y, z);
    var gy = sdf(x, y + eps, z) - sdf(x, y - eps, z);
    var gz = sdf(x, y, z + eps) - sdf(x, y, z - eps);
    var gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    normals[vI * 3] = gx; normals[vI * 3 + 1] = gy; normals[vI * 3 + 2] = gz;
    var occ = 0, sca = 1;
    for (var s = 1; s <= 5; s++) {
      var h = 0.012 + 0.035 * s;
      occ += (h - sdf(x + gx * h, y + gy * h, z + gz * h)) * sca;
      sca *= 0.7;
    }
    var ao = clamp(1 - 2.2 * occ, 0, 1);
    var aoN = 0.45 + 0.55 * ao;
    var tg = F.tags(x, y, z);
    for (var q = 0; q < 3; q++) {
      var cc = skin[q] + (red[q] - skin[q]) * tg.red * 0.8;
      cc += (lipC[q] - cc) * tg.lip * 0.6;
      cc += (lineC[q] - cc) * tg.line * 0.75;
      cc += (darkC[q] - cc) * tg.dark;
      colNat[vI * 3 + q] = cc * aoN;
    }
  }

  return {
    positions: new Float32Array(pos), normals: normals, colNat: colNat,
    index: nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
    bmin: F.bmin, bmax: F.bmax, belly: F.belly, e: F.e
  };
}
