#!/usr/bin/env python3
"""Fix index.html - convert from ES module to classic scripts, remove forbidden elements."""
import re

with open('index.html', 'r') as f:
    html = f.read()

# 1. Replace inline script
old_script = """<script>
(function() {
  'use strict';
  if (location.protocol === 'file:') {
    var banner = document.getElementById('file-protocol-banner');
    if (banner) banner.classList.remove('hidden');
  }
  window.__FI_BOOT_TIMER = setTimeout(function() {
    if (window.__FI_BOOTED !== true) {
      var b = document.getElementById('file-protocol-banner');
      if (b) {
        b.classList.remove('hidden');
        var msg = b.querySelector('.boot-watchdog');
        if (msg) msg.style.display = 'block';
      }
    }
  }, 4000);
})();
</script>"""

new_script = """<script>
(function() {
  'use strict';
  if (location.protocol === 'file:') {
    window.FI_IS_FILE = true;
  }
  window.__FI_BOOT_TIMER = setTimeout(function() {
    if (window.__FI_BOOTED !== true) {
      var b = document.getElementById('boot-failure-banner');
      if (b) b.classList.remove('hidden');
    }
  }, 4000);
})();
</script>"""

html = html.replace(old_script, new_script)

# 2. Replace file-protocol-banner with boot-failure-banner
old_banner = '''<div id="file-protocol-banner" class="hidden" role="alert" aria-live="assertive">
  <div class="banner-content">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2L2 22h20L12 2z" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="19" r="0.8" fill="currentColor"/></svg>
    <div>
      <strong>Cannot run from file://</strong>
      <p>Open <strong>START.bat</strong> in this folder, or run a local server:</p>
      <p class="mono">python -m http.server 8080</p>
      <p class="mono">Then open http://localhost:8080</p>
      <p>Browsers block ES modules and fetch() on file:// pages.</p>
      <p class="boot-watchdog" style="display:none;">The app failed to start — open the console (F12) for the error.</p>
    </div>
  </div>
</div>'''

new_banner = '''<div id="boot-failure-banner" class="hidden" role="alert">
  <div class="banner-content">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2L2 22h20L12 2z" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="19" r="0.8" fill="currentColor"/></svg>
    <div>
      <strong>Something failed to start</strong>
      <p>Press F12 and share the first red line.</p>
    </div>
  </div>
</div>'''

html = html.replace(old_banner, new_banner)

# 3. Remove manifest link
html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', '')

# 4. Remove apple-touch-icon
html = html.replace('<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">\n', '')

# 5. Remove install button
install_btn = '''    <button class="icon-btn" id="install-btn" aria-label="Install app" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 20h14M10 20V10M14 20V10M4 4h16v16H4z" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
'''
html = html.replace(install_btn, '')

# 6. Remove duplicate galaxy canvas inside main
html = html.replace('<canvas id="galaxy-starfield"></canvas>\n', '')

# 7. Remove ISS refresh optin
iss_row = '''        <div class="stars-iss-row">
          <label class="toggle-label" for="iss-refresh-optin">
            <input type="checkbox" id="iss-refresh-optin">
            Refresh ISS orbit data (sent to celestrak.org, nothing else)
          </label>
        </div>
'''
html = html.replace(iss_row, '')

# 8. Remove alt weather optin
weather_row = '''        <label class="toggle-label" for="alt-weather-optin">
          <input type="checkbox" id="alt-weather-optin">
          Fetch local sea-level pressure from Open-Meteo (sends rounded coordinates only)
        </label>
'''
html = html.replace(weather_row, '')

# 9. Fix privacy notice
old_privacy = '''<div class="privacy-notice" id="sound-privacy-notice">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="12" cy="15" r="0.8" fill="currentColor"/></svg>
          <span>No audio is recorded, stored, or transmitted. All processing happens on this device.</span>
        </div>'''
new_privacy = '<div class="sound-privacy-notice" id="sound-privacy-notice"></div>'
html = html.replace(old_privacy, new_privacy)

# 10. Fix button texts
html = html.replace('<button class="primary-btn large" id="sound-toggle-btn">Start Meter</button>', '<button class="primary-btn" id="sound-toggle-btn">Start Measurement</button>')
html = html.replace('<button class="primary-btn large" id="vib-toggle-btn">Start Sensor</button>', '<button class="primary-btn" id="vib-toggle-btn">Start Measurement</button>')
html = html.replace('<button class="primary-btn" id="mag-toggle-btn">Start Sensor</button>', '<button class="primary-btn" id="mag-toggle-btn">Start Measurement</button>')

# 11. Remove IDs from mode chips and sim badges
for chip_id in ['stars-mode-chip', 'sound-mode-chip', 'vib-mode-chip', 'mag-mode-chip', 'alt-mode-chip']:
    html = html.replace(f'<span class="mode-chip" id="{chip_id}" data-mode="idle">', '<span class="mode-chip" data-mode="idle">')
for badge_id in ['stars-sim-badge', 'sound-sim-badge', 'vib-sim-badge', 'mag-sim-badge', 'alt-sim-badge']:
    html = html.replace(f'<span class="sim-badge hidden" id="{badge_id}">', '<span class="sim-badge hidden">')

# 12. Fix altimeter source display
html = html.replace('<span class="readout-sub" id="alt-altitude-source"></span>', '<span class="readout-unit" id="alt-altitude-source">-</span>')
html = html.replace('<span class="trend-arrow" id="alt-trend-arrow" aria-hidden="true"></span>', '<span class="trend-arrow" id="alt-trend-arrow">-</span>')

# 13. Replace diagnostics panel
old_diag = '''<section class="diagnostics-panel" id="diagnostics-panel" aria-label="Device diagnostics">
  <button class="diagnostics-toggle" id="diagnostics-toggle" aria-expanded="false" aria-controls="diagnostics-content">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="12" cy="14.5" r="0.8" fill="currentColor"/></svg>
    Diagnostics
    <svg class="diagnostics-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  <div class="diagnostics-content" id="diagnostics-content" hidden>
    <div class="diagnostics-grid">
      <div class="diagnostics-section">
        <h3 class="diagnostics-heading">Device Capabilities</h3>
        <ul class="diagnostics-list" id="diagnostics-capabilities"></ul>
      </div>
      <div class="diagnostics-section">
        <h3 class="diagnostics-heading">Sensor Permissions</h3>
        <ul class="diagnostics-list" id="diagnostics-permissions"></ul>
      </div>
      <div class="diagnostics-section">
        <h3 class="diagnostics-heading">Location</h3>
        <div class="diagnostics-location" id="diagnostics-location">
          <span class="diagnostics-muted">Acquiring GPS...</span>
        </div>
        <button class="secondary-btn small" id="diagnostics-copy-location" style="display:none" aria-label="Copy current location to clipboard">Copy Lat/Lon</button>
      </div>
      <div class="diagnostics-section">
        <h3 class="diagnostics-heading">Instrument Status</h3>
        <ul class="diagnostics-list" id="diagnostics-instruments"></ul>
      </div>
      <div class="diagnostics-section">
        <h3 class="diagnostics-heading">Error Log</h3>
        <ul class="diagnostics-list" id="diagnostics-errors"></ul>
      </div>
    </div>
    <p class="diagnostics-footer">FIELD INSTRUMENTS — every calculation runs on your device. No data leaves your browser.</p>
  </div>
</section>'''

new_diag = '''<section class="diagnostics-panel" id="diagnostics-panel" aria-label="Diagnostics">
  <div class="diagnostics-toggle">
    <button class="icon-btn" id="diagnostics-toggle-btn" aria-label="Toggle diagnostics panel">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 3v3m6-3v3M9 18v3m6-3v3M5 9H3m2 2H3m2-4H3m4 9H3m2 2H3m2-4H3" stroke-linecap="round"/></svg>
    </button>
    <span class="diagnostics-label">Diagnostics</span>
  </div>
  <div class="diagnostics-content" id="diagnostics-content">
    <div class="diagnostics-section"><h3 class="diagnostics-heading">Build Info</h3><div class="diagnostics-grid" id="diagnostics-build"></div></div>
    <div class="diagnostics-section"><h3 class="diagnostics-heading">Capabilities</h3><div class="diagnostics-grid" id="diagnostics-capabilities"></div></div>
    <div class="diagnostics-section"><h3 class="diagnostics-heading">Permissions</h3><div class="diagnostics-grid" id="diagnostics-permissions"></div></div>
    <div class="diagnostics-section"><h3 class="diagnostics-heading">Instrument States</h3><div class="diagnostics-grid" id="diagnostics-instruments"></div></div>
    <div class="diagnostics-section"><h3 class="diagnostics-heading">Error Log</h3><div class="error-log" id="error-log" aria-live="polite"></div><button class="reset-inline" id="error-log-clear">Clear Log</button></div>
  </div>
</section>'''

html = html.replace(old_diag, new_diag)

# 14. Replace module script with classic scripts
old_script_tag = '<script type="module" src="scripts/main.js"></script>'
new_script_tags = '''<script src="scripts/data/catalog.js" defer></script>
<script src="scripts/data/constellations.js" defer></script>
<script src="scripts/data/planets.js" defer></script>
<script src="scripts/data/messier.js" defer></script>
<script src="scripts/data/zone-latlon.js" defer></script>
<script src="scripts/data/iss-tle.js" defer></script>
<script src="scripts/utils.js" defer></script>
<script src="scripts/bus.js" defer></script>
<script src="scripts/loop.js" defer></script>
<script src="scripts/permissions.js" defer></script>
<script src="scripts/units.js" defer></script>
<script src="scripts/theme.js" defer></script>
<script src="scripts/demo.js" defer></script>
<script src="scripts/galaxy.js" defer></script>
<script src="scripts/lib/astronomy.js" defer></script>
<script src="scripts/lib/tle-satellite.js" defer></script>
<script src="scripts/instruments/stars.js" defer></script>
<script src="scripts/instruments/sound.js" defer></script>
<script src="scripts/instruments/vibration.js" defer></script>
<script src="scripts/instruments/magnetic.js" defer></script>
<script src="scripts/instruments/altimeter.js" defer></script>
<script src="scripts/main.js" defer></script>'''

html = html.replace(old_script_tag, new_script_tags)

# 15. Fix color-scheme
html = html.replace('content="dark light"', 'content="dark"')

# 16. Remove .hidden style from head (it's in base.css now)
html = html.replace('''<style>
  .hidden { display: none !important; }
</style>
''', '')

with open('index.html', 'w') as f:
    f.write(html)

print(f'Done. Written {len(html)} bytes.')
