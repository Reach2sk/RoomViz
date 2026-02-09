# RoomViz Lab UI (Beta) — Intent + Spec

This document defines the intent/spec for the experimental UI in `docs/lab.html`.
It is written so another agent can evaluate UX behavior against the goals.

## Goal (Non-Technical)

Help a non-technical homeowner quickly *feel* why:
- deep dimming matters at night (5% vs 1% vs 0.1% capability),
- warm vs cool tone changes the mood,
without showing numbers or requiring lighting knowledge.

Success = user understands in ~30 seconds that:
- some lights "stop" before reaching a true night-friendly level,
- deeper dimming enables comfort,
- warm-dimming can feel calmer than cool at the same brightness.

## Non-Goals

- Physical accuracy, fixture detection, Kelvin/lumen UI, precise daylight separation.
- More than one screen of controls.

## UI Structure

### Desktop
- Large image dominates left.
- Controls card on the right.

### Mobile
- Image dominates.
- Controls use a collapsible bottom sheet.
- A subtle one-time nudge (until first use) hints the user to expand controls.

## Primary Controls

### 1) Capability (the key differentiator)
Single selector with three options (labels are user-facing, no numbers):
- `Standard LED`
- `Deep Dimming`
- `Ultra-Deep + Warm Dim`

Changing capability changes:
- the lowest reachable dim level (5% vs 1% vs 0.1% in logic, not shown),
- the warmth range / behavior (Ultra mode warms as it dims if Dim-to-warm is ON).

### 2) Brightness slider
One horizontal slider.
Tick labels:
- `Nightlight` — `Cozy` — `Bright`

Behavior:
- Standard LED has a *soft stop*: sliding further left keeps moving but the output level clamps at the minimum.
- When the user hits the stop, show an inline message:
  - `Some lights can’t dim lower than this.`

Also show a small status label (no numbers):
- `Harsh` / `Comfortable` / `Night-friendly`

### 3) Warmth control (continuous slider)
One horizontal slider:
- Left = `Warm`
- Middle = `Neutral`
- Right = `Cool`

Important behavior:
- Slider center (`Neutral`) must mean **no color shift** relative to the original photo.
- Warm/Cool shifts should be more noticeable on midtones (walls/fabrics) than in highlights or deep shadows.

### 4) Dim-to-warm (only where applicable)
Toggle appears only for `Ultra-Deep + Warm Dim`:
- Label: `Dim-to-warm`
- Helper text when ON:
  - `As you dim, the light gets warmer.`

When ON:
- warmth is computed from brightness (warmer at lower brightness)
- the warmth slider is disabled and the label shows `Auto`
- at full brightness there should be little-to-no warmth shift; as you dim, it warms toward candlelight.

## Rendering Behavior (Implementation-Level)

### Dimming capability
Internal minima (not shown):
- Standard LED: min output = 0.05
- Deep Dimming: min output = 0.01
- Ultra-Deep: min output = 0.001

Brightness UI -> output level:
- Use a non-linear curve (perceptual): output = min + (1-min) * (t^2)
- Apply output as an overall dim gain.

### Warmth/tone
- Apply a temperature-like shift with luminance compensation.
- Weight the effect more strongly in midtones than highlights/shadows.
- Reduce in daylight-like regions (very bright + low saturation) to avoid “warm windows”.
- Brightness should **not** change warmth when warmth is Neutral and Dim-to-warm is OFF.

### Interaction behavior
- Changing any control (capability, brightness, warmth, dim-to-warm) should automatically switch the view to `Adjusted`
  so users never feel like the controls are “not working” while in `Original`.

### Acceptance checks (for testers)
- In Standard LED, the user cannot reach `Night-friendly`; message appears when clamped.
- In Deep Dimming, the user can reach `Night-friendly`.
- In Ultra-Deep + Warm Dim with Dim-to-warm ON, lowering brightness makes the scene warmer and calmer.
- Warm/Cool should not invert.
- With warmth centered at `Neutral` (and Dim-to-warm OFF), moving the brightness slider should not add a noticeable warm/cool tint.
- If the user is viewing `Original` and touches any control, the view switches to `Adjusted` immediately.

## Files
- `docs/lab.html`: beta UI page (does not replace main).
- `docs/lab.css`: styling for beta page.
- `docs/lab.js`: independent JS (must not change behavior of `docs/app.js`).
