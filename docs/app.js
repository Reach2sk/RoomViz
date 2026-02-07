const APP_VERSION = "1.4";

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const sampleBtn = document.getElementById("sampleBtn");
const replaceBtn = document.getElementById("replaceBtn");
const brightnessSlider = document.getElementById("brightness");
const toneSlider = document.getElementById("tone");
const viewAdjustedBtn = document.getElementById("viewAdjusted");
const viewOriginalBtn = document.getElementById("viewOriginal");
const viewToggleBtn = document.getElementById("viewToggleBtn");
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
const settingsModal = document.getElementById("settingsModal");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const settingsClose = document.getElementById("settingsClose");
const algoBadge = document.getElementById("algoBadge");
const algoActive = document.getElementById("algoActive");
const algoRadios = Array.from(document.querySelectorAll('input[name="algoVersion"]'));

// Mobile overlay controls
const mobileControls = document.getElementById("mobileControls");
const mcToggle = document.getElementById("mcToggle");
const mcBrightness = document.getElementById("mcBrightness");
const mcBrightnessValue = document.getElementById("mcBrightnessValue");
const mcTone = document.getElementById("mcTone");
const mcToneValue = document.getElementById("mcToneValue");

const MOBILE_MEDIA = window.matchMedia("(max-width: 640px), (pointer: coarse)");
let sheetExpanded = false;
let autoCollapseTimer = null;
const AUTO_COLLAPSE_MS = 2600;
let mcExpanded = false;
let mcAutoTimer = null;
const MC_AUTO_MS = 2600;

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
let isSamplePhoto = false;
let rafPending = false;
let hasShownAha = false;
let ahaTimer = null;

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 800;
const ALGO_KEY = "roomviz_algo_version";
const DEFAULT_ALGO = "v1";
let currentAlgo = DEFAULT_ALGO;
let lastRenderedAlgo = null;

function lerp(min, max, t) {
  return min + (max - min) * t;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function setControlsEnabled(enabled) {
  brightnessSlider.disabled = !enabled;
  toneSlider.disabled = !enabled;
  replaceBtn.disabled = !enabled;
  viewAdjustedBtn.disabled = !enabled;
  viewOriginalBtn.disabled = !enabled;
  if (viewToggleBtn) viewToggleBtn.disabled = !enabled;
  if (sheetToggle) sheetToggle.disabled = !enabled;

  // Mobile controls
  if (mcBrightness) mcBrightness.disabled = !enabled;
  if (mcTone) mcTone.disabled = !enabled;
  if (mcToggle) mcToggle.disabled = !enabled;

  brightnessControl.dataset.disabled = enabled ? "false" : "true";
  toneControl.dataset.disabled = enabled ? "false" : "true";
  if (!enabled) {
    setScrollHint(false);
    toneSlider.value = String(DEFAULT_TONE);
    if (mcTone) mcTone.value = String(DEFAULT_TONE);
    updateSliderLabels();
    if (toneHint) toneHint.classList.add("is-hidden");
    if (brightnessHint) brightnessHint.classList.remove("is-hidden");
    setMobileControls(false);
  }
}

function updateBeforeAfterUI() {
  if (showOriginal) {
    viewOriginalBtn.classList.add("is-active");
    viewAdjustedBtn.classList.remove("is-active");
    viewOriginalBtn.setAttribute("aria-selected", "true");
    viewAdjustedBtn.setAttribute("aria-selected", "false");
    if (viewToggleBtn) viewToggleBtn.textContent = "Adjusted";
  } else {
    viewAdjustedBtn.classList.add("is-active");
    viewOriginalBtn.classList.remove("is-active");
    viewAdjustedBtn.setAttribute("aria-selected", "true");
    viewOriginalBtn.setAttribute("aria-selected", "false");
    if (viewToggleBtn) viewToggleBtn.textContent = "Original";
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

  // Sync mobile overlay labels
  if (mcBrightnessValue) mcBrightnessValue.textContent = brightnessLabel;
  if (mcToneValue) mcToneValue.textContent = toneLabel;
}

/** Keep both slider sets in sync */
function syncSliders(source) {
  if (source === "desktop") {
    if (mcBrightness) mcBrightness.value = brightnessSlider.value;
    if (mcTone) mcTone.value = toneSlider.value;
  } else {
    brightnessSlider.value = mcBrightness ? mcBrightness.value : brightnessSlider.value;
    toneSlider.value = mcTone ? mcTone.value : toneSlider.value;
  }
}

function showAhaToast() {
  if (!ahaToast) return;
  ahaToast.classList.add("is-visible");
  if (ahaTimer) window.clearTimeout(ahaTimer);
  ahaTimer = window.setTimeout(() => {
    ahaToast.classList.remove("is-visible");
  }, 2000);
}

const ALGO_LABELS = {
  v1: "v1.0",
  v2: "v2.0",
};

function getAlgoVersion() {
  const stored = localStorage.getItem(ALGO_KEY);
  return ALGO_LABELS[stored] ? stored : DEFAULT_ALGO;
}

function setAlgoVersion(version, persist = true) {
  const next = ALGO_LABELS[version] ? version : DEFAULT_ALGO;
  currentAlgo = next;
  if (persist) {
    localStorage.setItem(ALGO_KEY, next);
  }
  if (algoBadge) {
    algoBadge.textContent = `Algo ${ALGO_LABELS[next]}`;
  }
  algoRadios.forEach((radio) => {
    radio.checked = radio.value === next;
  });
  scheduleRender();
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
  if (autoCollapseTimer) {
    window.clearTimeout(autoCollapseTimer);
    autoCollapseTimer = null;
  }
  if (expanded) {
    scheduleAutoCollapse();
  }
}

function initSheetState() {
  if (MOBILE_MEDIA.matches) {
    setSheetState(false);
    setMobileControls(false);
  } else {
    setSheetState(true);
  }
}

function setMobileControls(expanded) {
  if (!mobileControls) return;
  mcExpanded = expanded;
  mobileControls.classList.toggle("is-expanded", expanded);
  mobileControls.classList.toggle("is-collapsed", !expanded);
  if (mcAutoTimer) {
    window.clearTimeout(mcAutoTimer);
    mcAutoTimer = null;
  }
  if (expanded) {
    scheduleMobileCollapse();
  }
}

function scheduleMobileCollapse() {
  if (!MOBILE_MEDIA.matches || !mcExpanded) return;
  if (mcAutoTimer) window.clearTimeout(mcAutoTimer);
  mcAutoTimer = window.setTimeout(() => {
    setMobileControls(false);
  }, MC_AUTO_MS);
}

function scheduleAutoCollapse() {
  if (!MOBILE_MEDIA.matches || !sheetExpanded) return;
  if (autoCollapseTimer) window.clearTimeout(autoCollapseTimer);
  autoCollapseTimer = window.setTimeout(() => {
    setSheetState(false);
  }, AUTO_COLLAPSE_MS);
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

function applyLightingV1(src, out, brightness, toneSelectionValue) {
  lastRenderedAlgo = "v1";
  const exposure = lerp(0.35, 1.12, brightness);
  const contrast = lerp(1.12, 0.98, brightness);
  const gamma = lerp(1.25, 1.0, brightness);

  const tone = toneSelectionValue * 0.7;
  const rMul = 1 - 0.07 * tone;
  const gMul = 1 - 0.02 * tone;
  const bMul = 1 + 0.09 * tone;

  for (let i = 0; i < src.length; i += 4) {
    const or = src[i] / 255;
    const og = src[i + 1] / 255;
    const ob = src[i + 2] / 255;

    let r = or * rMul;
    let g = og * gMul;
    let b = ob * bMul;

    r *= exposure;
    g *= exposure;
    b *= exposure;

    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    r = Math.pow(Math.max(r, 0), gamma);
    g = Math.pow(Math.max(g, 0), gamma);
    b = Math.pow(Math.max(b, 0), gamma);

    const luma = 0.2126 * or + 0.7152 * og + 0.0722 * ob;
    const protect = smoothstep(0.75, 0.95, luma);

    r = r * (1 - protect) + or * protect;
    g = g * (1 - protect) + og * protect;
    b = b * (1 - protect) + ob * protect;

    out[i] = Math.round(clamp(r) * 255);
    out[i + 1] = Math.round(clamp(g) * 255);
    out[i + 2] = Math.round(clamp(b) * 255);
    out[i + 3] = src[i + 3];
  }
}

function applyLightingV2(src, out, brightness, toneSelectionValue, variant = "v2") {
  lastRenderedAlgo = variant === "v3" ? "v3" : "v2";
  const baseExposure = lerp(0.28, 1.1, brightness);
  const baseContrast = lerp(1.12, 0.98, brightness);
  const shadowBoost = lerp(0.5, 0.0, brightness);
  const gamma = lerp(1.32, 1.0, brightness);

  const tone = toneSelectionValue;

  for (let i = 0; i < src.length; i += 4) {
    const or = src[i] / 255;
    const og = src[i + 1] / 255;
    const ob = src[i + 2] / 255;

    const luma = 0.2126 * or + 0.7152 * og + 0.0722 * ob;
    const daylight = smoothstep(0.62, 0.92, luma);
    const interior = 1 - daylight;
    const region = lerp(0.45, 1.0, interior);

    const exposure = 1 + (baseExposure - 1) * region;
    const contrast = 1 + (baseContrast - 1) * region;

    const shadow = Math.pow(1 - luma, 1.4);
    const shadowFactor = 1 - shadowBoost * shadow * region;

    let r = or * exposure * shadowFactor;
    let g = og * exposure * shadowFactor;
    let b = ob * exposure * shadowFactor;

    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    r = Math.pow(Math.max(r, 0), gamma);
    g = Math.pow(Math.max(g, 0), gamma);
    b = Math.pow(Math.max(b, 0), gamma);

    const toneStrength = (variant === "v3" ? 0.22 : 0.16) * region;
    const rMul = 1 - 0.12 * tone * toneStrength;
    const gMul = 1 - 0.04 * tone * toneStrength;
    const bMul = 1 + 0.18 * tone * toneStrength;

    r *= rMul;
    g *= gMul;
    b *= bMul;

    const protect = smoothstep(0.7, 0.95, luma);
    r = r * (1 - protect) + or * protect;
    g = g * (1 - protect) + og * protect;
    b = b * (1 - protect) + ob * protect;

    out[i] = Math.round(clamp(r) * 255);
    out[i + 1] = Math.round(clamp(g) * 255);
    out[i + 2] = Math.round(clamp(b) * 255);
    out[i + 3] = src[i + 3];
  }
}

function applyLightingV3(src, out, brightness, toneSelectionValue) {
  applyLightingV2(src, out, brightness, toneSelectionValue, "v3");
}

function render() {
  if (!originalImageData) return;

  if (showOriginal) {
    ctx.putImageData(originalImageData, 0, 0);
    return;
  }

  const brightness = Number(brightnessSlider.value) / 100;
  const tone = Number(toneSlider.value) / 100;

  const src = originalImageData.data;
  const out = outputImageData.data;

  const algo = currentAlgo;
  if (algo === "v2") {
    applyLightingV2(src, out, brightness, tone);
  } else if (algo === "v3") {
    applyLightingV3(src, out, brightness, tone);
  } else {
    applyLightingV1(src, out, brightness, tone);
  }

  if (algoActive && lastRenderedAlgo) {
    const label = ALGO_LABELS[lastRenderedAlgo] ?? lastRenderedAlgo;
    if (algoActive.textContent !== label) {
      algoActive.textContent = label;
    }
  }

  ctx.putImageData(outputImageData, 0, 0);
}

function hideSampleBanner() {
  const banner = document.getElementById("sampleBanner");
  if (banner && banner.style.display !== "none") {
    banner.style.display = "none";
  }
}

function resetControls() {
  adjustedBrightness = DEFAULT_BRIGHTNESS;
  adjustedTone = DEFAULT_TONE;
  brightnessSlider.value = String(DEFAULT_BRIGHTNESS);
  toneSlider.value = String(DEFAULT_TONE);
  if (mcBrightness) mcBrightness.value = String(DEFAULT_BRIGHTNESS);
  if (mcTone) mcTone.value = String(DEFAULT_TONE);
  showOriginal = false;
  updateBeforeAfterUI();
  updateSliderLabels();
  if (toneHint) toneHint.classList.add("is-hidden");
  if (brightnessHint) brightnessHint.classList.remove("is-hidden");
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
  hasShownAha = false;
  setControlsEnabled(true);
  resetControls();
  setLoading(false);
  setScrollHint(true);
  initSheetState();
  setMobileControls(false);

  const banner = document.getElementById("sampleBanner");
  if (banner) {
    banner.style.display = isSamplePhoto ? "flex" : "none";
  }
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

const SAMPLE_LANDSCAPE = "sample.jpg";
const SAMPLE_PORTRAIT = "sample-portrait.jpg";

function getSampleUrl() {
  return MOBILE_MEDIA.matches ? SAMPLE_PORTRAIT : SAMPLE_LANDSCAPE;
}

async function loadSampleImage() {
  setLoading(true);
  isSamplePhoto = true;
  try {
    const imageSource = await loadImageFromUrl(getSampleUrl());
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

  isSamplePhoto = false;
  loadImage(file).catch(() => {
    setLoading(false);
    alert("Unable to load that image. Please try another.");
  });
}

uploadBtn.addEventListener("click", () => fileInput.click());
replaceBtn.addEventListener("click", () => fileInput.click());
sampleBtn.addEventListener("click", () => loadSampleImage());

const uploadOwnBtn = document.getElementById("uploadOwnBtn");
if (uploadOwnBtn) {
  uploadOwnBtn.addEventListener("click", () => fileInput.click());
}

fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  fileInput.value = "";
});

// === Shared slider handler logic ===

function handleBrightnessChange(source) {
  if (showOriginal) {
    showOriginal = false;
    updateBeforeAfterUI();
  }
  setScrollHint(false);
  hideSampleBanner();
  scheduleAutoCollapse();
  scheduleMobileCollapse();

  syncSliders(source);

  const brightness = Number(brightnessSlider.value);
  adjustedBrightness = brightness;
  if (!hasShownAha && brightness <= 40) {
    hasShownAha = true;
    showAhaToast();
  }
  updateSliderLabels();
  scheduleRender();
}

function handleToneChange(source) {
  if (showOriginal) {
    showOriginal = false;
    updateBeforeAfterUI();
  }
  hideSampleBanner();
  scheduleAutoCollapse();
  scheduleMobileCollapse();

  syncSliders(source);
  adjustedBrightness = Number(brightnessSlider.value);
  adjustedTone = Number(toneSlider.value);
  updateSliderLabels();
  if (toneHint) toneHint.classList.add("is-hidden");
  scheduleRender();
}

// Desktop slider listeners
brightnessSlider.addEventListener("input", () => handleBrightnessChange("desktop"));
toneSlider.addEventListener("input", () => handleToneChange("desktop"));

// Mobile overlay slider listeners
if (mcBrightness) {
  mcBrightness.addEventListener("input", () => handleBrightnessChange("mobile"));
}
if (mcTone) {
  mcTone.addEventListener("input", () => handleToneChange("mobile"));
}

viewAdjustedBtn.addEventListener("click", () => {
  showOriginal = false;
  brightnessSlider.value = String(adjustedBrightness);
  toneSlider.value = String(adjustedTone);
  syncSliders("desktop");
  updateSliderLabels();
  updateBeforeAfterUI();
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
  syncSliders("desktop");
  updateSliderLabels();
  updateBeforeAfterUI();
  scheduleRender();
});

if (viewToggleBtn) {
  viewToggleBtn.addEventListener("click", () => {
    if (showOriginal) {
      viewAdjustedBtn.click();
    } else {
      viewOriginalBtn.click();
    }
  });
}

const openSettings = () => {
  if (!settingsModal) return;
  settingsModal.classList.add("is-open");
  settingsModal.setAttribute("aria-hidden", "false");
};

const closeSettings = () => {
  if (!settingsModal) return;
  settingsModal.classList.remove("is-open");
  settingsModal.setAttribute("aria-hidden", "true");
};

if (algoBadge) {
  algoBadge.addEventListener("click", openSettings);
  algoBadge.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSettings();
    }
  });
}

if (settingsBackdrop) settingsBackdrop.addEventListener("click", closeSettings);
if (settingsClose) settingsClose.addEventListener("click", closeSettings);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSettings();
});

algoRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (radio.checked) setAlgoVersion(radio.value);
  });
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

if (mcToggle) {
  mcToggle.addEventListener("click", () => {
    if (!MOBILE_MEDIA.matches) return;
    setMobileControls(!mcExpanded);
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

updateBeforeAfterUI();
updateSliderLabels();
setAlgoVersion(getAlgoVersion(), false);
initSheetState();
setMobileControls(false);

// Auto-load sample photo on startup
loadSampleImage();

console.log("Room Viz " + APP_VERSION);
