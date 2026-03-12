import { hexToRgb, rgbToLab, cmykToRgb } from './color-convert.js';
import { deltaE76 } from './color-distance.js';

import { cssColors } from '../data/css-colors.js';
import { xkcdColors } from '../data/xkcd-colors.js';
import { ntcColors } from '../data/ntc-colors.js';
import { ralColors } from '../data/ral-colors.js';
import { crayolaColors } from '../data/crayola-colors.js';
import { pigmentColors } from '../data/pigment-colors.js';
import { wikipediaColors } from '../data/wikipedia-colors.js';

export const libraries = [
  cssColors,
  xkcdColors,
  ntcColors,
  ralColors,
  crayolaColors,
  pigmentColors,
  wikipediaColors,
];

// Flat array of all colors with precomputed LAB values
let allColors = [];

export function init() {
  allColors = [];
  for (const lib of libraries) {
    for (const color of lib.colors) {
      const rgb = hexToRgb(color.hex);
      const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
      allColors.push({
        name: color.name,
        hex: color.hex,
        library: lib.name,
        lab,
      });
    }
  }
}

export function findClosest(c, m, y, k, count = 20, enabledLibraries = null) {
  const rgb = cmykToRgb(c, m, y, k);
  const targetLab = rgbToLab(rgb[0], rgb[1], rgb[2]);

  let pool = allColors;
  if (enabledLibraries) {
    pool = allColors.filter((col) => enabledLibraries.has(col.library));
  }

  const results = new Array(pool.length);
  for (let i = 0; i < pool.length; i++) {
    results[i] = {
      name: pool[i].name,
      hex: pool[i].hex,
      library: pool[i].library,
      distance: deltaE76(targetLab, pool[i].lab),
    };
  }

  results.sort((a, b) => a.distance - b.distance);
  return results.slice(0, count);
}

export function getColorCount() {
  return allColors.length;
}
