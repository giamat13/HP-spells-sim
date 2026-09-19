/* Recog: listens on two routes at once and hands the page complete
   utterances.

     1. Speech recognition (Web Speech API) turns what you said into English
        words. It is often wrong on invented Latin, and it only commits to a
        final answer about a second after you stop talking.
     2. Voiceprint (js/voiceprint.js) records the sound itself and decides on
        its own when you stopped, about 0.4 s after you do.

   Route 2 is what fires an utterance, so the page can react straight away
   with whatever words route 1 has so far; when the recognizer catches up, its
   final words arrive as onLateText and the page refines what it showed. With
   no microphone access, route 1 alone still drives everything, exactly as
   before.

   Recog.create({ onLive, onUtterance, onLateText, onStatus, onState })
   returns { supported, hasSound, startMic, startFile, stop }.
   Global: Recog */
(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var LATE_MS = 3000;   // how long a final transcript may still join an utterance

  function create(opts) {
    var rec = null, mic = null, wantMic = false;
    var pending = null;            // most recent interim alternatives
    var lastUtterance = 0;
    var say = opts.onStatus || function () {};

    function emitUtterance(u) {
      lastUtterance = Date.now();
      pending = null;
      if (opts.onUtterance) opts.onUtterance(u);
    }

    /* ---------- route 1: speech recognition ---------- */

    function openSR(track, continuous) {
      stopSR();
      var mine = rec = new SR();
      mine.lang = 'en-US';
      mine.maxAlternatives = 5;
      mine.interimResults = true;
      mine.continuous = continuous;
      mine.onresult = function (ev) {
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var alts = [];
          for (var j = 0; j < ev.results[i].length; j++) {
            alts.push({ text: ev.results[i][j].transcript.trim(), conf: ev.results[i][j].confidence });
          }
          if (!alts.length || !alts[0].text) continue;
          if (!ev.results[i].isFinal) {
            pending = alts;
            if (opts.onLive) opts.onLive(alts[0].text);
            continue;
          }
          // Final words: join the utterance the sound already opened, or, when
          // the sound route isn't running (or missed it), stand on their own.
          if (mic && Date.now() - lastUtterance < LATE_MS) {
            pending = null;
            if (opts.onLateText) opts.onLateText(alts);
          } else {
            emitUtterance({ alts: alts, print: null, source: 'words' });
          }
        }
      };
      mine.onerror = function (ev) {
        if (ev.error === 'no-speech') say('Didn’t hear anything. Try again a little closer.', 'warn');
        else if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') say('Microphone access was denied.', 'bad');
        else if (ev.error !== 'aborted') say('Recognition error: ' + ev.error, 'bad');
      };
      mine.onend = function () {
        if (rec !== mine) return;
        rec = null;
        if (!mic) state(false);
      };
      try {
        if (track) mine.start(track); else mine.start();
      } catch (e) {
        rec = null;
        return false;
      }
      return true;
    }

    function stopSR() {
      if (rec) { try { rec.stop(); } catch (e) {} }
    }

    /* ---------- route 2: the sound itself ---------- */

    function openMic() {
      if (!window.Voiceprint) return Promise.reject(new Error('no-voiceprint'));
      return Voiceprint.open({
        onEnd: function (print, samples, rate) {
          if (!print) return;                     // too short to judge
          emitUtterance({ alts: pending || [], print: print, source: 'sound', seconds: samples.length / rate });
        },
        onLevel: opts.onLevel
      });
    }

    function state(on) {
      if (opts.onState) opts.onState(on);
    }

    /* ---------- control ---------- */

    function startMicListening() {
      if (!SR && !window.Voiceprint) { say('This browser has no speech recognition. Use Chrome or Edge.', 'bad'); return false; }
      wantMic = true;
      var started = SR ? openSR(null, true) : false;
      state(true);
      openMic().then(function (m) {
        if (!wantMic) { m.close(); return; }
        mic = m;
        if (opts.onSound) opts.onSound(true);
      }).catch(function () {
        if (opts.onSound) opts.onSound(false);
        if (!started) { state(false); say('No microphone available.', 'bad'); }
        else say('Listening with speech recognition only — the sound route needs microphone access.', 'warn');
      });
      return started || true;
    }

    function stop() {
      wantMic = false;
      stopSR();
      if (mic) { mic.close(); mic = null; }
      state(false);
    }

    // A recording: the sound route reads it directly and instantly, so its
    // utterances are scheduled to land in step with playback, which is what
    // the recognizer needs to hear them.
    function startFile(audio, blob) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var segments = null;

      if (Ctx && blob && window.Voiceprint) {
        blob.arrayBuffer().then(function (buf) {
          var ctx = new Ctx();
          return ctx.decodeAudioData(buf).then(function (decoded) {
            segments = Voiceprint.fromAudioBuffer(decoded);
            ctx.close();
            if (!playing) flushSegments();      // recognizer never started
          });
        }).catch(function () { segments = []; });
      }

      var playing = false, emitted = false;
      function flushSegments() {
        if (emitted || !segments) return;
        emitted = true;
        segments.forEach(function (s) {
          emitUtterance({ alts: [], print: s.print, source: 'sound' });
        });
      }

      if (!SR) {
        say('No speech recognition here, so only the sound of the recording is used.', 'warn');
        setTimeout(flushSegments, 600);
        return;
      }

      audio.pause();
      audio.currentTime = 0;
      var stream = null, started = false;
      try {
        stream = audio.captureStream ? audio.captureStream() : (audio.mozCaptureStream ? audio.mozCaptureStream() : null);
      } catch (e) {}

      function go(track) {
        if (started) return;
        started = true;
        audio.pause();
        audio.currentTime = 0;
        if (openSR(track, true)) {
          say(track ? 'Recognizing the recording…' : 'Playing the recording aloud for your microphone to pick up. Keep it near the speakers.', track ? '' : 'warn');
        } else {
          say('Could not start speech recognition.', 'bad');
        }
        state(true);
        audio.onended = function () { setTimeout(function () { stopSR(); state(false); }, 1500); };
        setTimeout(function () {
          playing = true;
          audio.play();
          // Each segment's print is handed over as that part of the recording
          // finishes playing, so the words the recognizer returns line up.
          emitted = true;
          (segments || []).forEach(function (s) {
            setTimeout(function () {
              emitUtterance({ alts: pending || [], print: s.print, source: 'sound' });
            }, Math.max(0, s.end * 1000));
          });
        }, 400);
      }

      var track = stream && stream.getAudioTracks()[0];
      if (track) { go(track); return; }
      if (stream) {
        stream.addEventListener('addtrack', function (ev) { go(ev.track); });
        audio.play().catch(function () {});
        setTimeout(function () { go(null); }, 1500);
      } else {
        go(null);
      }
    }

    return {
      supported: !!SR || !!window.Voiceprint,
      hasWords: !!SR,
      startMic: startMicListening,
      startFile: startFile,
      stop: stop
    };
  }

  window.Recog = { create: create, supported: !!SR };
})();
