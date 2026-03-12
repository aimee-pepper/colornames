import { cmykToRgb, rgbToHex, luminance, rgbToHsv, hsvToRgb, rgbToCmyk } from './color-convert.js';
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
  renderResults(results);
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

// Boot
loadFromHash();
update();
