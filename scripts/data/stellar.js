/* ============================================================
   stellar.js — additive stellar-physics lookup.

   The star catalog (scripts/data/catalog.js) carries name / con /
   ra / dec / mag, but only ~50 of its 96 entries have spectral
   (sptype) and colour-index (bv) data, and those entries are not
   the brightest ones. This file supplies the missing values and a
   B-V -> RGB conversion, so the info panel can report a real star
   colour for every catalog entry.

   Additive by design: catalog.js is never modified. Lookups fall
   back gracefully to a magnitude-based white when a star is unknown.
   Classic IIFE, no imports. Exposes window.FI_STELLAR.
   ============================================================ */

(function () {
  'use strict';

  // name (lowercase) -> [B-V colour index, spectral type]
  // Standard catalogue values for bright stars.
  var DATA = {
    sirius:      [0.00,  'A1V'],
    canopus:     [0.15,  'F0Ib'],
    arcturus:    [1.23,  'K1.5III'],
    vega:        [0.00,  'A0V'],
    capella:     [0.80,  'G8III'],
    rigel:       [-0.03, 'B8Ia'],
    procyon:     [0.42,  'F5IV'],
    betelgeuse:  [1.85,  'M1-2Ia'],
    altair:      [0.22,  'A7V'],
    aldebaran:   [1.54,  'K5III'],
    antares:     [1.83,  'M1.5Iab'],
    spica:       [-0.23, 'B1V'],
    pollux:      [0.98,  'K0III'],
    fomalhaut:   [0.09,  'A3V'],
    deneb:       [0.09,  'A2Ia'],
    regulus:     [-0.11, 'B8IV'],
    adhara:      [-0.21, 'B2II'],
    shaula:      [-0.23, 'B1.5IV'],
    castor:      [0.03,  'A1V'],
    bellatrix:   [-0.22, 'B2III'],
    elnath:      [0.17,  'B7III'],
    alnilam:     [-0.18, 'B0Ia'],
    alnitak:     [-0.20, 'O9.5Ib'],
    alioth:      [-0.02, 'A1III'],
    dubhe:       [1.07,  'K0III'],
    mirfak:      [0.48,  'F5Ib'],
    alkaid:      [-0.10, 'B3V'],
    algol:       [-0.05, 'B8V'],
    polaris:     [0.60,  'F7Ib'],
    merak:       [0.03,  'A1V'],
    phecda:      [0.04,  'A0V'],
    megrez:      [0.08,  'A3V'],
    mizar:       [0.02,  'A2V'],
    alcor:       [0.16,  'A5V'],
    caph:        [0.34,  'F2III'],
    schedar:     [1.17,  'K0III'],
    ruchbah:     [0.13,  'A5IV'],
    segin:       [-0.15, 'B3III'],
    navi:        [-0.15, 'B0.5IV'],
    sadr:        [0.68,  'F8Iab'],
    albireo:     [1.13,  'K3II'],
    gienah:      [0.98,  'K0III'],
    rukh:        [0.02,  'B9.5IV'],
    algieba:     [0.89,  'K1III'],
    zosma:       [0.13,  'A4V'],
    denebola:    [0.09,  'A3V'],
    acrux:       [-0.19, 'B0.5IV'],
    mimosa:      [-0.24, 'B0.5III'],
    gacrux:      [1.59,  'M3.5III'],
    miaplacidus: [0.00,  'A2III'],
    alnair:      [-0.13, 'B6V'],
    wezen:       [0.67,  'F8Ia'],
    sargas:      [0.41,  'F0II'],
    kausaus:     [-0.03, 'B9.5III'],
    avior:       [1.28,  'K3III'],
    menkalinan:  [0.08,  'A1IV'],
    atria:       [1.44,  'K2III'],
    alhena:      [0.00,  'A1IV'],
    peacock:     [-0.12, 'B2IV'],
    mirzam:      [-0.23, 'B1II'],
    alphard:     [1.44,  'K3III'],
    hamal:       [1.15,  'K2III'],
    diphda:      [1.02,  'K0III'],
    nunki:       [-0.07, 'B2.5V'],
    menkent:     [1.01,  'K0III'],
    mirach:      [1.57,  'M0III'],
    saiph:       [-0.17, 'B0.5Ia'],
    kochab:      [1.47,  'K4III'],
    rasalhague:  [0.15,  'A5III'],
    almach:      [1.37,  'K3IIb'],
    thuban:      [-0.05, 'A0III']
  };

  // B-V -> sRGB stops. Anchored on the standard blackbody locus, so a
  // hot blue star really does come out blue-white and a cool one orange.
  var STOPS = [
    { bv: -0.35, rgb: [155, 176, 255] },  // O/B  deep blue-white
    { bv: -0.10, rgb: [170, 191, 255] },  // B    blue-white
    { bv:  0.00, rgb: [202, 215, 255] },  // A    blue-white / white
    { bv:  0.30, rgb: [248, 247, 255] },  // A/F  white
    { bv:  0.60, rgb: [255, 244, 234] },  // F/G  yellow-white
    { bv:  0.90, rgb: [255, 226, 190] },  // G    yellow
    { bv:  1.20, rgb: [255, 210, 161] },  // K    orange
    { bv:  1.60, rgb: [255, 181, 108] },  // K/M  orange-red
    { bv:  2.10, rgb: [255, 154, 90] }    // M    red
  ];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // Colour index -> "rgb(r,g,b)"
  function bvToRgb(bv) {
    var v = clamp(typeof bv === 'number' && isFinite(bv) ? bv : 0.3, STOPS[0].bv, STOPS[STOPS.length - 1].bv);
    for (var i = 0; i < STOPS.length - 1; i++) {
      var a = STOPS[i], b = STOPS[i + 1];
      if (v >= a.bv && v <= b.bv) {
        var t = (v - a.bv) / (b.bv - a.bv);
        return 'rgb(' +
          Math.round(lerp(a.rgb[0], b.rgb[0], t)) + ',' +
          Math.round(lerp(a.rgb[1], b.rgb[1], t)) + ',' +
          Math.round(lerp(a.rgb[2], b.rgb[2], t)) + ')';
      }
    }
    return 'rgb(255,255,255)';
  }

  // Colour index -> human-readable colour name.
  function bvToName(bv) {
    var v = typeof bv === 'number' && isFinite(bv) ? bv : 0.3;
    if (v < -0.10) return 'Blue-white';
    if (v < 0.30)  return 'Blue-white';
    if (v < 0.60)  return 'White';
    if (v < 0.90)  return 'Yellow-white';
    if (v < 1.20)  return 'Yellow-orange';
    if (v < 1.60)  return 'Orange';
    return 'Red';
  }

  // Spectral type -> human-readable colour name (fallback when no B-V).
  function sptypeToName(sp) {
    if (!sp) return null;
    var c = String(sp).charAt(0).toUpperCase();
    if (c === 'O' || c === 'B') return 'Blue-white';
    if (c === 'A') return 'White';
    if (c === 'F') return 'Yellow-white';
    if (c === 'G') return 'Yellow';
    if (c === 'K') return 'Orange';
    if (c === 'M') return 'Red';
    return null;
  }

  // Look up a star by name. Falls back to the catalog's own fields when
  // present, then to a magnitude-derived white.
  function lookup(star) {
    if (!star) return null;
    var key = String(star.name || '').toLowerCase();
    var row = DATA[key];

    var bv = (typeof star.bv === 'number' && isFinite(star.bv) && star.bv !== 0)
      ? star.bv
      : (row ? row[0] : null);

    var sptype = (star.sptype && String(star.sptype).length)
      ? star.sptype
      : (row ? row[1] : '');

    // No colour data at all: infer a neutral white from magnitude.
    var known = (bv !== null && bv !== undefined);
    var effBv = known ? bv : 0.3;

    return {
      bv: known ? bv : null,
      sptype: sptype || '',
      rgb: bvToRgb(effBv),
      colorName: sptypeToName(sptype) || bvToName(effBv)
    };
  }

  // ---- Search index ------------------------------------------------
  // Substring match over name, constellation, Bayer designation and id,
  // ranked: exact name > name prefix > word prefix > substring.
  function score(star, q) {
    var name = String(star.name || '').toLowerCase();
    var con = String(star.con || '').toLowerCase();
    var bayer = String(star.bayer || '').toLowerCase();
    var id = String(star.id || '').toLowerCase();

    if (name === q) return 0;
    if (name.indexOf(q) === 0) return 1;
    if (id.indexOf(q) === 0) return 2;
    if (bayer.indexOf(q) === 0) return 3;
    if (name.indexOf(q) > -1) return 4;
    if (bayer.indexOf(q) > -1) return 5;
    if (con.indexOf(q) === 0) return 6;
    if (con.indexOf(q) > -1) return 7;
    return -1;
  }

  function search(query, catalog, limit) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    var out = [];
    for (var i = 0; i < catalog.length; i++) {
      var s = score(catalog[i], q);
      if (s > -1) out.push({ star: catalog[i], score: s, mag: catalog[i].mag });
    }
    out.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return a.mag - b.mag;   // brighter first within the same rank
    });
    // De-duplicate by name, keeping the best-ranked entry. The catalog
    // contains a few repeated names with conflicting coordinates.
    var seen = {}, deduped = [];
    for (var j = 0; j < out.length; j++) {
      var nm = String(out[j].star.name || '').toLowerCase();
      if (seen[nm]) continue;
      seen[nm] = true;
      deduped.push(out[j]);
    }
    return deduped.slice(0, limit || 6);
  }

  window.FI_STELLAR = {
    lookup: lookup,
    bvToRgb: bvToRgb,
    bvToName: bvToName,
    sptypeToName: sptypeToName,
    search: search,
    table: DATA
  };
})();
