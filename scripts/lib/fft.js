/* ============================================================
   fft.js — radix-2 FFT, returns array of {re, im}
   ============================================================ */

function fft(signal) {
  const N = signal.length;
  const m = Math.ceil(Math.log2(N));
  const M = 1 << m;
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  for (let i = 0; i < N; i++) re[i] = signal[i];
  for (let i = N; i < M; i++) re[i] = 0;
  for (let len = 2; len <= M; len *= 2) {
    const halfLen = len / 2;
    const wRe = Math.cos(-2 * Math.PI / len);
    const wIm = Math.sin(-2 * Math.PI / len);
    for (let i = 0; i < M; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const tRe = curRe * re[i + j + halfLen] - curIm * im[i + j + halfLen];
        const tIm = curRe * im[i + j + halfLen] + curIm * re[i + j + halfLen];
        re[i + j + halfLen] = re[i + j] - tRe;
        im[i + j + halfLen] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newRe;
      }
    }
  }
  const result = [];
  for (let i = 0; i < M; i++) result.push({ re: re[i], im: im[i] });
  return result;
}
