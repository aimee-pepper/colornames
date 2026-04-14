import { cmykToRgb, rgbToHex, hexToRgb, luminance, rgbToHsv, hsvToRgb, rgbToCmyk, rgbToLab } from './color-convert.js';
import { init, findClosest, libraries, getColorCount } from './color-search.js';

// DOM elements
const preview = document.getElementById('preview');
const previewHex = document.getElementById('preview-hex');
const hexInput = document.getElementById('hex-input');
const copyBtn = document.getElementById('copy-hex');
const rgbValue = document.getElementById('rgb-value');
const resultsList = document.getElementById('results-list');
const filterContainer = document.getElementById('filter-buttons');
const deltaSlider = document.getElementById('delta-slider');
const deltaValue = document.getElementById('delta-value');
const suggestedNamesList = document.getElementById('suggested-names-list');

const sliders = {
  c: document.getElementById('slider-c'),
  m: document.getElementById('slider-m'),
  y: document.getElementById('slider-y'),
  k: document.getElementById('slider-k'),
};

const numInputs = {
  c: document.getElementById('num-c'),
  m: document.getElementById('num-m'),
  y: document.getElementById('num-y'),
  k: document.getElementById('num-k'),
};

// State
const disabledByDefault = new Set(['Traditional Japanese']);
const enabledLibraries = new Set(libraries.map((l) => l.name).filter(n => !disabledByDefault.has(n)));
let currentView = 'list';
let lastResults = [];
let lastTargetLab = [0, 0, 0];

// Initialize color database
init();

// Build library filter buttons
for (const lib of libraries) {
  const btn = document.createElement('button');
  btn.className = enabledLibraries.has(lib.name) ? 'filter-btn active' : 'filter-btn';
  btn.textContent = lib.name;
  btn.dataset.library = lib.name;
  btn.addEventListener('click', () => {
    if (enabledLibraries.has(lib.name)) {
      enabledLibraries.delete(lib.name);
      btn.classList.remove('active');
    } else {
      enabledLibraries.add(lib.name);
      btn.classList.add('active');
    }
    update();
  });
  filterContainer.appendChild(btn);
}

// Sync slider ↔ number input
for (const ch of ['c', 'm', 'y', 'k']) {
  sliders[ch].addEventListener('input', () => {
    numInputs[ch].value = sliders[ch].value;
    update();
  });
  numInputs[ch].addEventListener('input', () => {
    let v = parseInt(numInputs[ch].value, 10);
    if (isNaN(v)) v = 0;
    v = Math.max(0, Math.min(100, v));
    sliders[ch].value = v;
    update();
  });
}

// HSV Picker
const svCanvas = document.getElementById('sv-canvas');
const svCtx = svCanvas.getContext('2d');
const svCursor = document.getElementById('sv-cursor');
const hueCanvas = document.getElementById('hue-canvas');
const hueCtx = hueCanvas.getContext('2d');
const hueCursor = document.getElementById('hue-cursor');

let currentHue = 0;
let currentSat = 0;
let currentVal = 0;
let pickerUpdating = false;

function drawHueStrip() {
  const w = hueCanvas.width, h = hueCanvas.height;
  const grad = hueCtx.createLinearGradient(0, 0, 0, h);
  for (let i = 0; i <= 6; i++) {
    const color = `hsl(${(i / 6) * 360}, 100%, 50%)`;
    grad.addColorStop(Math.min(i / 6, 1), color);
  }
  hueCtx.fillStyle = grad;
  hueCtx.fillRect(0, 0, w, h);
}

function drawSVPanel(hue) {
  const w = svCanvas.width, h = svCanvas.height;
  const img = svCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = x / (w - 1);
      const v = 1 - y / (h - 1);
      const [r, g, b] = hsvToRgb(hue, s * 100, v * 100);
      const idx = (y * w + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  svCtx.putImageData(img, 0, 0);
}

function updatePickerCursors() {
  const svWrap = svCanvas.parentElement;
  const svW = svWrap.clientWidth;
  const svH = svWrap.clientHeight;
  svCursor.style.left = (currentSat / 100) * svW + 'px';
  svCursor.style.top = (1 - currentVal / 100) * svH + 'px';

  const hueWrap = hueCanvas.parentElement;
  hueCursor.style.top = (currentHue / 360) * hueWrap.clientHeight + 'px';
}

function syncPickerFromCmyk() {
  if (pickerUpdating) return;
  const c = parseInt(sliders.c.value, 10);
  const m = parseInt(sliders.m.value, 10);
  const y = parseInt(sliders.y.value, 10);
  const k = parseInt(sliders.k.value, 10);
  const [r, g, b] = cmykToRgb(c, m, y, k);
  const [h, s, v] = rgbToHsv(r, g, b);
  currentHue = h;
  currentSat = s;
  currentVal = v;
  drawSVPanel(currentHue);
  updatePickerCursors();
}

function applyHsvToCmyk() {
  pickerUpdating = true;
  const [r, g, b] = hsvToRgb(currentHue, currentSat, currentVal);
  const [c, m, y, k] = rgbToCmyk(r, g, b);
  sliders.c.value = c; numInputs.c.value = c;
  sliders.m.value = m; numInputs.m.value = m;
  sliders.y.value = y; numInputs.y.value = y;
  sliders.k.value = k; numInputs.k.value = k;
  update();
  pickerUpdating = false;
}

// SV panel interaction
function handleSV(e) {
  const rect = svCanvas.parentElement.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  currentSat = x * 100;
  currentVal = (1 - y) * 100;
  updatePickerCursors();
  applyHsvToCmyk();
}

svCanvas.parentElement.addEventListener('pointerdown', (e) => {
  handleSV(e);
  const onMove = (ev) => handleSV(ev);
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
});

// Hue strip interaction
function handleHue(e) {
  const rect = hueCanvas.parentElement.getBoundingClientRect();
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  currentHue = y * 360;
  drawSVPanel(currentHue);
  updatePickerCursors();
  applyHsvToCmyk();
}

hueCanvas.parentElement.addEventListener('pointerdown', (e) => {
  handleHue(e);
  const onMove = (ev) => handleHue(ev);
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
});

drawHueStrip();
drawSVPanel(0);

// Delta slider
deltaSlider.addEventListener('input', () => {
  deltaValue.textContent = deltaSlider.value;
  update();
});

// Copy hex
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(hexInput.value).then(() => {
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 1200);
  });
});

// Read hash state on load
function loadFromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  const params = new URLSearchParams(hash);
  for (const ch of ['c', 'm', 'y', 'k']) {
    const val = params.get(ch);
    if (val !== null) {
      const v = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
      sliders[ch].value = v;
      numInputs[ch].value = v;
    }
  }
}

function update() {
  const c = parseInt(sliders.c.value, 10);
  const m = parseInt(sliders.m.value, 10);
  const y = parseInt(sliders.y.value, 10);
  const k = parseInt(sliders.k.value, 10);

  const [r, g, b] = cmykToRgb(c, m, y, k);
  const hex = rgbToHex(r, g, b);

  // Update preview
  preview.style.backgroundColor = hex;
  previewHex.textContent = hex.toUpperCase();
  previewHex.style.color = luminance(r, g, b) > 0.18 ? '#000' : '#fff';

  // Update values
  hexInput.value = hex.toUpperCase();
  rgbValue.textContent = `RGB: ${r}, ${g}, ${b}`;

  // Update URL hash
  history.replaceState(null, '', `#c=${c}&m=${m}&y=${y}&k=${k}`);

  // Sync HSV picker
  syncPickerFromCmyk();

  // Find closest colors
  const maxDelta = parseInt(deltaSlider.value, 10);
  const results = findClosest(c, m, y, k, enabledLibraries, maxDelta);
  lastResults = results;
  lastTargetLab = rgbToLab(r, g, b);
  renderResults(results);
  renderRadial(results, lastTargetLab, hex);
  renderCommonness(results);
  renderSuggestedNames(results);
}

// Generate suggested color name candidates with reasoning
function generateSuggestedNames(results) {
  if (results.length === 0) return [];

  const h = currentHue, s = currentSat, v = currentVal;
  const [curR, curG, curB] = hsvToRgb(h, s, v);
  const curLab = rgbToLab(curR, curG, curB);

  const filler = new Set([
    'a', 'an', 'the', 'of', 'de', 'du', 'no', 'is', 'in', 'at', 'to',
    'and', 'or', 'with', 'ral', 'ntc', 'css',
  ]);

  const genericColors = new Set([
    'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
    'grey', 'gray', 'white', 'black', 'violet', 'cyan', 'magenta',
  ]);

  const standaloneColorNames = new Set([
    'viridian', 'cerulean', 'sienna', 'umber', 'ochre', 'crimson', 'scarlet',
    'teal', 'sage', 'mauve', 'coral', 'burgundy', 'chartreuse', 'indigo',
    'turquoise', 'lavender', 'maroon', 'aqua', 'periwinkle', 'fuchsia',
    'khaki', 'ivory', 'ecru', 'beige', 'taupe', 'auburn', 'rust', 'copper',
    'bronze', 'gold', 'silver', 'champagne', 'peach', 'apricot', 'salmon',
    'tangerine', 'vermillion', 'vermilion', 'carmine', 'cerise',
    'amaranth', 'rose', 'blush', 'puce', 'plum', 'lilac', 'orchid',
    'amethyst', 'heather', 'wisteria', 'cobalt', 'azure', 'sapphire',
    'navy', 'denim', 'cornflower', 'slate', 'jade', 'emerald', 'mint',
    'lime', 'olive', 'moss', 'fern', 'pine', 'celadon', 'seafoam',
    'honeydew', 'pistachio', 'sand', 'tan', 'caramel', 'chocolate',
    'espresso', 'mahogany', 'chestnut', 'cinnamon', 'sepia', 'bisque',
    'linen', 'cream', 'pearl', 'bone', 'ash', 'charcoal', 'onyx',
    'ebony', 'saffron', 'turmeric', 'mustard', 'goldenrod', 'amber',
    'topaz', 'citrine', 'canary', 'lemon', 'primrose', 'buttercup',
    'carnelian', 'terracotta', 'paprika', 'cayenne', 'merlot', 'claret',
    'garnet', 'ruby', 'cardinal', 'cranberry', 'raspberry', 'strawberry',
    'watermelon', 'pomegranate', 'hibiscus', 'peony', 'carnation',
    'flamingo', 'thistle', 'mulberry', 'cadmium', 'phthalo', 'quinacridone',
    'alizarin', 'gamboge', 'aureolin',
  ]);

  const modifierWords = new Set([
    'light', 'dark', 'pale', 'deep', 'bright', 'vivid', 'muted', 'soft',
    'warm', 'cool', 'hot', 'rich', 'dusty', 'smoky', 'pastel', 'neon',
    'medium', 'electric', 'royal', 'baby', 'old', 'true', 'pure',
    'burnt', 'raw', 'french', 'indian', 'persian', 'chinese', 'japanese',
    'tropical', 'antique', 'vintage', 'classic', 'natural', 'steel',
    'powder', 'midnight', 'misty', 'faded', 'intense', 'dull',
    'jungle', 'forest', 'ocean', 'sky', 'sea', 'sun', 'fire', 'ice',
    'stone', 'earth', 'snow', 'cloud', 'storm', 'shadow',
    'spring', 'summer', 'autumn', 'winter', 'arctic', 'alpine',
    'desert', 'meadow', 'garden', 'field', 'night', 'dawn', 'dusk',
    'sunset', 'sunrise', 'twilight', 'lunar', 'solar', 'cosmic',
    'blood', 'wine', 'iron', 'golden',
    'hunter', 'military', 'imperial', 'venetian', 'transparent',
    'permanent', 'new', 'chrome', 'mars', 'nickel',
  ]);

  function hsvModifier() {
    if (s < 8 && v > 85) return 'pale';
    if (s < 12 && v < 25) return 'charcoal';
    if (s < 15) return 'muted';
    if (v < 20) return 'dark';
    if (v < 35 && s > 50) return 'deep';
    if (v < 45) return 'dark';
    if (v > 85 && s < 35) return 'pale';
    if (v > 80 && s < 50) return 'light';
    if (s > 85 && v > 70) return 'vivid';
    if (s > 75 && v > 60) return 'bright';
    if (s < 30 && v > 50 && v < 80) return 'dusty';
    if (s > 50 && v > 50) return 'rich';
    return 'soft';
  }

  function hueFamily() {
    if (s < 10) return 'grey';
    if (h < 15 || h >= 345) return 'red';
    if (h < 40) return 'orange';
    if (h < 70) return 'yellow';
    if (h < 165) return 'green';
    if (h < 195) return 'cyan';
    if (h < 260) return 'blue';
    if (h < 290) return 'purple';
    if (h < 345) return 'pink';
    return 'red';
  }

  function titleCase(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }

  // Determine how our color differs from a reference color in HSV terms
  function describeHsvDiff(refHex) {
    const [rr, rg, rb] = hexToRgb(refHex);
    const [rh, rs, rv] = rgbToHsv(rr, rg, rb);
    const dv = v - rv; // positive = we're lighter
    const ds = s - rs; // positive = we're more saturated

    // Check: same hue (within 20°), difference is mainly value/saturation
    const hueDiff = Math.abs(h - rh);
    const hueClose = hueDiff < 25 || hueDiff > 335;
    if (!hueClose) return null;

    // Need a meaningful V or S difference
    if (Math.abs(dv) < 10 && Math.abs(ds) < 10) return null;

    if (dv < -20 && ds > 15) return 'deep';
    if (dv < -15) return 'dark';
    if (dv > 20 && ds < -15) return 'pale';
    if (dv > 15) return 'light';
    if (ds > 20) return 'vivid';
    if (ds < -20) return 'muted';
    if (dv < -10) return 'dark';
    if (dv > 10) return 'light';
    return null;
  }

  // Check if adjusting V/S of a reference color could match ours within deltaE 5
  function couldMatchWithAdjustment(refHex) {
    const [rr, rg, rb] = hexToRgb(refHex);
    const [rh, rs, rv] = rgbToHsv(rr, rg, rb);
    // Try the reference color's hue with our S and V
    const [tr, tg, tb] = hsvToRgb(rh, s, v);
    const testLab = rgbToLab(tr, tg, tb);
    const dL = curLab[0] - testLab[0];
    const da = curLab[1] - testLab[1];
    const db = curLab[2] - testLab[2];
    return Math.sqrt(dL * dL + da * da + db * db) < 5;
  }

  const seen = new Set();
  const candidates = [];

  function add(name, reason) {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    if (name.split(/\s+/).length < 2) return;
    seen.add(key);
    candidates.push({ name, reason });
  }

  // === PRIORITY 1: Exact match — existing color with deltaE < 3 ===
  for (const r of results) {
    if (r.distance >= 3) break; // results are sorted by distance
    const words = r.name.trim().split(/\s+/);
    if (words.length >= 2) {
      add(r.name, `exact match — ${r.library}, ΔE ${r.distance.toFixed(1)}`);
    }
  }

  // === PRIORITY 2: Similar color + HSV modifier ===
  // Find colors with same hue but different S/V, where adjusting S/V would match
  for (const r of results.slice(0, 60)) {
    if (r.distance < 3) continue; // already handled as exact
    if (r.distance > 25) break;
    const mod = describeHsvDiff(r.hex);
    if (mod && couldMatchWithAdjustment(r.hex)) {
      // Check the existing name doesn't already contain a conflicting modifier
      const nameWords = r.name.toLowerCase().split(/\s+/);
      const hasConflict = nameWords.some(w => modifiersConflict(mod, w));
      if (hasConflict) continue;
      const modName = titleCase(mod + ' ' + r.name.toLowerCase());
      const comparative = { deep: 'deeper', dark: 'darker', light: 'lighter', pale: 'paler', vivid: 'more vivid', muted: 'more muted' }[mod] || `more ${mod}`;
      add(modName, `${comparative} than ${r.name} (${r.library}, ΔE ${r.distance.toFixed(1)})`);
    }
  }

  // === PRIORITY 3: Qualifier + standalone color name ===
  // Score words from nearby colors
  const nearby = results.filter(r => r.distance <= 15).slice(0, 50);
  if (nearby.length === 0) nearby.push(...results.slice(0, 10));

  const wordData = new Map();
  for (const color of nearby) {
    const weight = 1 / (1 + color.distance * color.distance);
    const words = [...new Set(color.name.toLowerCase()
      .replace(/[''`]/g, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
      .split(/\s+/)
      .filter(w => w.length >= 2 && !filler.has(w)))];
    for (const word of words) {
      const prev = wordData.get(word) || { score: 0, count: 0 };
      prev.score += weight;
      prev.count += 1;
      wordData.set(word, prev);
    }
  }

  const standalones = [], generics = [], mods = [];
  for (const [word, data] of wordData) {
    const entry = { word, score: data.score, count: data.count };
    if (modifierWords.has(word)) { mods.push(entry); }
    else if (genericColors.has(word)) { generics.push(entry); }
    else if (standaloneColorNames.has(word)) { standalones.push(entry); }
    else if (data.count >= 2) { mods.push(entry); }
  }
  standalones.sort((a, b) => b.score - a.score);
  generics.sort((a, b) => b.score - a.score);
  mods.sort((a, b) => b.score - a.score);

  const hMod = hsvModifier();
  const hFam = hueFamily();

  // Conflicting modifier pairs — these should never be combined
  const conflicts = new Map([
    ['light', new Set(['dark', 'deep', 'midnight', 'shadow', 'night'])],
    ['dark', new Set(['light', 'pale', 'bright', 'vivid', 'neon', 'electric', 'pastel', 'baby', 'powder'])],
    ['pale', new Set(['dark', 'deep', 'vivid', 'bright', 'rich', 'neon', 'electric', 'intense', 'midnight', 'shadow'])],
    ['deep', new Set(['light', 'pale', 'bright', 'pastel', 'baby', 'powder', 'soft'])],
    ['bright', new Set(['dark', 'deep', 'muted', 'dull', 'dusty', 'faded', 'shadow'])],
    ['vivid', new Set(['pale', 'muted', 'dull', 'dusty', 'faded', 'soft'])],
    ['muted', new Set(['vivid', 'bright', 'neon', 'electric', 'intense'])],
    ['dusty', new Set(['vivid', 'bright', 'neon', 'electric'])],
    ['pastel', new Set(['dark', 'deep', 'midnight', 'shadow'])],
    ['soft', new Set(['vivid', 'neon', 'electric', 'intense', 'deep'])],
    ['charcoal', new Set(['light', 'pale', 'bright', 'vivid', 'pastel', 'baby', 'powder', 'neon'])],
  ]);

  function modifiersConflict(a, b) {
    if (a === b) return true;
    return (conflicts.get(a)?.has(b)) || (conflicts.get(b)?.has(a));
  }

  // Qualifier + standalone: "Burnt Sienna", "Forest Sage"
  for (const mod of mods.slice(0, 4)) {
    for (const sa of standalones.slice(0, 3)) {
      const name = titleCase(mod.word + ' ' + sa.word);
      add(name, `common qualifier "${mod.word}" + color "${sa.word}"`);
    }
  }

  // === PRIORITY 4: HSV modifier + qualifier + generic family ===
  // "Deep Jungle Green", "Pale Dusty Rose"
  for (const mod of mods.slice(0, 3)) {
    if (modifiersConflict(hMod, mod.word)) continue;
    for (const gen of generics.slice(0, 2)) {
      const name = titleCase(hMod + ' ' + mod.word + ' ' + gen.word);
      add(name, `HSV "${hMod}" + qualifier "${mod.word}" + family "${gen.word}"`);
    }
  }

  // === PRIORITY 5: Standalone + generic family ===
  // "Sage Green", "Cobalt Blue"
  for (const sa of standalones.slice(0, 3)) {
    for (const gen of generics.slice(0, 2)) {
      const name = titleCase(sa.word + ' ' + gen.word);
      add(name, `color "${sa.word}" + family "${gen.word}"`);
    }
  }

  // === PRIORITY 6: Qualifier + hue family ===
  // "Forest Green", "Midnight Blue"
  for (const mod of mods.slice(0, 3)) {
    const name = titleCase(mod.word + ' ' + hFam);
    add(name, `qualifier "${mod.word}" + hue family "${hFam}"`);
  }

  // Fallback
  if (candidates.length === 0) {
    add(titleCase(hMod + ' ' + hFam), `HSV-derived: ${hMod} ${hFam}`);
  }

  return candidates;
}

function renderSuggestedNames(results) {
  const candidates = generateSuggestedNames(results);
  suggestedNamesList.innerHTML = '';
  if (candidates.length === 0) {
    suggestedNamesList.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>';
    return;
  }
  for (const { name, reason } of candidates) {
    const row = document.createElement('div');
    row.className = 'suggested-name-row';
    row.innerHTML = `<span class="suggested-name-text">${escapeHtml(name)}</span><span class="suggested-name-reason">${escapeHtml(reason)}</span>`;
    suggestedNamesList.appendChild(row);
  }
}

function renderResults(results) {
  resultsList.innerHTML = '';

  if (results.length === 0) {
    resultsList.innerHTML =
      '<p style="color:var(--text-muted);text-align:center;padding:1rem;">No libraries selected</p>';
    return;
  }

  for (const color of results) {
    const card = document.createElement('div');
    card.className = 'color-card';

    card.innerHTML = `
      <div class="color-swatch" style="background-color:${color.hex}"></div>
      <span class="color-name">${escapeHtml(color.name)}</span>
      <span class="color-library">${escapeHtml(color.library)}</span>
      <span class="color-hex">${color.hex}</span>
      <span class="color-delta">&Delta;E ${color.distance.toFixed(1)}</span>
    `;

    resultsList.appendChild(card);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// View tabs
const viewList = document.getElementById('view-list');
const viewRadial = document.getElementById('view-radial');
const viewCommonness = document.getElementById('view-commonness');
const commonnessList = document.getElementById('commonness-list');
const radialCanvas = document.getElementById('radial-canvas');
const radialCtx = radialCanvas.getContext('2d');
const viewTabs = document.querySelectorAll('.view-tab');

// Radial zoom state
let radialZoom = 1;
let radialPanX = 0;
let radialPanY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

viewRadial.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  radialZoom = Math.max(0.5, Math.min(10, radialZoom * factor));
  renderRadial(lastResults, lastTargetLab);
}, { passive: false });

viewRadial.addEventListener('pointerdown', (e) => {
  if (e.target === radialCanvas) {
    isPanning = true;
    panStartX = e.clientX - radialPanX;
    panStartY = e.clientY - radialPanY;
    viewRadial.style.cursor = 'grabbing';
  }
});

window.addEventListener('pointermove', (e) => {
  if (!isPanning) return;
  radialPanX = e.clientX - panStartX;
  radialPanY = e.clientY - panStartY;
  renderRadial(lastResults, lastTargetLab);
});

window.addEventListener('pointerup', () => {
  if (isPanning) {
    isPanning = false;
    viewRadial.style.cursor = '';
  }
});

for (const tab of viewTabs) {
  tab.addEventListener('click', () => {
    for (const t of viewTabs) t.classList.remove('active');
    tab.classList.add('active');
    currentView = tab.dataset.view;
    viewList.style.display = currentView === 'list' ? '' : 'none';
    viewRadial.style.display = currentView === 'radial' ? '' : 'none';
    viewCommonness.style.display = currentView === 'commonness' ? '' : 'none';
    if (currentView === 'radial') {
      radialZoom = 1;
      radialPanX = 0;
      radialPanY = 0;
      renderRadial(lastResults, lastTargetLab);
    }
    if (currentView === 'commonness') {
      renderCommonness(lastResults);
    }
  });
}

function renderRadial(results, targetLab) {
  if (currentView !== 'radial') return;

  const container = viewRadial;
  const w = container.clientWidth;
  const h = container.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  radialCanvas.width = w * dpr;
  radialCanvas.height = h * dpr;
  radialCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = w / 2;
  const cy = h / 2;
  const maxRadius = Math.min(cx, cy) - 50;
  const maxDelta = parseInt(deltaSlider.value, 10) || 20;

  // Clear
  radialCtx.clearRect(0, 0, w, h);

  // Apply zoom and pan
  radialCtx.save();
  radialCtx.translate(cx + radialPanX, cy + radialPanY);
  radialCtx.scale(radialZoom, radialZoom);
  radialCtx.translate(-cx, -cy);

  // Draw subtle range rings
  radialCtx.strokeStyle = 'rgba(0,0,0,0.06)';
  radialCtx.lineWidth = 1 / radialZoom;
  for (let i = 1; i <= 4; i++) {
    const r = (i / 4) * maxRadius;
    radialCtx.beginPath();
    radialCtx.arc(cx, cy, r, 0, Math.PI * 2);
    radialCtx.stroke();
  }

  // Draw center swatch (selected color)
  const [tr, tg, tb] = hsvToRgb(currentHue, currentSat, currentVal);
  const centerHex = rgbToHex(tr, tg, tb);
  radialCtx.fillStyle = centerHex;
  radialCtx.beginPath();
  radialCtx.arc(cx, cy, 16, 0, Math.PI * 2);
  radialCtx.fill();
  radialCtx.strokeStyle = luminance(tr, tg, tb) > 0.18 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)';
  radialCtx.lineWidth = 1.5 / radialZoom;
  radialCtx.stroke();

  if (results.length === 0) return;

  // Position each color:
  // - angle from the chromatic difference (da, db in LAB)
  // - distance from center = deltaE mapped to maxRadius
  const swatchSize = 18;
  const fontSize = 8;
  const labelPad = 3;

  // Collect positioned swatches for collision avoidance
  const placed = [];

  for (const color of results) {
    const da = color.lab[1] - targetLab[1];
    const db = color.lab[2] - targetLab[2];

    // Angle from chromatic difference
    let angle = Math.atan2(db, da);

    // Distance = deltaE mapped to radius
    const dist = (color.distance / maxDelta) * maxRadius;

    let x = cx + Math.cos(angle) * dist;
    let y = cy + Math.sin(angle) * dist;

    // Nudge to avoid overlaps
    for (let attempt = 0; attempt < 8; attempt++) {
      let overlap = false;
      for (const p of placed) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < swatchSize + 2) {
          overlap = true;
          break;
        }
      }
      if (!overlap) break;
      angle += 0.3;
      x = cx + Math.cos(angle) * dist;
      y = cy + Math.sin(angle) * dist;
    }

    placed.push({ x, y });

    // Draw swatch circle
    radialCtx.fillStyle = color.hex;
    radialCtx.beginPath();
    radialCtx.arc(x, y, swatchSize / 2, 0, Math.PI * 2);
    radialCtx.fill();
    radialCtx.strokeStyle = 'rgba(0,0,0,0.15)';
    radialCtx.lineWidth = 1 / radialZoom;
    radialCtx.stroke();

    // Draw name below
    radialCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    radialCtx.font = `${fontSize}px -apple-system, sans-serif`;
    radialCtx.textAlign = 'center';
    radialCtx.textBaseline = 'top';
    const label = color.name.length > 16 ? color.name.slice(0, 15) + '…' : color.name;
    radialCtx.fillText(label, x, y + swatchSize / 2 + labelPad);
  }

  radialCtx.restore();
}

// Commonness view
function renderCommonness(results) {
  if (currentView !== 'commonness') return;
  commonnessList.innerHTML = '';

  if (results.length === 0) {
    commonnessList.innerHTML =
      '<p class="commonness-empty">No colors in range</p>';
    return;
  }

  // Normalize names for grouping: lowercase, strip punctuation, trim
  function normalizeName(name) {
    return name.toLowerCase().replace(/[''`]/g, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Words too generic to group by
  const stopWords = new Set([
    'a', 'an', 'the', 'of', 'de', 'du', 'no', 'is', 'in', 'at', 'to',
    'and', 'or', 'with', 'ral', 'ntc', 'css',
  ]);

  function getWords(name) {
    return normalizeName(name)
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w));
  }

  // --- Exact name groups (only close colors, deltaE <= 10) ---
  const closeResults = results.filter(r => r.distance <= 10);
  const exactGroups = new Map();
  for (const color of closeResults) {
    const key = normalizeName(color.name);
    if (!exactGroups.has(key)) {
      exactGroups.set(key, { displayName: color.name, colors: [], type: 'exact' });
    }
    exactGroups.get(key).colors.push(color);
  }

  // Only keep exact groups with 2+ matches
  const exactMatches = [...exactGroups.values()].filter(g => g.colors.length > 1);

  // --- Word groups ---
  const wordGroups = new Map();
  for (const color of results) {
    for (const word of getWords(color.name)) {
      if (!wordGroups.has(word)) {
        wordGroups.set(word, { displayName: word, colors: [], type: 'word' });
      }
      wordGroups.get(word).colors.push(color);
    }
  }

  // Only keep word groups with 2+ matches
  const wordMatches = [...wordGroups.values()].filter(g => g.colors.length > 1);

  // Sort helper: count desc, then best delta
  const sortGroups = (a, b) => {
    if (b.colors.length !== a.colors.length) return b.colors.length - a.colors.length;
    const bestA = Math.min(...a.colors.map(c => c.distance));
    const bestB = Math.min(...b.colors.map(c => c.distance));
    return bestA - bestB;
  };

  exactMatches.sort(sortGroups);
  wordMatches.sort(sortGroups);

  // Render a section
  function renderSection(title, groups) {
    if (groups.length === 0) return;

    const heading = document.createElement('div');
    heading.className = 'commonness-section-heading';
    heading.textContent = title;
    commonnessList.appendChild(heading);

    for (const group of groups) {
      const div = document.createElement('div');
      div.className = 'commonness-group';

      const header = document.createElement('div');
      header.className = 'commonness-header';

      const name = document.createElement('span');
      name.className = 'commonness-name';
      name.textContent = group.type === 'word'
        ? group.displayName.charAt(0).toUpperCase() + group.displayName.slice(1)
        : group.displayName;
      header.appendChild(name);

      const count = document.createElement('span');
      count.className = 'commonness-count';
      count.textContent = group.type === 'exact'
        ? `${group.colors.length} libraries`
        : `${group.colors.length} colors`;
      header.appendChild(count);

      div.appendChild(header);

      const swatches = document.createElement('div');
      swatches.className = 'commonness-swatches';

      for (const color of group.colors) {
        const sw = document.createElement('span');
        sw.className = 'commonness-swatch';
        sw.innerHTML = `<span class="commonness-swatch-dot" style="background:${color.hex}"></span>${escapeHtml(group.type === 'exact' ? color.library : color.name)} <span style="opacity:0.5">&Delta;E ${color.distance.toFixed(1)}</span>`;
        swatches.appendChild(sw);
      }

      div.appendChild(swatches);
      commonnessList.appendChild(div);
    }
  }

  if (exactMatches.length === 0 && wordMatches.length === 0) {
    commonnessList.innerHTML =
      '<p class="commonness-empty">No shared names in range — try increasing &Delta;E max</p>';
    return;
  }

  renderSection('Exact name matches', exactMatches);
  renderSection('Shared words', wordMatches);
}

// Resize radial on window resize
window.addEventListener('resize', () => {
  if (currentView === 'radial') {
    renderRadial(lastResults, lastTargetLab);
  }
});

// Boot
loadFromHash();
update();
