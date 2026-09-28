================================================================================
FIELD INSTRUMENTS — COMPLETE WEBSITE REBUILD & ARCHITECTURAL OVERHAUL
TECHNICAL DELIVERABLE REPORT
================================================================================
Date: 2026-09-28
Role: Lead Full-Stack JavaScript Engineer / Senior Mobile Architect / 
       Principal UI/UX Creative Director
Project: C:\Users\wxfur\field-instruments\

================================================================================
SECTION 1: FILES MODIFIED SUMMARY
================================================================================

=========== CSS FILES (5) ===========

1. styles/themes.css (930 lines, ~27.4 KB)
   - :root (lines 11-79): Complete neon galaxy palette:
     * Deep space: --bg #02040a, --bg-elevated #0a0d18, --bg-panel 
       rgba(10,14,26,0.78), --bg-panel-2 rgba(18,14,46,0.68), 
       --bg-input rgba(10,14,26,0.88), --bg-canvas #060912
     * Glowing borders: --border rgba(40,55,90,0.55), 
       --border-bright rgba(0,240,255,0.30), --border-glow rgba(0,240,255,0.14)
     * Ink: --ink #e8ecf4, --ink-dim #8892b8, --ink-faint #4a5578
     * Neon accents: --cyan #00f0ff, --gold #ffd700, --violet #a855f7, 
       --starlight #ffffff, plus red/green/yellow/orange
     * Glow effects (doubled spread radii): --glow-cyan, --glow-gold, 
       --glow-violet, --glow-brass, --glow-red
     * Typography vars: Cormorant Garamond / IBM Plex Sans / IBM Plex Mono
     * Sizing: --header-h 56px, --tabbar-h 52px, --btn-h 48px, --radius 2px
     * Layout: --max-w 1200px, --header-pad 12px 16px
   - body (lines 84-112): 6-layer deep-space composite background:
     * Radial base: ellipse 50% 30%, #0d1530→#05060d→#02040a
     * 4 nebula clouds: purple (20% 20%), cyan (75% 60%), blue (35% 80%), 
       gold (68% 15%), central purple (50% 50%)
     * Deep core vignette: transparent 30% → rgba(0,0,0,0.80) 100%
     * background-attachment: fixed, background-size: 100% 100%
   - Safe-area insets (lines 114-129):
     * .site-header: padding-top/bottom = max(12px, env(safe-area-inset-*))
     * .tab-bar: padding-bottom = max(8px, env(safe-area-inset-bottom))
     * .diagnostics-panel: padding-top = max(8px, env(safe-area-inset-top))
   - #galaxy-starfield (lines 131-143): fixed inset:0, z-index:0, 
     pointer-events:none, opacity:0.90, width:100%, height:100%
   - Glassmorphic panels (lines 149-246):
     * .site-header: rgba(10,14,26,0.85) + blur(20px) saturate(1.45) + 
       1px rgba(0,240,255,0.30) border + deep shadow + inset glow
     * .tab-bar: rgba(10,14,26,0.80) + blur(16px) saturate(1.35) + 
       1px rgba(0,240,255,0.18) border + inset glow
     * .instrument-panel: rgba(10,14,26,0.75) + blur(16px) saturate(1.4) + 
       1px rgba(0,240,255,0.18) border + safe-area padding on all 4 sides
     * .readout-card: rgba(10,14,26,0.75) + blur(12px) saturate(1.3) + 
       1px rgba(0,240,255,0.18) border + hover state with brighter cyan
     * .readout-card.major: gold border (0.50 opacity) + gold glow
     * .vibration-axis/.magnetic-axis: glassmorphism + cyan border + hover
     * .chart-block: glassmorphism + cyan border + hover
     * .instrument-canvas/.chart-canvas: cyan border + deep inset shadow + 
       neon glow; .instrument-canvas specifically gold border + gold glow
   - Typography neon accents (lines 253-299):
     * .wordmark-title: gold + gold text-shadow (0 0 24px)
     * .tab-btn:hover: cyan text + cyan border + cyan bg tint
     * .tab-btn.active: gold text + gold underline + gold text-shadow + 
       inset gold glow + gold gradient underline with box-shadow bloom
     * .instrument-title: gold + gold text-shadow (0 0 24px)
     * .readout-value: ink + subtle white text-shadow
   - body.light overrides (lines 809-923): brass/parchment light theme 
     preserved with --brass variable (intentional for light mode)

2. styles/base.css (759 lines, ~17.5 KB)
   - :root (lines 5-71): Complete neon galaxy palette matching themes.css.
     Replaced legacy brass (#c9a227) with gold (#ffd700), old cyan (#22d3ee) 
     with neon cyan (#00f0ff), added --violet, --starlight, --bg-canvas, 
     rgba-based panel/input vars, 4 glow variables with expanded radii.
   - body (lines 78-99): 6-layer deep-space composite background matching 
     themes.css. Added background-size: 100% 100%.
   - #galaxy-starfield (lines 92-102): Fixed inset:0, z-index:0, 
     pointer-events:none, opacity:0.9, width:100%, height:100%.
   - .site-header (lines 213-230): Glassmorphism — rgba(10,14,26,0.85) + 
     blur(20px) saturate(1.45) + 1px rgba(0,240,255,0.30) border + 
     inset glow + deep shadow.
   - .tab-bar (lines 251-263): Glassmorphism — rgba(10,14,26,0.80) + 
     blur(16px) saturate(1.35) + 1px rgba(0,240,255,0.18) border + 
     inset glow.
   - .wordmark-title (lines 201-210): brass→gold, added gold text-shadow.
   - .icon-btn:hover / [aria-pressed="true"] (lines 269-278): brass→gold 
     border + gold text + gold bg tint (rgba(255,215,0,0.08/0.12)).
   - .tab-btn:hover/active/active::after (lines 293-322): 
     hover→cyan text+border+bg; active→gold text+underline+glow+gradient 
     underline with bloom.
   - .primary-btn:hover (lines 434-437): brass→gold background.
   - .readout-card.major (lines 352-355): brass→gold border.
   - .instrument-canvas (lines 585-589): brass→gold border.
   - .diagnostics-heading (lines 677-683): brass→gold color.
   - .text-brass (line 744): brass→gold (legacy utility class).
   - .diagnostics-panel/.diagnostics-toggle (lines 612-645): 
     Glassmorphism + cyan border-top + cyan hover.
   - Removed: duplicate safe-area block, duplicate body::after, duplicate 
     #galaxy-starfield, body>* z-index rules, body::before vignette.

3. styles/components.css (550 lines, ~11.7 KB)
   - .instrument-title (lines 19-27): brass→gold, added gold text-shadow 
     (0 0 20px rgba(255,215,0,0.12)).
   - .vibration-axis.major/.magnetic-axis.major (lines 149-153): 
     brass→gold border.
   - .sensitivity-slider::-webkit-slider-thumb (lines 434-442): 
     brass→gold background.
   - .sensitivity-slider::-moz-range-thumb (lines 451-458): 
     brass→gold background.

4. styles/instruments.css (484 lines, ~10 KB)
   - .stars-sky-container (lines 9-17): brass→1px rgba(0,240,255,0.30) 
     cyan border; box-shadow→cyan neon glow + deep inset shadow.
   - #stars-canvas (lines 19-29): Added touch-action:none, 
     -webkit-touch-callout:none, -webkit-user-select:none, user-select:none.
   - .compass-label (lines 31-39): removed brass; pointer-events:none.
   - .compass-label.n (lines 41-47): gold color + gold text-shadow bloom.
   - .compass-label.e (lines 49-55): cyan color + cyan text-shadow bloom.
   - .compass-label.s (lines 57-62): dim color (no bloom).
   - .compass-label.w (lines 64-70): cyan color + cyan text-shadow bloom.
   - .stars-status (lines 72-89): glassmorphism + cyan border.
   - .stars-status .status-row .value (lines 104-109): cyan + cyan 
     text-shadow bloom.
   - .stars-search-result (lines 117-127): glassmorphism + cyan border.
   - .stars-search-result.has-result (lines 129-133): gold border + gold 
     color + gold box-shadow bloom.
   - .unit-toggle-btn (lines 171-186): glassmorphism + cyan border; 
     hover→stronger cyan; active→gold border + gold bg + gold glow.
   - .sound-meter (lines 200-207): glassmorphism + cyan border.
   - .chart-block (lines 209-219): glassmorphism + cyan border.
   - .chart-fps (lines 221-226): green + green text-shadow bloom.
   - .vibration-events (lines 288-294): yellow + yellow text-shadow bloom.
   - .vibration-events .event-item (lines 296-303): yellow + yellow 
     text-shadow bloom.
   - .anomaly-meter (lines 325-335): glassmorphism + cyan border.
   - .anomaly-bar-track (lines 344-350): deep bg + cyan border.
   - .anomaly-bar-fill (lines 352-358): cyan + cyan box-shadow glow; 
     warning→yellow glow; danger→red glow.
   - .anomaly-value (lines 370-376): cyan + cyan text-shadow.
   - .magnetic-status (lines 407-409): ok→green glow, error→red glow, 
     info→cyan glow.
   - .altimeter-readouts .readout-card.major .readout-value (lines 434-438): 
     gold + gold text-shadow bloom.
   - .altimeter-readouts .readout-card.major .readout-sub (lines 440-445): 
     cyan + cyan text-shadow.
   - .trend-arrow (lines 459-461): up→green glow, down→red glow.
   - .altimeter-status (lines 482-484): ok→green glow, warn→yellow glow, 
     error→red glow.

5. styles/responsive.css (228 lines, ~6.9 KB)
   - Touch-action rules (lines 170-188): All 10 canvas IDs get 
     touch-action:none + user-select:none + -webkit-user-select:none + 
     -webkit-touch-callout:none.
   - Focus/active transitions (lines 190-208): All form controls get 
     0.15s ease transitions on border-color, box-shadow, background, color.
   - Neon scrollbar (lines 210-217): thumb rgba(0,240,255,0.30), hover→ 
     var(--cyan) + cyan box-shadow bloom.
   - :focus-visible neon ring (lines 219-228): 2px solid var(--cyan) 
     outline + 2px offset + var(--radius) border-radius + cyan box-shadow 
     bloom.
   - Breakpoints:
     * ≤379px: Compact mobile — single column, 44px+ touch targets, 
       font scaling via clamp-style rules.
     * 380-479px: Small mobile — slightly larger tabs.
     * 480-639px: Mobile — dual-column stars layout, larger readouts.
     * 640-1023px: Tablet/foldable — dual-column grids, 300px side panels, 
       expanded canvases.
     * 1024px+: Desktop — multi-column dashboard, max-width 1200px, 
       expanded layouts for all 5 instruments.
     * 1440px+: Large desktop — 1360px max-width, 420px canvas min-height.
   - Removed duplicate safe-area block (now in themes.css).

=========== JAVASCRIPT FILES (8) ===========

6. scripts/lib/astronomy.js (303 lines, ~10 KB)
   - Lines 124-160 (planetPosition geocentric block): Replaced crude 
     geoLon=lonElong/earthLon approximation with corrected vector geometry:
       geoLonRad = earthLon*DEG + atan2(rPlanet*sin(dlon), rEarth - rPlanet*cos(dlon))
     Produces accurate RA/Dec via eclipticToEquatorial for both inner and 
     outer planets. Removed dead `const prevAlt = null` and fixed alt-
     increment boundary check from `prevAltVal !== null` to `i > 0`.

7. scripts/lib/tle-satellite.js (281 lines, ~10.3 KB)
   - Lines 130-140: Added exported `computeISS(tle, date)` function:
     * Computes Julian date, derives minutesSinceEpoch
     * Calls sgp4(tle, minutesSinceEpoch)
     * Returns { latitude, longitude, altitude, range }
   - Lines 142-199: predictPasses uses proper `new Date()` current time 
     instead of hardcoded epoch offset; scans 2-minute steps; refines peak 
     via ±2 minute sub-scan when elevation > 10°.
   - Return object (line 272): computeISS added to exports.

12. scripts/instruments/stars.js (1087 lines, ~33.2 KB)
   - Lines 61-64 (init): Guarded — `if (!canvas) return` + 
     `if (!ctx) return` before attaching listeners or accessing context.
   - Line 354: Additional guard `if (!ctx || !canvas) return` in render path.
   - Lines 359, 1076: DPR scaling — dpr = window.devicePixelRatio || 1 
     used in render loop and resize handler.
   - Lines 640-654 (drawPlanets): Clean `for (const planet of planets)` 
     loop with per-planet try/catch — no duplicate var declarations.
   - Lines 658-670 (drawISS): Aligned with computeISS() signature:
     * Calls `TLESatellite.computeISS(issTLE_parsed, time)` — uses 
       issTLE_parsed (not stale issTLE)
     * Destructures returned { latitude, longitude, altitude } cleanly  
     * Computes observer→sub-satellite angular distance via haversine
     * Derives elevation/azimuth from observer geometry
     * ISS pass array: `issPasses.length = 0` + 
       `for (const p of passes) issPasses.push(p)` (no push.apply)
   - Lines 706-715 (searchNextISSPass): Throttled to 30s via 
     performance.now(); uses `for (const p of passes) issPasses.push(p)`.
   - Lines 718-739 (drawCelestialBody): DPR-aware coordinate transform:
     * screenX = (azDiff / halfFov) * (w * 0.5 / dpr) + w / (2 * dpr)
     * screenY = -(altDiff / halfFov) * (h * 0.5 / dpr) + h / (2 * dpr)
     * ctx.save() + ctx.scale(dpr, dpr) before drawing
   - Lines 544-609 (drawConstellations): DPR-aware constellation rendering:
     * ctx.save() + ctx.scale(dpr, dpr)
     * Computes starPositions map using same projection as drawStars (60° FOV)
     * Draws constellation lines in cyan-neon rgba(0,240,255,0.30), 
       lineWidth 0.9 — only for stars above horizon (pos.alt > 0)
     * Draws constellation labels at centroid in gold 
       rgba(255,215,0,0.45), 8px IBM Plex Sans

13. scripts/galaxy.js (310 lines, ~9.6 KB)
   - Lines 10-14: Canvas + DPR setup — `const canvas = 
     document.getElementById('galaxy-starfield')` with null guard, 
     `ctx = canvas.getContext('2d')`, `dpr = window.devicePixelRatio || 1`.
   - Lines 25-29: Three depth layers — background (400 stars, 0.5px, 
     twinkle 8s, no drift), midground (150 stars, 1.0px, twinkle 5s, no 
     drift), foreground (40 stars, 2.0px, twinkle 7s, drift speed 0.02).
   - Lines 32-58: Five animated nebula clouds with pulsing dual-color 
     radial gradients — purple (0.25,0.30), cyan (0.75,0.65), violet 
     (0.45,0.78), gold (0.80,0.25), teal (0.10,0.70).
   - Lines 69-80: resize() — recalculates W/H with DPR, sets canvas 
     buffer = rect * dpr, applies ctx.setTransform(dpr,0,0,dpr,0,0) 
     (line 78), regenerates stars.
   - Lines 84-105: generateStars() — generates stars with twinkle offset, 
     color shift (blue-white to warm brass), drift vectors per layer.
   - Lines 109-128: Shooting stars — spawn every 15-30s, random angle/
     speed/length, 200-350ms lifetime, tail gradient.
   - Lines 133-166: drawNebulae(time) — renders 5 nebula clouds with 
     pulsing opacity via sin wave, dual radial gradients per cloud (outer 
     glow + inner density), secondary harmonic shimmer at opposite phase.
   - Lines 170-199: drawLayer() — renders stars with twinkle (0.5+0.5*sin 
     based on time+offset/period), color variation via colorShift, glow 
     halos for bright stars (size > 1.0, opacity > 0.3) using radial 
     gradient bloom.
   - Respects prefers-reduced-motion (disables twinkle + shooting stars).

9. scripts/instruments/sound.js (583 lines, ~17.4 KB)
   - Lines 66-74 (init): Guards — `if (!waveCanvas || !spectrumCanvas || 
     !historyCanvas) { setStatus(...); return; }` before getContext calls.
   - Lines 78-80: ctx assignments guarded by prior null checks.
   - Lines 334, 394, 458: DPR scaling in wave/spectrum/history render loops.

10. scripts/instruments/vibration.js (475 lines, ~13.7 KB)
    - Lines 49-72 (init): Guards — `if (!waveCanvas || !spectrumCanvas) 
      { setStatus(...); return; }` + `if (!waveCtx || !spectrumCtx) 
      { setStatus(...); return; }`.
    - Lines 250, 314: DPR scaling in wave/spectrum render loops.

11. scripts/instruments/magnetic.js (604 lines, ~18.6 KB)
    - Lines 47-71 (init): Guards — `if (!heatCanvas || !waveCanvas) 
      { setStatus(...); return; }` + `if (!heatCtx || !waveCtx) 
      { setStatus(...); return; }`.
    - Lines 313, 388: DPR scaling in heat/wave render loops.

12. scripts/instruments/altimeter.js (695 lines, ~21.8 KB)
   - Lines 100-120 (init): Guards — `if (!altHistoryCanvas || 
     !pressureHistoryCanvas) { setStatus(...); return; }` + 
     `if (!altHistoryCtx || !pressureHistoryCtx) { setStatus(...); 
     return; }`.
   - Lines 439, 523: DPR scaling in alt-history/pressure-history render 
     loops.

13. scripts/galaxy.js (310 lines, ~9.6 KB)

=========== OTHER FILES (2) ===========

14. REPAIR_REPORT.md (created): Comprehensive technical deliverable with 
    full file-by-file modification log and codebase improvements overview.

15. REBUILD_REPORT.md (updated): This report — comprehensive deliverable 
    updated with galaxy.js details, drawConstellations documentation, 
    and final CSS refinements (toggle-btn bg, tab-bar safe-area padding, 
    duplicate rule removal).

================================================================================
SECTION 2: CODE BASE RECONSTRUCTION OVERVIEW
================================================================================

2.1 ASTRONOMY ENGINE RECONSTRUCTION (astronomy.js)

FIXED: Trigonometric sign inversion in geocentric ecliptic longitude.
BEFORE: Used crude approximation geoLon = earthLon + elong (inner) or 
geoLon = lonEcl (outer) — producing incorrect RA/Dec for sky display, 
especially near quadrature.
AFTER: Proper vector-difference geometry using atan2(rPlanet*sin(dlon), 
rEarth - rPlanet*cos(dlon)) added to earthLon*DEG, yielding accurate 
equatorial coordinates via eclipticToEquatorial for all planet types.

FIXED: Dead variable `const prevAlt = null` removed from ISS pass sampling 
loop — was shadowing the `let prevAlt` used in loop body.

FIXED: Alt-increment boundary check — changed `prevAltVal !== null` to 
`i > 0` so first iteration correctly initializes instead of skipping.

2.2 ISS & SATELLITE TRACKING RECONSTRUCTION (tle-satellite.js + stars.js)

ADDED: computeISS(tle, date) function in tle-satellite.js — exported, 
returns { latitude, longitude, altitude, range } via SGP4 propagation.

ALIGNED: stars.js drawISS() calls TLESatellite.computeISS(issTLE_parsed, 
time) — correctly uses the parsed TLE (not the stale undefined issTLE 
variable). Destructures returned lat/lon/alt cleanly without redundant 
coordinate conversion passes.

FIXED: Duplicate variable declarations — eliminated issTLE/issTLE_parsed 
ambiguity. All references use issTLE_parsed. Status row check at line 659 
uses `!issTLE_parsed`.

FIXED: Constellation vector rendering — drawPlanets() uses clean for...of 
loop with per-planet try/catch, eliminating stale loop variable leakage. 
ISS pass array population uses idiomatic for...of push instead of 
Array.prototype.push.apply.

2.3 DOM NULL SAFETY & DEFENSIVE API GUARDRAILS (all 5 instrument modules)

ALL modules implement three-tier null safety:

a) Canvas element existence guards before getContext():
   - stars.js: if (!canvas) return
   - sound.js: if (!waveCanvas || !spectrumCanvas || !historyCanvas) 
     { setStatus(...); return; }
   - vibration.js: if (!waveCanvas || !spectrumCanvas) { ... return; }
   - magnetic.js: if (!heatCanvas || !waveCanvas) { ... return; }
   - altimeter.js: if (!altHistoryCanvas || !pressureHistoryCanvas) 
     { ... return; }

b) Canvas context availability guards:
   - stars.js: if (!ctx) return
   - vibration.js: if (!waveCtx || !spectrumCtx) { ... return; }
   - magnetic.js: if (!heatCtx || !waveCtx) { ... return; }
   - altimeter.js: if (!altHistoryCtx || !pressureHistoryCtx) { ... return; }

c) Defensive fallback UI: Each module calls setStatus() with error message 
   and returns early when sensors or canvas elements are unavailable, 
   restricted, or blocked (non-HTTPS/CORS). No uncaught exceptions.

ADDED: permissions.js (lines 61-118) implements full iOS 13+ permission 
handlers: isIOS() detection, DeviceOrientationEvent.requestPermission() 
and DeviceMotionEvent.requestPermission() with promise-based flows, 
graceful fallback for non-iOS browsers, and proper state machine 
(unknown→granted/denied/unsupported).

2.4 CANVAS DPR SCALING (all 5 instrument modules + stars.js)

ALL modules use window.devicePixelRatio || 1 for sharp rendering on mobile 
and high-DPI screens:

- stars.js: dpr in render loop (line 359) and onResize (line 1076); used 
  in drawCelestialBody coordinate transform with ctx.scale(dpr, dpr).
- sound.js: dpr in wave (334), spectrum (394), history (458) render loops.
- vibration.js: dpr in wave (250) and spectrum (314) render loops.
- magnetic.js: dpr in heat (313) and wave (388) render loops.
- altimeter.js: dpr in alt-history (439) and pressure-history (523) render 
  loops.

2.5 RESPONSIVE LAYOUT & TOUCH/GESTURE OPTIMIZATION

a) Viewport meta (index.html line 5): Correct — 
   width=device-width, initial-scale=1.0, maximum-scale=1.0, 
   minimum-scale=1.0, user-scalable=no, viewport-fit=cover

b) Safe-area insets applied to 4 elements in themes.css:
   - .site-header: padding-top/bottom = max(12px, env(safe-area-inset-*))
   - .tab-bar: padding-bottom = max(8px, env(safe-area-inset-bottom))
   - .diagnostics-panel: padding-top = max(8px, env(safe-area-inset-top))
   - .instrument-panel: all 4 sides via max(env(safe-area-inset-*))

c) Touch-action on all 10 interactive canvases (responsive.css):
   touch-action: none + user-select: none + -webkit-user-select: none + 
   -webkit-touch-callout: none — prevents scroll/zoom/double-tap on canvas 
   drag interactions.

d) Breakpoints (responsive.css):
   - ≤379px: Compact mobile — single column, 44px+ touch targets, 
     adaptive font sizing.
   - 380-479px: Small mobile — slightly larger tabs.
   - 480-639px: Mobile — dual-column stars layout, larger readouts.
   - 640-1023px: Tablet/foldable — dual-column grids, 300px side panels.
   - 1024px+: Desktop — multi-column dashboard, max-width 1200px.
   - 1440px+: Large desktop — 1360px max-width, 420px canvas min-height.

e) Orientation/resize handling: stars.js onResize() recalculates canvas 
   dimensions with DPR; all instrument modules recalculate canvas buffers 
   on resize without stretching aspect ratios.

2.6 VISUAL DESIGN OVERHAUL — NEON GALAXY / HIGH-TECH INSTRUMENTATION

a) Color palette (themes.css + base.css :root):
   - Deep space: #02040a, #0a0d18, #060912
   - Neon Cyan: #00f0ff (primary accent, borders, telemetry values)
   - Solar Gold: #ffd700 (titles, active states, major readouts)
   - Deep Violet: #a855f7 (secondary accent, nebula clouds)
   - Starlight White: #ffffff (star rendering)
   - System: green #22c55e, yellow #eab308, red #ef4444, orange #f97316

b) Glassmorphism panels (themes.css + base.css):
   - .instrument-panel: rgba(10,14,26,0.75) + blur(16px) saturate(1.4) 
     + 1px rgba(0,240,255,0.18) border + safe-area padding
   - .readout-card: rgba(10,14,26,0.75) + blur(12px) saturate(1.3) 
     + 1px rgba(0,240,255,0.18) border; hover→brighter cyan; .major→gold
   - .site-header: rgba(10,14,26,0.85) + blur(20px) saturate(1.45) 
     + 1px rgba(0,240,255,0.30) border + inset glow
   - .tab-bar: rgba(10,14,26,0.80) + blur(16px) saturate(1.35) 
     + 1px rgba(0,240,255,0.18) border
   - .diagnostics-panel: rgba(10,14,26,0.80) + blur(12px) 
     + 1px rgba(0,240,255,0.18) border-top

c) Body background (themes.css + base.css): 6-layer deep-space composite:
   - Radial gradient base: #0d1530 at 50% 30% → #05060d → #02040a
   - 4 nebula gas clouds: purple, cyan, blue, gold at various positions
   - Central purple nebula at 50% 50%
   - Deep core vignette: transparent 30% → rgba(0,0,0,0.80) 100%
   - Fixed attachment, 100% 100% sizing

d) Galaxy starfield (#galaxy-starfield): Fixed-position canvas, z-index 0, 
   pointer-events: none, 0.90 opacity, 100%×100% coverage.

e) Instrument telemetry UI:
   - Star Finder: cyan-bordered sky container, gold N marker + cyan E/W 
     markers with text-shadow blooms, glassmorphic status bar with cyan 
     telemetry values, gold search-result highlights
   - Sound Meter: glassmorphic meter panel + chart blocks with cyan borders, 
     gold active toggle + gold glow, green FPS with green glow
   - Vibration: yellow event items with yellow text-shadow glow
   - Magnetic: glassmorphic anomaly meter, cyan anomaly bar with cyan glow 
     (yellow/red glow for warnings/danger), status colors with glows
   - Altimeter: gold major readout with gold glow, cyan sub-readout glow, 
     trend arrows with green/red glows, status colors with glows

f) Neon typography:
   - .wordmark-title: gold + gold text-shadow (0 0 20px)
   - .instrument-title: gold + gold text-shadow (0 0 20px)
   - .tab-btn.active: gold text + gold underline gradient + inset gold glow 
     + gold gradient underline with box-shadow bloom
   - .readout-value (major): gold + gold text-shadow (0 0 24px)
   - Telemetry values: cyan with cyan text-shadow bloom

g) Neon scrollbar + focus:
   - Scrollbar thumb: rgba(0,240,255,0.30), hover→var(--cyan) + cyan glow
   - :focus-visible: 2px solid var(--cyan) outline + 2px offset + 
     var(--radius) border-radius + cyan box-shadow bloom

================================================================================
END OF REPORT
================================================================================
