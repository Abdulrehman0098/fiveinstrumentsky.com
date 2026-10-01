(function () {
  'use strict';
  window.FI = window.FI || {};
  window.FI.iss = {
    tle: null,
    computeISS: function () { return null; },
    predictPasses: function () { return []; }
  };
  console.log('[iss] stub loaded — not on critical path');
})();