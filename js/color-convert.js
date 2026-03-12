/**
 * Color conversion utilities.
 * CMYK → RGB → Hex, and RGB → XYZ → CIELAB.
 */

export function cmykToRgb(c, m, y, k) {
  const r = Math.round(255 * (1 - c / 100) * (1 - k / 100));
  const g = Math.round(255 * (1 - m / 100) * (1 - k / 100));
  const b = Math.round(255 * (1 - y / 100) * (1 - k / 100));
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

export function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  );
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function linearize(c) {
  c = c / 255;
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

export function rgbToLab(r, g, b) {
  const rLin = linearize(r);
  const gLin = linearize(g);
  const bLin = linearize(b);

  // sRGB → XYZ (D65)
  let x = 0.4124564 * rLin + 0.3575761 * gLin + 0.1804375 * bLin;
  let y = 0.2126729 * rLin + 0.7151522 * gLin + 0.072175 * bLin;
  let z = 0.0193339 * rLin + 0.119192 * gLin + 0.9503041 * bLin;

  // D65 reference white
  x /= 0.95047;
  y /= 1.0;
  z /= 1.08883;

  const f = (t) =>
    t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116;

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return [L, a, bVal];
}

export function luminance(r, g, b) {
  const rLin = linearize(r);
  const gLin = linearize(g);
  const bLin = linearize(b);
  return 0.2126729 * rLin + 0.7151522 * gLin + 0.072175 * bLin;
}
