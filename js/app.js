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
const radialCanvas = document.getElementById('radial-canvas');
const radialCtx = radialCanvas.getContext('2d');
const viewTabs = document.querySelectorAll('.view-tab');

for (const tab of viewTabs) {
  tab.addEventListener('click', () => {
    for (const t of viewTabs) t.classList.remove('active');
    tab.classList.add('active');
    currentView = tab.dataset.view;
    if (currentView === 'list') {
      viewList.style.display = '';
      viewRadial.style.display = 'none';
    } else {
      viewList.style.display = 'none';
      viewRadial.style.display = '';
      renderRadial(lastResults, lastTargetLab);
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

  // Draw subtle range rings
  radialCtx.strokeStyle = 'rgba(0,0,0,0.06)';
  radialCtx.lineWidth = 1;
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
  radialCtx.lineWidth = 1.5;
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
    radialCtx.lineWidth = 1;
    radialCtx.stroke();

    // Draw name below
    radialCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    radialCtx.font = `${fontSize}px -apple-system, sans-serif`;
    radialCtx.textAlign = 'center';
    radialCtx.textBaseline = 'top';
    const label = color.name.length > 16 ? color.name.slice(0, 15) + '…' : color.name;
    radialCtx.fillText(label, x, y + swatchSize / 2 + labelPad);
  }
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
