/* ============================================================
   fft.js — radix-2 FFT for vibration + sound spectrum analysis
   Vendored. No runtime network.
   ============================================================ */

const FFT = (() => {
  'use strict';

  /* ---------- Radix-2 FFT (in-place, complex) ---------- */

  function fft(re, im) {
    const n = re.length;
    if (n <= 1) return;

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
      if (i < j) {
        const tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        const tmp2 = im[i]; im[i] = im[j]; im[j] = tmp2;
      }
      let k = n >> 1;
      while (k <= j) { j -= k; k >>= 1; }
      j += k;
    }

    // Cooley-Tukey iterative
    for (let len = 2; len <= n; len *= 2) {
      const halfLen = len >> 1;
      const angle = -2 * Math.PI / len;
      const wRe = Math.cos(angle);
      const wIm = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let curRe = 1, curIm = 0;
        for (let j = 0; j < halfLen; j++) {
          const k = i + j;
          const l = k + halfLen;
          const tRe = curRe * re[l] - curIm * im[l];
          const tIm = curRe * im[l] + curIm * re[l];
          re[l] = re[k] - tRe;
          im[l] = im[k] - tIm;
          re[k] += tRe;
          im[k] += tIm;
          const newRe = curRe * wRe - curIm * wIm;
          const newIm = curRe * wIm + curIm * wRe;
          curRe = newRe;
          curIm = newIm;
        }
      }
    }
  }

  /* ---------- Complex magnitude ---------- */

  function magnitude(re, im) {
    return Math.sqrt(re * re + im * im);
  }

  function magnitudeDB(re, im, reference) {
    reference = reference || 1;
    const m = magnitude(re, im);
    if (m < 1e-10) return -120;
    return 20 * Math.log10(m / reference);
  }

  /* ---------- Spectrum from time-domain samples ---------- */

  function spectrum(samples) {
    const n = samples.length;
    const fftN = 1 << (Math.log2(n) | 0); // next power of 2
    const re = new Float64Array(fftN);
    const im = new Float64Array(fftN);
    for (let i = 0; i < Math.min(n, fftN); i++) {
      re[i] = samples[i];
    }
    fft(re, im);

    const mag = new Float64Array(fftN >> 1);
    for (let i = 0; i < fftN >> 1; i++) {
      mag[i] = magnitude(re[i], im[i]);
    }
    return { magnitudes: mag, n: fftN, sampleRate: null };
  }

  /* ---------- Frequency bins ---------- */

  function freqBins(magnitudeCount, sampleRate) {
    const bins = [];
    for (let i = 0; i < magnitudeCount; i++) {
      bins.push((i / magnitudeCount) * sampleRate);
    }
    return bins;
  }

  /* ---------- Find peak frequency ---------- */

  function findPeak(magnitudes, sampleRate) {
    const n = magnitudes.length;
    let peakIdx = 0;
    let peakVal = 0;
    for (let i = 0; i < n; i++) {
      if (magnitudes[i] > peakVal) {
        peakVal = magnitudes[i];
        peakIdx = i;
      }
    }
    const freq = (peakIdx / n) * sampleRate;
    return { frequency: freq, magnitude: peakVal, index: peakIdx };
  }

  /* ---------- RMS ---------- */

  function rms(samples) {
    let sum = 0;
    for (const s of samples) sum += s * s;
    return Math.sqrt(sum / samples.length);
  }

  /* ---------- A-weighting curve ---------- */

  // IEEE 1986 A-weighting: gain in dB as a function of frequency (Hz)
  function aWeightDB(f) {
    if (f <= 0) return 0;
    const f2 = f * f;
    const f4 = f2 * f2;
    const num = 12194 * 12194 * f4;
    const den = (f2 + 20.6 * 20.6) * (f2 + 12194 * 12194) * (f2 + 7.5e6) * (f2 + 1e10);
    const A = 10 * Math.log10(num / den);
    return A;
  }

  // Pre-computed lookup table (20 Hz – 20 kHz, 1/6-octave steps)
  const A_WEIGHT_TABLE = (() => {
    const table = [];
    for (let f = 20; f <= 20000; f *= 1.059463094) { // 1/12 octave
      table.push({ freq: f, gain: aWeightDB(f) });
    }
    return table;
  })();

  function aWeightGain(freq) {
    // Binary search in pre-computed table
    let lo = 0, hi = A_WEIGHT_TABLE.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (A_WEIGHT_TABLE[mid].freq <= freq) lo = mid;
      else hi = mid - 1;
    }
    if (lo === hi) return A_WEIGHT_TABLE[lo].gain;
    const a = A_WEIGHT_TABLE[lo];
    const b = A_WEIGHT_TABLE[Math.min(lo + 1, A_WEIGHT_TABLE.length - 1)];
    const t = (freq - a.freq) / (b.freq - a.freq);
    return a.gain + (b.gain - a.gain) * t;
  }

  /* ---------- A-weighted RMS from FFT magnitudes ---------- */

  function aWeightedRMS(magnitudes, sampleRate) {
    const n = magnitudes.length;
    let sumWeighted = 0;
    let sumWeights = 0;
    const df = sampleRate / (2 * n); // frequency bin width

    for (let i = 0; i < n; i++) {
      const freq = (i / n) * (sampleRate / 2);
      const gainDB = aWeightGain(freq);
      const gainLin = Math.pow(10, gainDB / 20);
      sumWeighted += magnitudes[i] * magnitudes[i] * gainLin * gainLin * df;
      sumWeights += gainLin * gainLin * df;
    }

    if (sumWeights < 1e-20) return 0;
    return Math.sqrt(sumWeighted / sumWeights);
  }

  /* ---------- Hanning window ---------- */

  function hanningWindow(n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    }
    return w;
  }

  /* ---------- Apply window + FFT, return spectrum ---------- */

  function analyze(samples, sampleRate) {
    const n = samples.length;
    const win = hanningWindow(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      re[i] = samples[i] * win[i];
      im[i] = 0;
    }

    // Zero-pad to next power of 2
    const fftN = 1 << (Math.log2(n) | 0);
    const rePadded = new Float64Array(fftN);
    const imPadded = new Float64Array(fftN);
    for (let i = 0; i < n; i++) {
      rePadded[i] = re[i];
    }

    fft(rePadded, imPadded);

    const mag = new Float64Array(fftN >> 1);
    for (let i = 0; i < fftN >> 1; i++) {
      mag[i] = magnitude(rePadded[i], imPadded[i]) / (n / 2);
    }

    return {
      magnitudes: mag,
      frequencyBins: freqBins(fftN >> 1, sampleRate),
      n,
      fftN,
    };
  }

  /* ---------- Convolution for 1/3-octave bands ---------- */

  function thirdOctaveBands(samples, sampleRate, startFreq, endFreq) {
    const bands = [];
    // 1/3-octave center frequencies from 20 Hz to 20 kHz
    const centerFreqs = [];
    for (let f = 20; f <= 20000; f *= Math.pow(2, 1/3)) {
      centerFreqs.push(f);
    }

    const n = samples.length;
    const win = hanningWindow(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      re[i] = samples[i] * win[i];
      im[i] = 0;
    }

    const fftN = 1 << (Math.log2(n) | 0);
    const reP = new Float64Array(fftN);
    const imP = new Float64Array(fftN);
    for (let i = 0; i < n; i++) reP[i] = re[i];
    fft(reP, imP);

    const df = sampleRate / fftN;

    for (const cf of centerFreqs) {
      if (cf < startFreq || cf > endFreq) continue;
      const lower = cf / Math.pow(2, 1/6);
      const upper = cf * Math.pow(2, 1/6);
      let energy = 0;
      for (let i = 1; i < fftN / 2; i++) {
        const f = i * df;
        if (f >= lower && f <= upper) {
          energy += magnitude(reP[i], imP[i]) ** 2;
        }
      }
      bands.push({
        centerFreq: cf,
        rms: Math.sqrt(energy / (upper - lower) / df),
        dB: energy > 0 ? 20 * Math.log10(Math.sqrt(energy / (upper - lower) / df) / 1e-5) : -120,
      });
    }

    return bands;
  }

  /* ---------- Web Worker message interface (for heavy FFT) ---------- */

  function fftWorkerMessage(samples, sampleRate) {
    return {
      type: 'fft',
      samples: Array.from(samples),
      sampleRate: sampleRate,
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    };
  }

  return {
    fft,
    magnitude,
    magnitudeDB,
    spectrum,
    freqBins,
    findPeak,
    rms,
    aWeightDB,
    aWeightGain,
    aWeightedRMS,
    hanningWindow,
    analyze,
    thirdOctaveBands,
    fftWorkerMessage,
  };
})();

export default FFT;
