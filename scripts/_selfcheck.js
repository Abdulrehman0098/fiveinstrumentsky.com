(function () {
  'use strict';

  function brightCount(canvas) {
    if (!canvas || !canvas.width) return -1;
    try {
      var img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      var n = 0;
      for (var i = 0; i < img.length; i += 4) {
        if (img[i] > 200 && img[i + 1] > 200 && img[i + 2] > 200 && img[i + 3] > 150) n++;
      }
      return n;
    } catch (e) { return -2; }
  }

  function txt(id) {
    var e = document.getElementById(id);
    return e ? (e.textContent || '').trim() : '';
  }

  // A readout counts as live if it is not blank and not the em-dash placeholder.
  function live(id) {
    var v = txt(id);
    if (!v || v === '\u2014' || v === '-') return '\u2014';
    return v;
  }

  function tabName() {
    var active = document.querySelector('.instrument-panel:not(.hidden)');
    return active ? (active.getAttribute('data-tab') || active.id) : '(none)';
  }

  function starsValue() {
    var px = brightCount(document.getElementById('stars-canvas'));
    if (px <= 0) return '\u2014';
    var st = window.FI && window.FI.stars && window.FI.stars.state;
    return px + 'px' + (st ? '/fov' + Math.round(st.fov) : '');
  }

  // Classify an instrument readout honestly: idle / demo / live / missing.
  function classify(modName, id) {
    var v = live(id);
    if (v === '\u2014') return '\u2014';
    var s = window.FI && window.FI[modName] && window.FI[modName].state;
    if (!s) return v;
    if (!s.measuring) return 'idle';          // stopped - the DOM value is stale
    return (s.demo ? 'demo:' : 'live:') + v;
  }

  function vibValue() { return classify('vibration', 'vib-x'); }

  function altValue() {
    var v = live('alt-altitude');
    if (v === '\u2014') return '\u2014';
    var s = window.FI && window.FI.altimeter && window.FI.altimeter.state;
    if (!s) return v;
    if (!s.measuring) return 'idle';
    return (s.demo ? 'demo:' : 'live:') + v.replace(/\s+/g, '');
  }

  function magValue() { return classify('magnetic', 'mag-x'); }

  function soundValue() { return classify('sound', 'sound-db-current'); }

  function run() {
    var line = '[selfcheck] tab=' + tabName()
      + ' stars=' + starsValue()
      + ' vib=' + vibValue()
      + ' alt=' + altValue()
      + ' mag=' + magValue()
      + ' sound=' + soundValue()
      + ' errors=' + ((window.FI && window.FI.__errors) ? window.FI.__errors.length : 0);
    console.log(line);
    window.__FI_SELFCHECK_LIVE = line;
  }

  function start() {
    run();
    setInterval(run, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 3000); });
  } else {
    setTimeout(start, 3000);
  }
})();
