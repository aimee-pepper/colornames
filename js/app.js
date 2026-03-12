import { cmykToRgb, rgbToHex, luminance } from './color-convert.js';
import { init, findClosest, libraries, getColorCount } from './color-search.js';

// DOM elements
const preview = document.getElementById('preview');
const previewHex = document.getElementById('preview-hex');
const hexInput = document.getElementById('hex-input');
const copyBtn = document.getElementById('copy-hex');
const rgbValue = document.getElementById('rgb-value');
const resultsList = document.getElementById('results-list');
const filterContainer = document.getElementById('filter-buttons');

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

  // Find closest colors
  const results = findClosest(c, m, y, k, 20, enabledLibraries);
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
