/* All sound is synthesized with the Web Audio API: forest ambience,
   a music-box score, reverb space, cast sounds and per-animal sounds.
   Global: AudioSys */
(function () {
  'use strict';

  var ctx = null;
  var master, dryBus, wetBus, convolver;
  var noiseBuf;
  var muted = false;
  var musicGain, windGain, timers = [];

  function now() { return ctx.currentTime; }

  function makeNoise() {
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Generated impulse response: the "forest cathedral" reverb.
  function makeImpulse(seconds, decay) {
    var len = ctx.sampleRate * seconds;
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // Connect a node to the space: part dry, part reverberant.
  function out(node, dry, wet) {
    var d = ctx.createGain(); d.gain.value = dry == null ? 0.7 : dry;
    var w = ctx.createGain(); w.gain.value = wet == null ? 0.4 : wet;
    node.connect(d); d.connect(dryBus);
    node.connect(w); w.connect(convolver);
    return node;
  }

  function noiseSource(loop) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = loop !== false;
    return s;
  }

  /* ---------- ambience ---------- */

  function startWind() {
    var src = noiseSource();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0.05;
    src.connect(lp); lp.connect(windGain);
    out(windGain, 0.8, 0.25);
    // slow gusting
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    var lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.028;
    lfo.connect(lfoAmt); lfoAmt.connect(windGain.gain);
    var lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.017;
    var lfo2Amt = ctx.createGain(); lfo2Amt.gain.value = 160;
    lfo2.connect(lfo2Amt); lfo2Amt.connect(lp.frequency);
    src.start(); lfo.start(); lfo2.start();

    // leaves rustling: gusty high noise
    var src2 = noiseSource();
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2600;
    var g2 = ctx.createGain(); g2.gain.value = 0.012;
    src2.connect(hp); hp.connect(g2);
    out(g2, 0.6, 0.35);
    var lfo3 = ctx.createOscillator(); lfo3.frequency.value = 0.11;
    var lfo3Amt = ctx.createGain(); lfo3Amt.gain.value = 0.009;
    lfo3.connect(lfo3Amt); lfo3Amt.connect(g2.gain);
    src2.start(); lfo3.start();
  }

  function startCrickets() {
    var osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 4250;
    var trill = ctx.createOscillator();
    trill.type = 'square'; trill.frequency.value = 23;
    var trillAmt = ctx.createGain(); trillAmt.gain.value = 1;
    var gate = ctx.createGain(); gate.gain.value = 0;
    var vol = ctx.createGain(); vol.gain.value = 0;
    osc.connect(gate); trill.connect(trillAmt); trillAmt.connect(gate.gain);
    gate.connect(vol);
    out(vol, 0.5, 0.3);
    osc.start(); trill.start();
    function chirp() {
      if (!muted) {
        var t = now();
        vol.gain.cancelScheduledValues(t);
        vol.gain.setValueAtTime(0, t);
        vol.gain.linearRampToValueAtTime(0.006, t + 0.25);
        vol.gain.setValueAtTime(0.006, t + 0.9 + Math.random() * 1.2);
        vol.gain.linearRampToValueAtTime(0, t + 1.6 + Math.random() * 1.2);
      }
      timers.push(setTimeout(chirp, 2500 + Math.random() * 5000));
    }
    chirp();
  }

  function scheduleHowl() {
    timers.push(setTimeout(function () {
      distantHowl();
      scheduleHowl();
    }, 45000 + Math.random() * 60000));
  }

  function distantHowl() {
    var t = now();
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(310, t);
    osc.frequency.linearRampToValueAtTime(420, t + 0.9);
    osc.frequency.linearRampToValueAtTime(330, t + 2.6);
    var vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    var vibAmt = ctx.createGain(); vibAmt.gain.value = 6;
    vib.connect(vibAmt); vibAmt.connect(osc.frequency);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.7);
    g.gain.linearRampToValueAtTime(0, t + 3.0);
    osc.connect(g);
    out(g, 0.15, 0.85);                       // far away: nearly all reverb
    osc.start(t); vib.start(t);
    osc.stop(t + 3.1); vib.stop(t + 3.1);
  }

  /* ---------- music box ---------- */

  function midiFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Celesta-like pluck.
  function pluck(midi, when, vel) {
    var f = midiFreq(midi);
    var o1 = ctx.createOscillator(); o1.frequency.value = f;
    var o2 = ctx.createOscillator(); o2.frequency.value = f * 3.98;
    var g1 = ctx.createGain(), g2 = ctx.createGain();
    var env = ctx.createGain();
    g1.gain.value = 1; g2.gain.value = 0.22;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(vel, when + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 2.2);
    o1.connect(g1); o2.connect(g2);
    g1.connect(env); g2.connect(env);
    env.connect(musicGain);
    o1.start(when); o2.start(when);
    o1.stop(when + 2.3); o2.stop(when + 2.3);
  }

  // Original slow waltz in E minor (24 beats loop). [beat, midi, velocity]
  var MELODY = [
    [0, 64, 1], [1, 67, 0.7], [2, 71, 0.8],
    [3, 76, 1], [5, 74, 0.6],
    [6, 71, 0.9], [7, 67, 0.6], [8, 69, 0.7],
    [9, 64, 0.9],
    [12, 64, 1], [13, 67, 0.7], [14, 71, 0.8],
    [15, 76, 1], [17, 79, 0.7],
    [18, 78, 0.9], [19, 74, 0.6], [20, 71, 0.7],
    [21, 69, 0.8], [23, 67, 0.5],
    // low bells
    [0, 52, 0.5], [9, 45, 0.4], [15, 52, 0.5]
  ];
  var BEAT = 0.72, LOOP_BEATS = 24;

  function startMusic() {
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.05;
    out(musicGain, 0.4, 0.75);
    var loopStart = now() + 1.5;
    var scheduledTo = 0;                       // never schedule the same note twice
    function schedule() {
      var horizon = now() + 0.6;
      while (loopStart + LOOP_BEATS * BEAT < horizon) loopStart += LOOP_BEATS * BEAT;
      for (var i = 0; i < MELODY.length; i++) {
        var t = loopStart + MELODY[i][0] * BEAT;
        if (t >= scheduledTo && t < horizon) pluck(MELODY[i][1], t, MELODY[i][2] * 0.6);
      }
      scheduledTo = horizon;
      timers.push(setTimeout(schedule, 250));
    }
    schedule();
  }

  /* ---------- cast sounds ---------- */

  function intake() {
    var t = now();
    var src = noiseSource(false);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2100, t + 0.75);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.55);
    g.gain.linearRampToValueAtTime(0, t + 0.85);
    src.connect(bp); bp.connect(g);
    out(g, 0.75, 0.35);
    src.start(t); src.stop(t + 0.9);
  }

  function sparkBurst() {
    var t = now();
    var src = noiseSource(false);
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3800;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(hp); hp.connect(g);
    out(g, 0.7, 0.5);
    src.start(t); src.stop(t + 0.25);
    var o = ctx.createOscillator(); o.frequency.value = 1420;
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.09, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(og); out(og, 0.6, 0.6);
    o.start(t); o.stop(t + 0.55);
  }

  // Rising hum/whoosh while the patronus forms. Returns a stop handle.
  function buildup(dur) {
    var t = now();
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(210, t + dur);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(240, t);
    lp.frequency.exponentialRampToValueAtTime(3600, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + dur);
    o.connect(lp); lp.connect(g);
    out(g, 0.6, 0.55);

    var src = noiseSource(false);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.09, t + dur);
    src.connect(bp); bp.connect(ng);
    out(ng, 0.6, 0.5);
    o.start(t); src.start(t);
    return {
      release: function () {
        var r = now();
        g.gain.cancelScheduledValues(r);
        ng.gain.cancelScheduledValues(r);
        g.gain.setValueAtTime(g.gain.value, r);
        ng.gain.setValueAtTime(ng.gain.value, r);
        g.gain.exponentialRampToValueAtTime(0.0001, r + 1.2);
        ng.gain.exponentialRampToValueAtTime(0.0001, r + 0.8);
        o.stop(r + 1.3); src.stop(r + 0.9);
      }
    };
  }

  // Lumos: a small bright ping kindling; Maxima: a bigger swelling chord;
  // Nox: the same tone falling and fading.
  function lumosToggle(on, big) {
    var t = now();
    pluck(on ? (big ? 91 : 86) : 74, t, big ? 0.5 : 0.3);
    if (big && on) pluck(98, t + 0.08, 0.3);
    var o = ctx.createOscillator();
    o.type = 'sine';
    if (on) {
      o.frequency.setValueAtTime(700, t);
      o.frequency.exponentialRampToValueAtTime(big ? 2000 : 1500, t + (big ? 0.22 : 0.15));
    } else {
      o.frequency.setValueAtTime(500, t);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.35);
    }
    var g = ctx.createGain();
    g.gain.setValueAtTime(big ? 0.08 : 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.55 : 0.4));
    o.connect(g); out(g, 0.7, 0.4);
    o.start(t); o.stop(t + (big ? 0.6 : 0.42));
  }

  // Wingardium Leviosa: a rising swell as the object lifts off the ground.
  function leviosaRise() {
    var t = now();
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(440, t + 0.6);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.0);
    o.connect(g); out(g, 0.6, 0.55);
    o.start(t); o.stop(t + 1.05);
    pluck(79, t + 0.1, 0.3);
  }

  // The soft settling thud as the object touches down again.
  function leviosaSettle() {
    var t = now();
    pluck(64, t, 0.35);
    var n = noiseSource(false);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(lp); lp.connect(g); out(g, 0.7, 0.4);
    n.start(t); n.stop(t + 0.32);
  }

  // Bright chord when the animal takes shape.
  function formationChime() {
    var t = now();
    pluck(76, t, 0.5); pluck(83, t + 0.07, 0.4); pluck(79, t + 0.14, 0.35);
    pluck(88, t + 0.22, 0.3);
  }

  /* ---------- animal sounds ---------- */

  function thump(t, freq, gain, lpf) {
    var o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.09);
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(g); out(g, 0.7, 0.45);
    o.start(t); o.stop(t + 0.13);
    var n = noiseSource(false);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = lpf;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.8, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(lp); lp.connect(ng); out(ng, 0.7, 0.45);
    n.start(t); n.stop(t + 0.09);
  }

  function whoosh(t, dur, gain, freq) {
    var n = noiseSource(false);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(freq * 0.6, t);
    bp.frequency.linearRampToValueAtTime(freq, t + dur * 0.4);
    bp.frequency.linearRampToValueAtTime(freq * 0.5, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.001, t + dur);
    n.connect(bp); bp.connect(g); out(g, 0.55, 0.55);
    n.start(t); n.stop(t + dur + 0.02);
  }

  function chitterBlip(t) {
    var o = ctx.createOscillator();
    var f = 850 + Math.random() * 700;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.05);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g); out(g, 0.55, 0.5);
    o.start(t); o.stop(t + 0.09);
  }

  // Looping sound of the running/flying animal. Returns {stop()}.
  function animalLoop(animal) {
    var stopped = false, id;
    function loop() {
      if (stopped) return;
      var t = now() + 0.05;
      if (animal.sound === 'hooves') {
        var heavy = animal.id === 'horse';
        thump(t, heavy ? 82 : 95, heavy ? 0.11 : 0.085, 200);
        thump(t + 0.12, 90, 0.07, 180);
        thump(t + 0.25, heavy ? 78 : 92, heavy ? 0.1 : 0.08, 190);
        id = setTimeout(loop, 520 + Math.random() * 40);
      } else if (animal.sound === 'paws') {
        thump(t, 70, 0.05, 130);
        thump(t + 0.11, 66, 0.04, 120);
        thump(t + 0.23, 72, 0.05, 130);
        id = setTimeout(loop, 480 + Math.random() * 40);
      } else if (animal.sound === 'wings') {
        var slow = !!animal.majestic;
        whoosh(t, slow ? 0.5 : 0.24, slow ? 0.09 : 0.07, slow ? 420 : 640);
        if (slow && Math.random() < 0.5) {
          pluck(88 + (Math.random() * 5 | 0), t + 0.1, 0.12); // phoenix shimmer
        }
        id = setTimeout(loop, slow ? 640 : 300);
      } else { // chitter
        var k = 1 + (Math.random() * 3 | 0);
        for (var i = 0; i < k; i++) chitterBlip(t + i * 0.09);
        thump(t + 0.3, 75, 0.03, 140);
        id = setTimeout(loop, 380 + Math.random() * 300);
      }
      timers.push(id);
    }
    loop();
    return { stop: function () { stopped = true; clearTimeout(id); } };
  }

  /* ---------- dementor weather ---------- */

  var rumbleGain = null;
  function setDementor(on) {
    if (!ctx) return;
    if (on && !rumbleGain) {
      var src = noiseSource();
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 55;
      rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0;
      src.connect(lp); lp.connect(rumbleGain);
      out(rumbleGain, 0.9, 0.3);
      src.start();
    }
    var t = now();
    if (rumbleGain) {
      rumbleGain.gain.cancelScheduledValues(t);
      rumbleGain.gain.linearRampToValueAtTime(on ? 0.14 : 0, t + 2.5);
    }
    if (musicGain) {
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.linearRampToValueAtTime(on ? 0.02 : 0.05, t + 2.5);
    }
    if (windGain) {
      windGain.gain.cancelScheduledValues(t);
      windGain.gain.linearRampToValueAtTime(on ? 0.09 : 0.05, t + 2.5);
    }
  }

  /* ---------- one-off recorded clips (not synthesized) ---------- */

  var leviosaMeme = null;
  function playLeviosaMeme() {
    if (!leviosaMeme) leviosaMeme = new Audio('sounds/its_leviosa.mp3');
    leviosaMeme.currentTime = 0;
    leviosaMeme.volume = 0.9;
    leviosaMeme.play().catch(function () {});
  }

  /* ---------- public ---------- */

  window.AudioSys = {
    init: function () {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      dryBus = ctx.createGain(); dryBus.connect(master);
      convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(2.8, 2.6);
      var wetLevel = ctx.createGain(); wetLevel.gain.value = 0.9;
      convolver.connect(wetLevel); wetLevel.connect(master);
      wetBus = convolver;
      noiseBuf = makeNoise();
      startWind();
      startCrickets();
      startMusic();
      scheduleHowl();
    },
    ready: function () { return !!ctx; },
    setMuted: function (m) {
      muted = m;
      if (!ctx) return;
      var t = now();
      master.gain.cancelScheduledValues(t);
      master.gain.linearRampToValueAtTime(m ? 0 : 0.9, t + 0.4);
    },
    intake: function () { if (ctx && !muted) intake(); },
    sparkBurst: function () { if (ctx && !muted) sparkBurst(); },
    buildup: function (d) {
      if (!ctx || muted) return { release: function () {} };
      return buildup(d);
    },
    formationChime: function () { if (ctx && !muted) formationChime(); },
    lumosToggle: function (on, big) { if (ctx && !muted) lumosToggle(on, big); },
    leviosaRise: function () { if (ctx && !muted) leviosaRise(); },
    leviosaSettle: function () { if (ctx && !muted) leviosaSettle(); },
    playLeviosaMeme: function () { if (!muted) playLeviosaMeme(); },
    animalLoop: function (a) {
      if (!ctx || muted) return { stop: function () {} };
      return animalLoop(a);
    },
    setDementor: setDementor
  };
})();
