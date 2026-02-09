const LAB_BUILD = "20260209-38";

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const replaceBtn = document.getElementById("replaceBtn");
const emptyState = document.getElementById("emptyState");
const loadingOverlay = document.getElementById("loadingOverlay");
const canvas = document.getElementById("roomCanvas");
const canvasWrap = document.getElementById("canvasWrap");
const stage = document.getElementById("stage");
const controlsPanel = document.getElementById("controlsPanel");
const sheetToggle = document.getElementById("sheetToggle");

const viewAdjustedBtn = document.getElementById("viewAdjusted");
const viewOriginalBtn = document.getElementById("viewOriginal");

const capabilitySelect = document.getElementById("capability");
const capabilityValue = document.getElementById("capabilityValue");
const brightnessSlider = document.getElementById("brightness");
const brightnessState = document.getElementById("brightnessState");
const warmthSlider = document.getElementById("warmth");
const warmthValue = document.getElementById("warmthValue");
const limitMsg = document.getElementById("limitMsg");

const dimToWarmControl = document.getElementById("dimToWarmControl");
const dimToWarmToggle = document.getElementById("dimToWarm");

// Mobile overlay controls
const mobileControls = document.getElementById("mobileControls");
const mcToggle = document.getElementById("mcToggle");
const mcCapability = document.getElementById("mcCapability");
const mcCapabilityValue = document.getElementById("mcCapabilityValue");
const mcBrightness = document.getElementById("mcBrightness");
const mcBrightnessState = document.getElementById("mcBrightnessState");
const mcLimitMsg = document.getElementById("mcLimitMsg");
const mcWarmthValue = document.getElementById("mcWarmthValue");
const mcWarmth = document.getElementById("mcWarmth");
const mcDimToWarmRow = document.getElementById("mcDimToWarmRow");
const mcDimToWarm = document.getElementById("mcDimToWarm");
const mcDimToWarmHint = document.getElementById("mcDimToWarmHint");

const MOBILE_MEDIA = window.matchMedia("(max-width: 640px), (pointer: coarse)");

const ctx = canvas.getContext("2d", { willReadFrequently: true });

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 800;
const DEFAULT_BRIGHTNESS = 80;
const DEFAULT_WARMTH = 0; // slider: -100 warm .. 0 neutral .. +100 cool

const CAPABILITIES = {
  standard: {
    label: "Standard LED",
    minOutput: 0.05,
    warmth: { warmMin: 2700, coolMax: 7500 },
    allowDimToWarm: false,
  },
  deep: {
    label: "Deep Dimming",
    minOutput: 0.01,
    warmth: { warmMin: 2700, coolMax: 7500 },
    allowDimToWarm: false,
  },
  ultra: {
    label: "Ultra-Deep + Warm Dim",
    minOutput: 0.001,
    warmth: { warmMin: 1800, coolMax: 6500 },
    allowDimToWarm: true,
    // When enabled, start at "neutral" (no shift) and warm as you dim.
    dimToWarm: { bright: 6500, dim: 1800 },
  },
};

let originalImageData = null;
let outputImageData = null;
let showOriginal = false;
let daylightMask = null;
let midtoneMask = null;

let capability = "standard";
let brightnessUi = DEFAULT_BRIGHTNESS;
let warmthUi = DEFAULT_WARMTH;
let dimToWarm = false;

let hasUsedControls = false;
let rafPending = false;
const CONTROLS_USED_KEY = "roomviz_lab_controls_used";

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function midtoneWeight(luma) {
  const rise = smoothstep(0.2, 0.55, luma);
  const fall = 1 - smoothstep(0.65, 0.92, luma);
  return clamp(rise * fall, 0, 1);
}

function kelvinToRgb(kelvin) {
  const temp = kelvin / 100;
  let r;
  let g;
  let b;

  if (temp <= 66) {
    r = 1;
    g = clamp(0.390081578769 * Math.log(temp) - 0.631841443788, 0, 1);
    if (temp <= 19) {
      b = 0;
    } else {
      b = clamp(0.54320678911 * Math.log(temp - 10) - 1.19625408914, 0, 1);
    }
  } else {
    r = clamp(1.29293618606 * Math.pow(temp - 60, -0.1332047592), 0, 1);
    g = clamp(1.12989086089 * Math.pow(temp - 60, -0.0755148492), 0, 1);
    b = 1;
  }

  return { r, g, b };
}

const NEUTRAL_WB = kelvinToRgb(6500);

function tempMultipliersFromKelvin(kelvin) {
  const wb = kelvinToRgb(clamp(kelvin, 1800, 9000));
  const r = wb.r / NEUTRAL_WB.r;
  const g = wb.g / NEUTRAL_WB.g;
  const b = wb.b / NEUTRAL_WB.b;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Smooth compensation around neutral (6500K) to avoid a "step" at Neutral.
  // tone < 0 => warmer, tone > 0 => cooler.
  const tone = clamp((kelvin - 6500) / 2600, -1, 1);

  // Keep "cool" from feeling like dimming; let warm feel slightly dimmer (perception).
  const coolBoost = 1 + 0.06 * Math.max(tone, 0);
  const warmDim = 1 - 0.12 * Math.max(-tone, 0);
  const gain = clamp((1 / Math.max(lum, 1e-6)) * coolBoost * warmDim, 0.78, 1.38);
  return { r, g, b, gain };
}

function computeDaylightMask(data, width, height) {
  const mask = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max - min;

      const bright = smoothstep(0.82, 0.96, luma);
      const lowSat = 1 - smoothstep(0.08, 0.25, sat);
      mask[y * width + x] = bright * lowSat;
    }
  }
  return mask;
}

function buildMidtoneMask(data, width, height) {
  const mask = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      mask[y * width + x] = midtoneWeight(luma);
    }
  }
  return mask;
}

function setLoading(visible) {
  if (!loadingOverlay) return;
  loadingOverlay.classList.toggle("is-visible", visible);
}

function setMobileControls(expanded) {
  if (!mobileControls) return;
  mobileControls.classList.toggle("is-expanded", expanded);
  mobileControls.classList.toggle("is-collapsed", !expanded);
  if (!hasUsedControls && mcToggle && !expanded) {
    mcToggle.classList.add("is-nudging");
  } else if (mcToggle) {
    mcToggle.classList.remove("is-nudging");
  }
}

function markControlsUsed() {
  if (hasUsedControls) return;
  hasUsedControls = true;
  localStorage.setItem(CONTROLS_USED_KEY, "1");
  if (mcToggle) mcToggle.classList.remove("is-nudging");
}

function updateBeforeAfterUI() {
  if (!viewAdjustedBtn || !viewOriginalBtn) return;
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

function comfortState(outputLevel) {
  if (outputLevel <= 0.02) return "Night-friendly";
  if (outputLevel <= 0.10) return "Comfortable";
  return "Harsh";
}

function effectiveOutput(uiValue) {
  const cap = CAPABILITIES[capability];
  const t = clamp(uiValue / 100, 0, 1);
  const curved = t * t;
  const raw = cap.minOutput + (1 - cap.minOutput) * curved;
  // Standard LED: clamp so slider ≤15 all hit the floor (soft-stop zone).
  const softFloor = capability === "standard" ? 0.07 : cap.minOutput;
  const out = Math.max(raw, softFloor);
  const clamped = raw < softFloor + 1e-6;
  return { out, clamped };
}

function warmthKelvinForSlider(warmthValue, outputLevel) {
  const cap = CAPABILITIES[capability];
  if (cap.allowDimToWarm && dimToWarm) {
    const t = clamp((outputLevel - cap.minOutput) / (1 - cap.minOutput), 0, 1);
    const dimAmt = 1 - t;
    return cap.dimToWarm.bright + (cap.dimToWarm.dim - cap.dimToWarm.bright) * dimAmt;
  }
  const u = clamp(warmthValue / 100, -1, 1);
  if (u < 0) return 6500 + (cap.warmth.warmMin - 6500) * (-u);
  if (u > 0) return 6500 + (cap.warmth.coolMax - 6500) * u;
  return 6500;
}

function setControlsEnabled(enabled) {
  if (capabilitySelect) capabilitySelect.disabled = !enabled;
  if (brightnessSlider) brightnessSlider.disabled = !enabled;
  if (warmthSlider) warmthSlider.disabled = !enabled;
  if (replaceBtn) replaceBtn.disabled = !enabled;
  if (viewAdjustedBtn) viewAdjustedBtn.disabled = !enabled;
  if (viewOriginalBtn) viewOriginalBtn.disabled = !enabled;

  // Mobile
  if (mcToggle) mcToggle.disabled = !enabled;
  if (mcCapability) mcCapability.disabled = !enabled;
  if (mcBrightness) mcBrightness.disabled = !enabled;
  if (mcWarmth) mcWarmth.disabled = !enabled;

  if (!enabled) {
    setMobileControls(false);
  }
}

function updateWarmthUI() {
  const cap = CAPABILITIES[capability];
  const allowDimToWarm = cap.allowDimToWarm;
  const isAuto = allowDimToWarm && dimToWarm;

  const label = isAuto
    ? "Auto"
    : Math.abs(warmthUi) < 8
      ? "Neutral"
      : warmthUi < 0
        ? "Warm"
        : "Cool";

  if (warmthValue) warmthValue.textContent = label;
  if (mcWarmthValue) mcWarmthValue.textContent = label;

  if (dimToWarmControl) dimToWarmControl.classList.toggle("is-hidden", !allowDimToWarm);
  if (mcDimToWarmRow) mcDimToWarmRow.classList.toggle("is-hidden", !allowDimToWarm);
  if (mcDimToWarmHint) mcDimToWarmHint.classList.toggle("is-hidden", !(allowDimToWarm && dimToWarm));

  const disableWarmth = isAuto;
  if (warmthSlider) warmthSlider.disabled = disableWarmth || !originalImageData;
  if (mcWarmth) mcWarmth.disabled = disableWarmth || !originalImageData;

  if (warmthSlider && Number(warmthSlider.value) !== warmthUi) warmthSlider.value = String(warmthUi);
  if (mcWarmth && Number(mcWarmth.value) !== warmthUi) mcWarmth.value = String(warmthUi);
}

function updateCapabilityUI() {
  const cap = CAPABILITIES[capability];
  if (capabilityValue) capabilityValue.textContent = cap.label;
  if (mcCapabilityValue) mcCapabilityValue.textContent = cap.label;
  if (capabilitySelect) capabilitySelect.value = capability;
  if (mcCapability) mcCapability.value = capability;

  if (!cap.allowDimToWarm) dimToWarm = false;
  if (dimToWarmToggle) dimToWarmToggle.checked = dimToWarm;
  if (mcDimToWarm) mcDimToWarm.checked = dimToWarm;

  updateWarmthUI();
}

function updateBrightnessUI(outputLevel, clamped) {
  const state = comfortState(outputLevel);
  if (brightnessState) brightnessState.textContent = state;
  if (mcBrightnessState) mcBrightnessState.textContent = state;

  const showLimit = capability === "standard" && clamped;
  if (limitMsg) limitMsg.classList.toggle("is-hidden", !showLimit);
  if (mcLimitMsg) mcLimitMsg.classList.toggle("is-hidden", !showLimit);
}

function applyModel(src, out, outputLevel, kelvin, uiBrightness) {
  // Model: temperature-based shift, midtone-focused, daylight-protected.
  const exposure = 0.94 + (1.06 - 0.94) * uiBrightness;
  const contrast = 1.12 + (0.98 - 1.12) * uiBrightness;
  const gamma = 1.25 + (1.0 - 1.25) * uiBrightness;

  const tempMul = tempMultipliersFromKelvin(kelvin);

  for (let i = 0; i < src.length; i += 4) {
    const index = i / 4;
    const or = src[i] / 255;
    const og = src[i + 1] / 255;
    const ob = src[i + 2] / 255;

    const luma = 0.2126 * or + 0.7152 * og + 0.0722 * ob;
    const mid = midtoneMask ? midtoneMask[index] : midtoneWeight(luma);
    const daylight = daylightMask ? daylightMask[index] : 0;

    const toneStrength = clamp(0.4 + 0.9 * mid, 0, 1.2) * (1 - daylight * 0.75);
    const scale = 1 + (tempMul.gain - 1) * toneStrength;

    let r = or * (1 + (tempMul.r - 1) * toneStrength) * scale;
    let g = og * (1 + (tempMul.g - 1) * toneStrength) * scale;
    let b = ob * (1 + (tempMul.b - 1) * toneStrength) * scale;

    // Dimming capability: output gain.
    const gain = outputLevel * exposure;
    r *= gain;
    g *= gain;
    b *= gain;

    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    r = Math.pow(Math.max(r, 0), gamma);
    g = Math.pow(Math.max(g, 0), gamma);
    b = Math.pow(Math.max(b, 0), gamma);

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

function render() {
  if (!originalImageData) return;
  if (showOriginal) {
    ctx.putImageData(originalImageData, 0, 0);
    return;
  }

  const { out: outputLevel, clamped } = effectiveOutput(brightnessUi);
  const kelvin = warmthKelvinForSlider(warmthUi, outputLevel);
  const uiBrightness = clamp(brightnessUi / 100, 0, 1);

  updateBrightnessUI(outputLevel, clamped);

  applyModel(originalImageData.data, outputImageData.data, outputLevel, kelvin, uiBrightness);
  ctx.putImageData(outputImageData, 0, 0);
}

function scheduleRender() {
  if (rafPending || !originalImageData) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
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
  setControlsEnabled(true);
  brightnessUi = DEFAULT_BRIGHTNESS;
  warmthUi = DEFAULT_WARMTH;
  dimToWarm = false;
  showOriginal = false;

  daylightMask = computeDaylightMask(originalImageData.data, targetWidth, targetHeight);
  midtoneMask = buildMidtoneMask(originalImageData.data, targetWidth, targetHeight);

  if (brightnessSlider) brightnessSlider.value = String(brightnessUi);
  if (mcBrightness) mcBrightness.value = String(brightnessUi);
  if (warmthSlider) warmthSlider.value = String(warmthUi);
  if (mcWarmth) mcWarmth.value = String(warmthUi);
  updateCapabilityUI();
  updateBeforeAfterUI();
  setLoading(false);
  scheduleRender();

  const actions = document.getElementById("photoActions");
  if (actions) actions.style.display = "flex";
}

async function loadImage(file) {
  if (!file) return;
  setLoading(true);

  let imageSource;
  try {
    if ("createImageBitmap" in window) {
      imageSource = await createImageBitmap(file);
    }
  } catch {
    imageSource = null;
  }

  if (!imageSource) {
    imageSource = await new Promise((resolve, reject) => {
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

  applyImageSource(imageSource);
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

async function loadSampleImage() {
  setLoading(true);
  try {
    const img = new Image();
    img.onload = () => applyImageSource(img);
    img.onerror = () => {
      setLoading(false);
      alert("Unable to load the sample image. Please try again.");
    };
    img.src = MOBILE_MEDIA.matches ? "sample-portrait.jpg" : "sample.jpg";
  } catch {
    setLoading(false);
  }
}

function init() {
  hasUsedControls = localStorage.getItem(CONTROLS_USED_KEY) === "1";
  document.querySelectorAll(".build-version-lab").forEach((el) => {
    el.textContent = "Build " + LAB_BUILD;
  });

  updateCapabilityUI();
  setControlsEnabled(false);
  setMobileControls(false);

  if (uploadBtn) uploadBtn.addEventListener("click", () => fileInput.click());
  if (replaceBtn) replaceBtn.addEventListener("click", () => fileInput.click());
  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      handleFiles(event.target.files);
      fileInput.value = "";
    });
  }

  if (capabilitySelect) {
    capabilitySelect.addEventListener("change", () => {
      capability = capabilitySelect.value;
      updateCapabilityUI();
      markControlsUsed();
      showOriginal = false;
      updateBeforeAfterUI();
      scheduleRender();
    });
  }
  if (mcCapability) {
    mcCapability.addEventListener("change", () => {
      capability = mcCapability.value;
      updateCapabilityUI();
      markControlsUsed();
      showOriginal = false;
      updateBeforeAfterUI();
      scheduleRender();
    });
  }

  const onBrightness = (value, source) => {
    brightnessUi = Number(value);
    // Sync the other slider
    if (source === "desktop" && mcBrightness) mcBrightness.value = value;
    if (source === "mobile" && brightnessSlider) brightnessSlider.value = value;
    markControlsUsed();
    showOriginal = false;
    updateBeforeAfterUI();
    scheduleRender();
  };
  if (brightnessSlider) brightnessSlider.addEventListener("input", () => onBrightness(brightnessSlider.value, "desktop"));
  if (mcBrightness) mcBrightness.addEventListener("input", () => onBrightness(mcBrightness.value, "mobile"));

  const onWarmth = (value, source) => {
    warmthUi = Number(value);
    // Sync the other slider
    if (source === "desktop" && mcWarmth) mcWarmth.value = value;
    if (source === "mobile" && warmthSlider) warmthSlider.value = value;
    updateWarmthUI();
    markControlsUsed();
    showOriginal = false;
    updateBeforeAfterUI();
    scheduleRender();
  };
  if (warmthSlider) warmthSlider.addEventListener("input", () => onWarmth(warmthSlider.value, "desktop"));
  if (mcWarmth) mcWarmth.addEventListener("input", () => onWarmth(mcWarmth.value, "mobile"));

  if (dimToWarmToggle) {
    dimToWarmToggle.addEventListener("change", () => {
      dimToWarm = dimToWarmToggle.checked;
      if (mcDimToWarm) mcDimToWarm.checked = dimToWarm;
      if (dimToWarm) warmthUi = DEFAULT_WARMTH;
      updateWarmthUI();
      markControlsUsed();
      showOriginal = false;
      updateBeforeAfterUI();
      scheduleRender();
    });
  }
  if (mcDimToWarm) {
    mcDimToWarm.addEventListener("change", () => {
      dimToWarm = mcDimToWarm.checked;
      if (dimToWarmToggle) dimToWarmToggle.checked = dimToWarm;
      if (dimToWarm) warmthUi = DEFAULT_WARMTH;
      updateWarmthUI();
      markControlsUsed();
      showOriginal = false;
      updateBeforeAfterUI();
      scheduleRender();
    });
  }

  if (viewAdjustedBtn) {
    viewAdjustedBtn.addEventListener("click", () => {
      showOriginal = false;
      updateBeforeAfterUI();
      scheduleRender();
    });
  }
  if (viewOriginalBtn) {
    viewOriginalBtn.addEventListener("click", () => {
      showOriginal = true;
      updateBeforeAfterUI();
      scheduleRender();
    });
  }

  if (mcToggle) {
    mcToggle.addEventListener("click", () => {
      if (!MOBILE_MEDIA.matches) return;
      const expanded = mobileControls.classList.contains("is-expanded");
      setMobileControls(!expanded);
      if (!expanded) markControlsUsed();
    });
  }

  if (sheetToggle) {
    sheetToggle.addEventListener("click", () => {
      if (!MOBILE_MEDIA.matches) return;
      controlsPanel.classList.toggle("is-expanded");
      controlsPanel.classList.toggle("is-collapsed");
    });
  }

  [stage, canvasWrap].forEach((element) => {
    element.addEventListener("dragover", (event) => {
      event.preventDefault();
      element.classList.add("dragging");
    });
    element.addEventListener("dragleave", () => element.classList.remove("dragging"));
    element.addEventListener("drop", (event) => {
      event.preventDefault();
      element.classList.remove("dragging");
      if (event.dataTransfer?.files?.length) handleFiles(event.dataTransfer.files);
    });
  });

  // Load sample by default (beta page should be immediately explorable).
  loadSampleImage();
}

init();
