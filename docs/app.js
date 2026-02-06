const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const sampleBtn = document.getElementById("sampleBtn");
const replaceBtn = document.getElementById("replaceBtn");
const brightnessSlider = document.getElementById("brightness");
const toneSlider = document.getElementById("tone");
const viewAdjustedBtn = document.getElementById("viewAdjusted");
const viewOriginalBtn = document.getElementById("viewOriginal");
const brightnessValue = document.getElementById("brightnessValue");
const toneValue = document.getElementById("toneValue");
const brightnessHint = document.getElementById("brightnessHint");
const toneHint = document.getElementById("toneHint");
const ahaToast = document.getElementById("ahaToast");
const scrollHint = document.getElementById("scrollHint");
const emptyState = document.getElementById("emptyState");
const canvas = document.getElementById("roomCanvas");
const canvasWrap = document.getElementById("canvasWrap");
const stage = document.getElementById("stage");
const loadingOverlay = document.getElementById("loadingOverlay");
const controlsPanel = document.getElementById("controlsPanel");
const sheetToggle = document.getElementById("sheetToggle");

const MOBILE_MEDIA = window.matchMedia("(max-width: 640px), (pointer: coarse)");
let sheetExpanded = false;

const brightnessControl = document.getElementById("brightnessControl");
const toneControl = document.getElementById("toneControl");

const ctx = canvas.getContext("2d", { willReadFrequently: true });

let originalImageData = null;
let outputImageData = null;
let showOriginal = false;
const DEFAULT_BRIGHTNESS = 70;
const DEFAULT_TONE = 0;
let adjustedBrightness = DEFAULT_BRIGHTNESS;
let adjustedTone = DEFAULT_TONE;
let toneUnlocked = false;
let rafPending = false;
let hasShownAha = false;
let ahaTimer = null;

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 800;

function lerp(min, max, t) {
  return min + (max - min) * t;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function setControlsEnabled(enabled) {
  brightnessSlider.disabled = !enabled;
  toneSlider.disabled = !enabled || !toneUnlocked;
  replaceBtn.disabled = !enabled;
  viewAdjustedBtn.disabled = !enabled;
  viewOriginalBtn.disabled = !enabled;
  if (sheetToggle) sheetToggle.disabled = !enabled;

  brightnessControl.dataset.disabled = enabled ? "false" : "true";
  toneControl.dataset.disabled = enabled && toneUnlocked ? "false" : "true";
  if (!enabled) {
    setScrollHint(false);
    toneUnlocked = false;
    toneSlider.value = String(DEFAULT_TONE);
    updateSliderLabels();
    if (toneHint) toneHint.classList.add("is-hidden");
    if (brightnessHint) brightnessHint.classList.remove("is-hidden");
  }
}

function updateBeforeAfterUI() {
  if (showOriginal) {
    viewOriginalBtn.classList.add("is-active");
    viewAdjustedBtn.classList.remove("is-active");
    viewOriginalBtn.setAttribute("aria-selected", "true");
    viewAdjustedBtn.setAttribute("aria-selected", "false");
  } else {
    viewAdjustedBtn.classList.add("is-active");
    viewOriginalBtn.classList.remove("is-active");
    viewAdjustedBtn.setAttribute("aria-selected", "true");
    viewOriginalBtn.setAttribute("aria-selected", "false");
  }
}

function updateSliderLabels() {
  const brightness = Number(brightnessSlider.value);
  let brightnessLabel = "Medium";
  if (brightness <= 20) brightnessLabel = "Very Dim";
  else if (brightness <= 45) brightnessLabel = "Dim";
  else if (brightness <= 75) brightnessLabel = "Medium";
  else brightnessLabel = "Bright";

  const tone = Number(toneSlider.value);
  let toneLabel = "Neutral";
  if (tone < -35) toneLabel = "Warm";
  if (tone > 35) toneLabel = "Cool";

  brightnessValue.textContent = brightnessLabel;
  toneValue.textContent = toneLabel;
}

function showAhaToast() {
  if (!ahaToast) return;
  ahaToast.classList.add("is-visible");
  if (ahaTimer) window.clearTimeout(ahaTimer);
  ahaTimer = window.setTimeout(() => {
    ahaToast.classList.remove("is-visible");
  }, 2000);
}

function unlockTone() {
  if (toneUnlocked) return;
  toneUnlocked = true;
  toneControl.dataset.disabled = "false";
  toneSlider.disabled = false;
  if (toneHint) toneHint.classList.remove("is-hidden");
  if (brightnessHint) brightnessHint.classList.add("is-hidden");
}

function setLoading(visible) {
  if (!loadingOverlay) return;
  loadingOverlay.classList.toggle("is-visible", visible);
}

function setScrollHint(visible) {
  if (!scrollHint) return;
  scrollHint.classList.toggle("is-visible", visible);
}

function setSheetState(expanded) {
  if (!controlsPanel) return;
  sheetExpanded = expanded;
  controlsPanel.classList.toggle("is-expanded", expanded);
  controlsPanel.classList.toggle("is-collapsed", !expanded);
}

function initSheetState() {
  if (MOBILE_MEDIA.matches) {
    setSheetState(false);
  } else {
    setSheetState(true);
  }
}

function maybeHideScrollHint() {
  if (!scrollHint || !controlsPanel) return;
  const rect = controlsPanel.getBoundingClientRect();
  if (rect.top < window.innerHeight - 40) {
    setScrollHint(false);
  }
}

function scheduleRender() {
  if (rafPending || !originalImageData) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

function render() {
  if (!originalImageData) return;

  if (showOriginal) {
    ctx.putImageData(originalImageData, 0, 0);
    return;
  }

  const brightness = Number(brightnessSlider.value) / 100;
  const tone = Number(toneSlider.value) / 100;

  const exposure = lerp(0.3, 1.15, brightness);
  const contrast = lerp(1.15, 0.95, brightness);
  const gamma = lerp(1.25, 1.0, brightness);

  const rMul = 1 - 0.08 * tone;
  const gMul = 1 - 0.02 * tone;
  const bMul = 1 + 0.1 * tone;

  const src = originalImageData.data;
  const out = outputImageData.data;

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i] / 255;
    let g = src[i + 1] / 255;
    let b = src[i + 2] / 255;

    r *= rMul;
    g *= gMul;
    b *= bMul;

    r *= exposure;
    g *= exposure;
    b *= exposure;

    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    r = Math.pow(Math.max(r, 0), gamma);
    g = Math.pow(Math.max(g, 0), gamma);
    b = Math.pow(Math.max(b, 0), gamma);

    out[i] = Math.round(clamp(r) * 255);
    out[i + 1] = Math.round(clamp(g) * 255);
    out[i + 2] = Math.round(clamp(b) * 255);
    out[i + 3] = src[i + 3];
  }

  ctx.putImageData(outputImageData, 0, 0);
}

function resetControls() {
  adjustedBrightness = DEFAULT_BRIGHTNESS;
  adjustedTone = DEFAULT_TONE;
  brightnessSlider.value = String(DEFAULT_BRIGHTNESS);
  toneSlider.value = String(DEFAULT_TONE);
  showOriginal = false;
  updateBeforeAfterUI();
  updateSliderLabels();
  if (!toneUnlocked) {
    if (brightnessHint) brightnessHint.classList.remove("is-hidden");
    if (toneHint) toneHint.classList.add("is-hidden");
  }
  scheduleRender();
}

function applyImageSource(imageSource) {
  const { width, height } = imageSource;
  const scale = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height, 1);
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);
  originalImageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  outputImageData = ctx.createImageData(targetWidth, targetHeight);

  emptyState.style.display = "none";
  document.body.classList.add("has-photo");
  toneUnlocked = false;
  hasShownAha = false;
  setControlsEnabled(true);
  resetControls();
  setLoading(false);
  setScrollHint(true);
  initSheetState();
}

async function loadImage(file) {
  if (!file) return;
  setLoading(true);

  let imageSource;
  try {
    if ("createImageBitmap" in window) {
      imageSource = await createImageBitmap(file);
    }
  } catch (error) {
    imageSource = null;
  }

  if (!imageSource) {
    imageSource = await loadImageElement(file);
  }

  applyImageSource(imageSource);
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
    img.src = url;
  });
}

const SAMPLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="wall" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#f7f4ef"/>
      <stop offset="100%" stop-color="#ece5d9"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#d5c3ad"/>
      <stop offset="100%" stop-color="#c2a88e"/>
    </linearGradient>
    <linearGradient id="window" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#cfe6f7"/>
      <stop offset="100%" stop-color="#a8c9e8"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#wall)"/>
  <rect y="520" width="1200" height="280" fill="url(#floor)"/>
  <rect x="140" y="110" width="280" height="220" rx="16" fill="url(#window)" stroke="#d2dee8" stroke-width="12"/>
  <rect x="470" y="350" width="520" height="180" rx="24" fill="#d9c3aa"/>
  <rect x="510" y="300" width="440" height="80" rx="20" fill="#e6d2bc"/>
  <rect x="540" y="520" width="380" height="40" rx="20" fill="#b6926e"/>
  <circle cx="940" cy="270" r="50" fill="#f0d8b8"/>
  <rect x="910" y="320" width="60" height="200" rx="18" fill="#c9b39a"/>
  <rect x="910" y="520" width="60" height="10" fill="#a58c70"/>
  <rect x="80" y="460" width="120" height="160" rx="20" fill="#3f6b60"/>
  <circle cx="140" cy="430" r="70" fill="#4f7d6f"/>
  <circle cx="110" cy="410" r="40" fill="#5a8b7c"/>
  <circle cx="175" cy="410" r="35" fill="#5a8b7c"/>
</svg>
`;
const SAMPLE_IMAGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(SAMPLE_SVG)}`;

async function loadSampleImage() {
  setLoading(true);
  try {
    const imageSource = await loadImageFromUrl(SAMPLE_IMAGE_URL);
    applyImageSource(imageSource);
  } catch (error) {
    setLoading(false);
    alert("Unable to load the sample image. Please try again.");
  }
}

function handleFiles(files) {
  const file = files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please upload an image file.");
    return;
  }

  loadImage(file).catch(() => {
    setLoading(false);
    alert("Unable to load that image. Please try another.");
  });
}

uploadBtn.addEventListener("click", () => fileInput.click());
replaceBtn.addEventListener("click", () => fileInput.click());
sampleBtn.addEventListener("click", () => loadSampleImage());

fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  fileInput.value = "";
});

function handleSliderInput() {
  if (showOriginal) {
    showOriginal = false;
    updateBeforeAfterUI();
  }
  setScrollHint(false);
  const brightness = Number(brightnessSlider.value);
  adjustedBrightness = brightness;
  if (!toneUnlocked) {
    unlockTone();
  }
  if (!hasShownAha && brightness <= 40) {
    hasShownAha = true;
    showAhaToast();
  }
  updateSliderLabels();
  scheduleRender();
}

brightnessSlider.addEventListener("input", handleSliderInput);

function handleToneInput() {
  if (showOriginal) {
    showOriginal = false;
    updateBeforeAfterUI();
    brightnessSlider.value = String(adjustedBrightness);
  }
  adjustedTone = Number(toneSlider.value);
  if (toneHint) toneHint.classList.add("is-hidden");
  updateSliderLabels();
  scheduleRender();
}

toneSlider.addEventListener("input", handleToneInput);

viewAdjustedBtn.addEventListener("click", () => {
  showOriginal = false;
  brightnessSlider.value = String(adjustedBrightness);
  toneSlider.value = String(adjustedTone);
  updateBeforeAfterUI();
  updateSliderLabels();
  scheduleRender();
});

viewOriginalBtn.addEventListener("click", () => {
  if (!showOriginal) {
    adjustedBrightness = Number(brightnessSlider.value);
    adjustedTone = Number(toneSlider.value);
  }
  showOriginal = true;
  brightnessSlider.value = String(DEFAULT_BRIGHTNESS);
  toneSlider.value = String(DEFAULT_TONE);
  updateBeforeAfterUI();
  updateSliderLabels();
  scheduleRender();
});

window.addEventListener("scroll", maybeHideScrollHint, { passive: true });

if (scrollHint) {
  scrollHint.addEventListener("click", () => {
    if (controlsPanel) {
      controlsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setScrollHint(false);
  });
}

if (sheetToggle) {
  sheetToggle.addEventListener("click", () => {
    if (!MOBILE_MEDIA.matches) return;
    setSheetState(!sheetExpanded);
  });
}

if (MOBILE_MEDIA.addEventListener) {
  MOBILE_MEDIA.addEventListener("change", initSheetState);
} else if (MOBILE_MEDIA.addListener) {
  MOBILE_MEDIA.addListener(initSheetState);
}

[stage, canvasWrap].forEach((element) => {
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("dragging");
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("dragging");
  });

  element.addEventListener("drop", (event) => {
    event.preventDefault();
    element.classList.remove("dragging");
    if (event.dataTransfer?.files?.length) {
      handleFiles(event.dataTransfer.files);
    }
  });
});

setControlsEnabled(false);
updateBeforeAfterUI();
updateSliderLabels();
initSheetState();
