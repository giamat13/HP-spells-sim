/* Voiceprint: recognises a spell from the sound itself, without speech
   recognition. Speech recognition turns a spell into English words and often
   gets them wrong; this compares how the words actually *sound* against
   recordings you trained, so it can catch what the words miss. The two
   verdicts are combined in voice.js.

   It also decides on its own when you stopped talking (a simple energy-based
   endpoint), which is what makes it fast: a verdict lands about 0.4 s after you stop, instead of
   waiting for the recognizer's final result, which takes a second or more.

   A "print" is a small fingerprint of one spoken utterance: MFCC-style
   cepstral coefficients per frame, length-normalised to a fixed number of
   frames and quantised to one byte each, so a print is a short string that
   can live in a JSON file. Matching is DTW (so a slower or faster delivery of
   the same word still lines up) over cosine distance.
   Global: Voiceprint */
(function () {
  'use strict';

  var RATE = 16000;        // everything is resampled to this before analysis
  var WIN = 400;           // 25 ms window
  var HOP = 160;           // 10 ms hop
  var NFFT = 512;
  var MEL_BANDS = 26, MEL_LO = 80, MEL_HI = 7000;
  var DIMS = 13;           // cepstral coefficients kept (c1..c13; c0 is loudness)
  var FRAMES = 24;         // every print is stretched/squeezed to this length
  var BAND = 6;            // DTW band radius, in frames
  var MIN_FRAMES = 5;

  /* ---------- small DSP helpers ---------- */

  var cosTab = null, sinTab = null;
  function initTables() {
    if (cosTab) return;
    cosTab = new Float32Array(NFFT / 2);
    sinTab = new Float32Array(NFFT / 2);
    for (var i = 0; i < NFFT / 2; i++) {
      cosTab[i] = Math.cos(-2 * Math.PI * i / NFFT);
      sinTab[i] = Math.sin(-2 * Math.PI * i / NFFT);
    }
  }

  // In-place iterative radix-2 FFT (NFFT is a power of two).
  function fft(re, im) {
    var n = re.length, i, j = 0, bit, len, half, step, k, tr, ti;
    for (i = 1; i < n; i++) {
      bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        tr = re[i]; re[i] = re[j]; re[j] = tr;
        ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (len = 2; len <= n; len <<= 1) {
      half = len >> 1;
      step = n / len;
      for (i = 0; i < n; i += len) {
        for (k = 0; k < half; k++) {
          var c = cosTab[k * step], s = sinTab[k * step];
          var a = i + k, b = a + half;
          var vr = re[b] * c - im[b] * s;
          var vi = re[b] * s + im[b] * c;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr; im[a] += vi;
        }
      }
    }
  }

  function hzToMel(f) { return 2595 * Math.log(1 + f / 700) / Math.LN10; }
  function melToHz(m) { return 700 * (Math.pow(10, m / 2595) - 1); }

  // Triangular mel filterbank as {start, weights} per band over FFT bins.
  var melBank = null;
  function initMel() {
    if (melBank) return;
    var lo = hzToMel(MEL_LO), hi = hzToMel(Math.min(MEL_HI, RATE / 2));
    var pts = [];
    for (var i = 0; i < MEL_BANDS + 2; i++) {
      var hz = melToHz(lo + (hi - lo) * i / (MEL_BANDS + 1));
      pts.push(Math.floor(hz / (RATE / NFFT)));
    }
    melBank = [];
    for (var b = 0; b < MEL_BANDS; b++) {
      var a = pts[b], mid = pts[b + 1], c = pts[b + 2];
      if (c <= a) { melBank.push({ start: a, w: new Float32Array(1) }); continue; }
      var w = new Float32Array(c - a + 1);
      for (var k = a; k <= c; k++) {
        w[k - a] = k <= mid
          ? (mid === a ? 1 : (k - a) / (mid - a))
          : (c === mid ? 1 : (c - k) / (c - mid));
      }
      melBank.push({ start: a, w: w });
    }
  }

  // Cheap linear-interpolation resample. Averaging over the source step first
  // keeps aliasing down when downsampling (48k -> 16k is the usual case).
  function resample(samples, from, to) {
    if (!from || from === to) return samples;
    var ratio = from / to, n = Math.floor(samples.length / ratio);
    var out = new Float32Array(n), span = Math.max(1, Math.floor(ratio));
    for (var i = 0; i < n; i++) {
      var start = Math.floor(i * ratio), sum = 0, c = 0;
      for (var j = start; j < start + span && j < samples.length; j++) { sum += samples[j]; c++; }
      out[i] = c ? sum / c : 0;
    }
    return out;
  }

  /* ---------- features ---------- */

  // Per-frame cepstral coefficients: [frames][DIMS], already mean-normalised
  // (which cancels out the microphone's own colouring) and unit length per
  // frame (so loudness doesn't matter, only the shape of the sound).
  function cepstra(samples) {
    initTables();
    initMel();
    var n = samples.length;
    if (n < WIN) return [];
    var pre = new Float32Array(n);      // pre-emphasis lifts the quiet high end
    pre[0] = samples[0];
    for (var i = 1; i < n; i++) pre[i] = samples[i] - 0.97 * samples[i - 1];

    var window = new Float32Array(WIN);
    for (i = 0; i < WIN; i++) window[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (WIN - 1));

    var frames = [];
    var re = new Float32Array(NFFT), im = new Float32Array(NFFT);
    var logMel = new Float32Array(MEL_BANDS);
    for (var off = 0; off + WIN <= n; off += HOP) {
      re.fill(0); im.fill(0);
      for (i = 0; i < WIN; i++) re[i] = pre[off + i] * window[i];
      fft(re, im);
      for (var b = 0; b < MEL_BANDS; b++) {
        var f = melBank[b], sum = 0;
        for (var k = 0; k < f.w.length; k++) {
          var bin = f.start + k;
          if (bin >= NFFT / 2) break;
          sum += (re[bin] * re[bin] + im[bin] * im[bin]) * f.w[k];
        }
        logMel[b] = Math.log(sum + 1e-10);
      }
      var c = new Float32Array(DIMS);
      for (var d = 0; d < DIMS; d++) {   // DCT-II, skipping c0
        var acc = 0;
        for (b = 0; b < MEL_BANDS; b++) acc += logMel[b] * Math.cos(Math.PI * (d + 1) * (b + 0.5) / MEL_BANDS);
        c[d] = acc;
      }
      frames.push(c);
    }
    if (!frames.length) return frames;

    for (d = 0; d < DIMS; d++) {         // cepstral mean normalisation
      var mean = 0;
      for (i = 0; i < frames.length; i++) mean += frames[i][d];
      mean /= frames.length;
      for (i = 0; i < frames.length; i++) frames[i][d] -= mean;
    }
    for (i = 0; i < frames.length; i++) {
      var norm = 0;
      for (d = 0; d < DIMS; d++) norm += frames[i][d] * frames[i][d];
      norm = Math.sqrt(norm) || 1;
      for (d = 0; d < DIMS; d++) frames[i][d] /= norm;
    }
    return frames;
  }

  // Stretch/squeeze a frame sequence to exactly FRAMES frames.
  function toFixedLength(frames) {
    var out = [];
    for (var i = 0; i < FRAMES; i++) {
      var pos = (frames.length - 1) * i / (FRAMES - 1);
      var a = Math.floor(pos), t = pos - a, b = Math.min(frames.length - 1, a + 1);
      var v = new Float32Array(DIMS);
      for (var d = 0; d < DIMS; d++) v[d] = frames[a][d] * (1 - t) + frames[b][d] * t;
      out.push(v);
    }
    return out;
  }

  /* ---------- encoding ---------- */

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function encode(frames) {
    var bytes = [];
    for (var i = 0; i < frames.length; i++) {
      for (var d = 0; d < DIMS; d++) {
        var q = Math.round(Math.max(-1, Math.min(1, frames[i][d])) * 127);
        bytes.push(q < 0 ? q + 256 : q);
      }
    }
    var s = '';
    for (i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      s += B64[b0 >> 2];
      s += B64[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
      s += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
      s += b2 === undefined ? '=' : B64[b2 & 63];
    }
    return s;
  }

  function decode(str) {
    var clean = String(str).replace(/[^A-Za-z0-9+/]/g, ''), bytes = [];
    for (var i = 0; i < clean.length; i += 4) {
      var n = 0, have = 0;
      for (var j = 0; j < 4; j++) {
        var c = B64.indexOf(clean[i + j]);
        if (c < 0) break;
        n = (n << 6) | c; have++;
      }
      n <<= 6 * (4 - have);
      if (have > 1) bytes.push((n >> 16) & 255);
      if (have > 2) bytes.push((n >> 8) & 255);
      if (have > 3) bytes.push(n & 255);
    }
    var frames = [], count = Math.floor(bytes.length / DIMS);
    for (i = 0; i < count; i++) {
      var v = new Float32Array(DIMS);
      for (var d = 0; d < DIMS; d++) {
        var b = bytes[i * DIMS + d];
        v[d] = (b > 127 ? b - 256 : b) / 127;
      }
      frames.push(v);
    }
    return frames;
  }

  /* ---------- building and comparing prints ---------- */

  // A print, or null when there wasn't enough voiced sound to judge.
  function fromSamples(samples, rate) {
    var s = resample(samples, rate, RATE);
    s = trimSilence(s);
    var frames = cepstra(s);
    if (frames.length < MIN_FRAMES) return null;
    return encode(toFixedLength(frames));
  }

  function trimSilence(s) {
    var block = 160, peak = 0, energies = [];
    for (var i = 0; i + block <= s.length; i += block) {
      var sum = 0;
      for (var j = 0; j < block; j++) sum += s[i + j] * s[i + j];
      var rms = Math.sqrt(sum / block);
      energies.push(rms);
      if (rms > peak) peak = rms;
    }
    if (!energies.length || peak <= 0) return s;
    var gate = peak * 0.12, first = -1, last = -1;
    for (i = 0; i < energies.length; i++) {
      if (energies[i] < gate) continue;
      if (first < 0) first = i;
      last = i;
    }
    if (first < 0) return s;
    var from = Math.max(0, (first - 2) * block);
    var to = Math.min(s.length, (last + 3) * block);
    return s.subarray(from, to);
  }

  function frameNorms(frames) {
    var out = new Float64Array(frames.length);
    for (var i = 0; i < frames.length; i++) {
      var sum = 0;
      for (var d = 0; d < DIMS; d++) sum += frames[i][d] * frames[i][d];
      out[i] = Math.sqrt(sum) || 1e-9;
    }
    return out;
  }

  // DTW over cosine distance, restricted to a diagonal band. Returns 0..1,
  // where 1 is an exact match.
  function compare(printA, printB) {
    var a = typeof printA === 'string' ? decode(printA) : printA;
    var b = typeof printB === 'string' ? decode(printB) : printB;
    if (!a.length || !b.length) return 0;
    var n = a.length, m = b.length, INF = 1e9;
    // Frames leave cepstra() unit length, but quantising to a byte nudges that,
    // so divide by the real norms rather than trusting them.
    var na = frameNorms(a), nb = frameNorms(b);
    var prev = new Float64Array(m + 1), cur = new Float64Array(m + 1);
    var prevLen = new Float64Array(m + 1), curLen = new Float64Array(m + 1);
    prev.fill(INF); prev[0] = 0;
    for (var i = 1; i <= n; i++) {
      cur.fill(INF); curLen.fill(0);
      var lo = Math.max(1, i - BAND), hi = Math.min(m, i + BAND);
      for (var j = lo; j <= hi; j++) {
        var dot = 0, av = a[i - 1], bv = b[j - 1];
        for (var d = 0; d < DIMS; d++) dot += av[d] * bv[d];
        var cost = 1 - dot / (na[i - 1] * nb[j - 1]);   // cosine distance
        var best = prev[j - 1], bestLen = prevLen[j - 1];
        if (prev[j] < best) { best = prev[j]; bestLen = prevLen[j]; }
        if (cur[j - 1] < best) { best = cur[j - 1]; bestLen = curLen[j - 1]; }
        cur[j] = best + cost;
        curLen[j] = bestLen + 1;
      }
      var t = prev; prev = cur; cur = t;
      t = prevLen; prevLen = curLen; curLen = t;
    }
    if (prev[m] >= INF || !prevLen[m]) return 0;
    var avg = prev[m] / prevLen[m];               // mean cosine distance per step
    return Math.max(0, Math.min(1, 1 - avg / 0.8));
  }

  // Best similarity per spell: { spellId: 0..1 } against {spellId: [print]}.
  function matchAll(print, library) {
    var out = {};
    if (!print || !library) return out;
    Object.keys(library).forEach(function (id) {
      var list = library[id] || [], best = 0;
      for (var i = 0; i < list.length; i++) {
        var s = compare(print, list[i]);
        if (s > best) best = s;
      }
      if (list.length) out[id] = best;
    });
    return out;
  }

  /* ---------- live microphone with its own end-of-speech detection ---------- */

  var START_MIN = 0.012, START_FACTOR = 3.5;
  // How long a silence ends an utterance. It has to outlast the pause inside a
  // two-word spell ("Avada ... Kedavra", "Lumos ... Maxima"), which runs up to
  // about 300 ms; at 220 ms those were cut into two halves that matched
  // nothing. Lower = faster but splits more; higher = slower to cast.
  var END_SILENCE_MS = 400, MIN_SPEECH_MS = 180, MAX_SPEECH_MS = 3200, PREROLL_MS = 160;

  // opts: { onStart(), onEnd(print, samples, rate), onLevel(rms, speaking) }
  // (the utterance lasted samples.length / rate seconds)
  // Resolves with { close() }, or rejects if the microphone isn't available.
  function open(opts) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('no-audio'));
    }
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var ctx = new Ctx();
      var rate = ctx.sampleRate;
      var src = ctx.createMediaStreamSource(stream);
      var proc = ctx.createScriptProcessor(1024, 1, 1);
      var mute = ctx.createGain();
      mute.gain.value = 0;                 // keep the node alive without echoing
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);

      var floor = 0.01, speaking = false, quietMs = 0, voicedMs = 0;
      var chunks = [], preroll = [], prerollBlocks = Math.ceil(PREROLL_MS / 1000 * rate / 1024);

      function finish() {
        var total = 0, i;
        for (i = 0; i < chunks.length; i++) total += chunks[i].length;
        var all = new Float32Array(total), at = 0;
        for (i = 0; i < chunks.length; i++) { all.set(chunks[i], at); at += chunks[i].length; }
        chunks = [];
        speaking = false; quietMs = 0; voicedMs = 0;
        if (opts.onEnd) opts.onEnd(fromSamples(all, rate), all, rate);
      }

      proc.onaudioprocess = function (ev) {
        var input = ev.inputBuffer.getChannelData(0);
        var block = new Float32Array(input);        // the event's buffer is reused
        var sum = 0;
        for (var i = 0; i < block.length; i++) sum += block[i] * block[i];
        var rms = Math.sqrt(sum / block.length);
        var ms = block.length / rate * 1000;

        floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.995 + rms * 0.005;
        var gate = Math.max(START_MIN, floor * START_FACTOR);

        if (!speaking) {
          preroll.push(block);
          if (preroll.length > prerollBlocks) preroll.shift();
          if (rms > gate) {
            speaking = true; voicedMs = 0; quietMs = 0;
            chunks = preroll.slice();
            preroll = [];
            if (opts.onStart) opts.onStart();
          }
        } else {
          chunks.push(block);
          voicedMs += ms;
          quietMs = rms > gate * 0.6 ? 0 : quietMs + ms;
          if ((quietMs >= END_SILENCE_MS && voicedMs >= MIN_SPEECH_MS) || voicedMs >= MAX_SPEECH_MS) {
            finish();
          } else if (quietMs >= END_SILENCE_MS) {
            chunks = []; speaking = false; quietMs = 0; voicedMs = 0;   // too short: a cough or a click
          }
        }
        if (opts.onLevel) opts.onLevel(rms, speaking);
      };

      return {
        close: function () {
          proc.onaudioprocess = null;
          try { src.disconnect(); proc.disconnect(); mute.disconnect(); } catch (e) {}
          stream.getTracks().forEach(function (t) { t.stop(); });
          if (ctx.state !== 'closed') ctx.close();
        }
      };
    });
  }

  /* ---------- recordings ---------- */

  // One print per spoken chunk in a decoded AudioBuffer, so a recording with
  // several attempts gives several prints.
  function fromAudioBuffer(buffer) {
    var data = buffer.getChannelData(0), rate = buffer.sampleRate;
    var block = Math.round(rate * 0.02), energies = [], i, j;
    for (i = 0; i + block <= data.length; i += block) {
      var sum = 0;
      for (j = 0; j < block; j++) sum += data[i + j] * data[i + j];
      energies.push(Math.sqrt(sum / block));
    }
    if (!energies.length) return [];
    var peak = Math.max.apply(null, energies), gate = Math.max(0.01, peak * 0.15);
    var segs = [], start = -1, quiet = 0, quietBlocks = Math.ceil(0.22 / 0.02);
    for (i = 0; i < energies.length; i++) {
      if (energies[i] > gate) {
        if (start < 0) start = i;
        quiet = 0;
      } else if (start >= 0 && ++quiet >= quietBlocks) {
        segs.push([start, i - quiet]); start = -1; quiet = 0;
      }
    }
    if (start >= 0) segs.push([start, energies.length - 1]);

    var out = [];
    segs.forEach(function (s) {
      var from = Math.max(0, (s[0] - 3) * block), to = Math.min(data.length, (s[1] + 4) * block);
      if (to - from < rate * 0.15) return;
      var print = fromSamples(data.subarray(from, to), rate);
      if (print) out.push({ print: print, at: from / rate, end: to / rate });
    });
    return out;
  }

  window.Voiceprint = {
    FRAMES: FRAMES,
    DIMS: DIMS,
    fromSamples: fromSamples,
    fromAudioBuffer: fromAudioBuffer,
    compare: compare,
    matchAll: matchAll,
    encode: encode,
    decode: decode,
    open: open
  };
})();
