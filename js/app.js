import { cmykToRgb, rgbToHex, luminance, rgbToHsv, hsvToRgb, rgbToCmyk, rgbToLab } from './color-convert.js';
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
const suggestedNameEl = document.getElementById('suggested-name-value');

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
const enabledLibraries = new Set(libraries.map((l) => l.name));
let currentView = 'list';
let lastResults = [];
let lastTargetLab = [0, 0, 0];

// Initialize color database
init();

// Build library filter buttons
for (const lib of libraries) {
  const btn = document.createElement('button');
  btn.className = 'filter-btn active';
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
  suggestedNameEl.textContent = generateSuggestedName(results);
}

// Generate a suggested color name from nearby results (always 2+ words)
function generateSuggestedName(results) {
  if (results.length === 0) return '—';

  // If the closest match is very close (deltaE < 2) AND has 2+ words, use it
  if (results[0].distance < 2 && results[0].name.trim().split(/\s+/).length >= 2) {
    return results[0].name;
  }

  // Use only the closest results (within delta 15 or top 30, whichever is smaller)
  const nearby = results.filter(r => r.distance <= 15).slice(0, 30);
  if (nearby.length === 0 && results.length > 0) {
    // Nothing within 15, use top 10 anyway
    nearby.push(...results.slice(0, 10));
  }

  // Weight each color inversely by distance (closer = more influence)
  const wordScores = new Map();
  const filler = new Set(['a', 'an', 'the', 'of', 'de', 'du', 'no', 'is', 'in', 'at', 'to', 'and', 'or', 'with', 'ral', 'ntc', 'css']);

  const modifiers = new Set([
    'light', 'dark', 'pale', 'deep', 'bright', 'vivid', 'muted', 'soft',
    'warm', 'cool', 'hot', 'rich', 'dusty', 'smoky', 'pastel', 'neon',
    'medium', 'electric', 'royal', 'baby', 'old', 'true', 'pure',
    'burnt', 'raw', 'french', 'indian', 'persian', 'chinese', 'japanese',
  ]);

  for (const color of nearby) {
    const weight = 1 / (1 + color.distance);
    const words = color.name.toLowerCase()
      .replace(/[''`]/g, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => w.length >= 2 && !filler.has(w));

    for (const word of words) {
      const prev = wordScores.get(word) || { score: 0, count: 0 };
      wordScores.set(word, { score: prev.score + weight, count: prev.count + 1 });
    }
  }

  // Separate into modifier words and base words
  const modWords = [];
  const baseWords = [];
  for (const [word, data] of wordScores) {
    if (data.count < 2) continue;
    const entry = { word, score: data.score, count: data.count };
    if (modifiers.has(word)) {
      modWords.push(entry);
    } else {
      baseWords.push(entry);
    }
  }

  modWords.sort((a, b) => b.score - a.score);
  baseWords.sort((a, b) => b.score - a.score);

  // Build the name: must be at least 2 words
  const parts = [];

  if (modWords.length > 0 && baseWords.length > 0) {
    // modifier + base
    parts.push(modWords[0].word);
    parts.push(baseWords[0].word);
    // Optional third word if strong enough
    if (baseWords.length > 1 && baseWords[1].score > baseWords[0].score * 0.6) {
      parts.push(baseWords[1].word);
    }
  } else if (baseWords.length >= 2) {
    // two base words
    parts.push(baseWords[0].word);
    parts.push(baseWords[1].word);
  } else if (modWords.length >= 2) {
    // two modifiers (rare but possible)
    parts.push(modWords[0].word);
    parts.push(modWords[1].word);
  } else if (baseWords.length === 1 && modWords.length === 0) {
    // Only one base word — pull a modifier from single-occurrence words
    parts.push(baseWords[0].word);
    // Find best single-occurrence modifier to pair with
    const singleMods = [];
    for (const [word, data] of wordScores) {
      if (modifiers.has(word) && !parts.includes(word)) {
        singleMods.push({ word, score: data.score });
      }
    }
    singleMods.sort((a, b) => b.score - a.score);
    if (singleMods.length > 0) {
      parts.unshift(singleMods[0].word);
    }
  }

  // If we still have < 2 words, fall back to the closest 2+ word name
  if (parts.length < 2) {
    for (const r of results) {
      if (r.name.trim().split(/\s+/).length >= 2) {
        return r.name;
      }
    }
    // Last resort: closest name even if 1 word
    return results[0].name;
  }

  return parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
