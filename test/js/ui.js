/* UI: animal selection cards, incantation input, voice input, journal,
   capture, weather + mute toggles, pointer sparkles, captions.
   Global: UI */
(function () {
  'use strict';

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('hp_' + k); return v == null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('hp_' + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  var selected = null;
  var hooks = {};
  var casting = false;
  var els = {};

  function buildCards() {
    var wrap = els.cards;
    var fav = store.get('fav', null);
    ANIMALS.list.forEach(function (a) {
      var card = document.createElement('button');
      card.className = 'animal-card';
      card.dataset.id = a.id;
      card.setAttribute('aria-label', 'Choose ' + a.name);
      var icon = ANIMALS.makeIcon(a, 128, 96, 'rgba(178,216,255,0.95)');
      icon.classList.add('icon');
      card.appendChild(icon);
      var name = document.createElement('span');
      name.className = 'animal-name';
      name.textContent = a.name;
      card.appendChild(name);
      var star = document.createElement('span');
      star.className = 'fav' + (fav === a.id ? ' on' : '');
      star.textContent = '★';
      star.title = 'Favourite';
      card.appendChild(star);
      star.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var newFav = store.get('fav', null) === a.id ? null : a.id;
        store.set('fav', newFav);
        wrap.querySelectorAll('.fav').forEach(function (s) { s.classList.remove('on'); });
        if (newFav) star.classList.add('on');
      });
      card.addEventListener('click', function () {
        select(a.id);
        closeAnimalModal();
      });
      wrap.appendChild(card);
    });
  }

  function select(id) {
    selected = ANIMALS.byId(id);
    els.cards.querySelectorAll('.animal-card').forEach(function (c) {
      c.classList.toggle('selected', c.dataset.id === id);
    });
    els.hint.textContent = 'Your Patronus: the ' + selected.name +
      '. Speak the words, or press Cast.';
    els.animalBtn.innerHTML = '';
    els.animalBtn.appendChild(ANIMALS.makeIcon(selected, 40, 30, 'rgba(178,216,255,0.95)'));
    var label = document.createElement('span');
    label.className = 'animal-btn-label';
    label.textContent = selected.name;
    els.animalBtn.appendChild(label);
  }

  function openAnimalModal() { els.animalModal.hidden = false; }
  function closeAnimalModal() { els.animalModal.hidden = true; }

  function castPatronus() {
    if (casting || !selected) return;
    if (hooks.onCast) hooks.onCast('patronus', selected);
  }

  function castLumosOn() {
    if (hooks.onCast) hooks.onCast('lumos', { on: true, maxima: false });
  }
  function castLumosMaxima() {
    if (hooks.onCast) hooks.onCast('lumos', { on: true, maxima: true });
  }
  function castLumosOff() {
    if (hooks.onCast) hooks.onCast('lumos', { on: false });
  }
  function toggleLumos() {
    if (hooks.onCast) hooks.onCast('lumos', { on: 'toggle' });
  }

  // 5% of the time, "It's LeviOsa, not LevioSAH" plays alongside the real
  // cast (never instead of it) — a little surprise layered on top, not a
  // fizzle.
  var LEVIOSA_MEME_CHANCE = 0.05;

  function castLeviosa() {
    if (Math.random() < LEVIOSA_MEME_CHANCE) AudioSys.playLeviosaMeme();
    if (hooks.onCast) hooks.onCast('leviosa', null);
  }

  function castIncendio() {
    if (hooks.onCast) hooks.onCast('incendio', null);
  }

  function castAccio() {
    if (hooks.onCast) hooks.onCast('accio', null);
  }

  function castDepulso() {
    if (hooks.onCast) hooks.onCast('depulso', null);
  }

  function castBombarda() {
    if (hooks.onCast) hooks.onCast('bombarda', { maxima: false });
  }
  function castBombardaMaxima() {
    if (hooks.onCast) hooks.onCast('bombarda', { maxima: true });
  }

  function castAvada() {
    if (hooks.onCast) hooks.onCast('avada', null);
  }

  // Confringo is presented as its own spell, but under the hood it's just
  // Bombarda's blast fired with the "confringo" caption and no Maxima variant.
  function castConfringo() {
    if (hooks.onCast) hooks.onCast('confringo', null);
  }

  // "Expecto Patronum" is long and Latin, so both ASR and unsure speakers
  // mangle the first word constantly (aspecto, aspeto, ekspecto...); accept
  // any of those plus a bare "patro-" fragment for the second word.
  var EXPECTO_RE = /\b(expecto|ex?specto|aspecto|aspeto|aspeko|aspeku|ekspecto|especto)\b/i;
  var PATRONUM_RE = /\bpatro/i;
  function isPatronusPhrase(text) {
    return EXPECTO_RE.test(text) && PATRONUM_RE.test(text);
  }

  // "Nox" and "knocks"/"Knox" are near-homophones, so speech recognition
  // routinely mishears one for the other — accept the common variants.
  var NOX_RE = /\b(nox|knox|knocks|noks)\b/i;
  var LUMOS_MAXIMA_RE = /^\s*lumos\s*maxima\b/i;
  var LUMOS_RE = /^\s*lumos\b/i;

  // "Wingardium Leviosa" is long and invented, so ASR mangles it constantly.
  // "Leviosa" alone is distinctive enough to accept on its own (with common
  // misspellings/mishears); "Wingardium"-ish + any "levi" fragment also counts.
  var LEVIOSA_WORD_RE = /\b(leviosa|leviosah|leviosaa|leviosar|libiosa)\b/i;
  var WINGARDIUM_RE = /\b([wv]ingardium|[wv]ingardian|[wv]ing\s*guardian|when\s*guardian|[wv]ing\s*gardenia)\b/i;
  // Drawn-out "leviosaaaa" (extra trailing a's) doesn't satisfy the word
  // boundary above, but it's still a cast of the spell — just said funny.
  var LEVIOSA_DRAWN_OUT_RE = /levios+a{3,}/i;
  function isLeviosaPhrase(text) {
    return LEVIOSA_WORD_RE.test(text) || LEVIOSA_DRAWN_OUT_RE.test(text) ||
      (WINGARDIUM_RE.test(text) && /levi/i.test(text));
  }

  // "Incendio" is short and phonetic, but ASR (and non-native pronunciation)
  // still softens or swaps the middle consonant a lot — match the sound
  // pattern (in + c/s/z + en + d/t + i/e + o) instead of a fixed spelling.
  var INCENDIO_RE = /\bin\s*[csz]en?[dt]e?[iy]?o'?s?\b/i;
  // "Accio" is short too, and gets heard/pronounced as "akio"/"atzio"/"axio"/
  // "atio" etc. — match the a + k/t/ts/x + i/y + o sound shape broadly.
  var ACCIO_RE = /\ba[ck]{1,2}[iy]o\b|\bat[sz]?[iy]o\b|\bax[iy]o\b|\bas[iy]o\b/i;
  // "Depulso" gets heard/pronounced as "depulso"/"depulzo"/"depolso"/"dupulso"
  // etc. — match the d(e/i) + p + u/o + l + s/z + o sound shape broadly.
  var DEPULSO_RE = /\bd[ei]?\s*p[uo]ls[oe]\b/i;
  // "Confringo" is another long-ish Latin-sounding word ASR mangles — match the
  // con + f/v + r + i/e + n + g/k + o sound shape broadly.
  var CONFRINGO_RE = /\bcon?[fv]r[ie]n[gk]o\b/i;

  // Fallback fuzzy matcher for whenever the regex sound-shapes above still
  // miss a mis-hearing entirely (English ASR forcing the word toward some
  // unrelated dictionary word). Same idea as the Expecto Patronum handling —
  // accept more than one exact spelling — just done generically: compare
  // each spoken word against a short list of known-close spellings and
  // allow a small edit-distance tolerance instead of hand-writing every
  // variant as its own regex branch.
  function levenshtein(a, b) {
    var m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    var row = new Array(n + 1);
    for (var j = 0; j <= n; j++) row[j] = j;
    for (var i = 1; i <= m; i++) {
      var prev = row[0];
      row[0] = i;
      for (j = 1; j <= n; j++) {
        var tmp = row[j];
        row[j] = Math.min(
          row[j] + 1,
          row[j - 1] + 1,
          prev + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        prev = tmp;
      }
    }
    return row[n];
  }
  function wordCloseTo(word, target) {
    var maxDist = target.length <= 4 ? 1 : (target.length <= 6 ? 2 : 3);
    return levenshtein(word, target) <= maxDist;
  }
  function phraseHasFuzzyWord(text, targets) {
    var words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) {
      if (words[i].length < 3) continue;
      for (var j = 0; j < targets.length; j++) {
        if (wordCloseTo(words[i], targets[j])) return true;
      }
    }
    return false;
  }

  var INCENDIO_TARGETS = ['incendio', 'incendo', 'encendio', 'insendio', 'inzendio', 'incendia'];
  var ACCIO_TARGETS = ['accio', 'akio', 'atio', 'atzio', 'axio', 'asio', 'atsio', 'ackio'];
  var DEPULSO_TARGETS = ['depulso', 'depulzo', 'depolso', 'dupulso', 'depulsa', 'depuso'];
  var BOMBARDA_TARGETS = ['bombarda', 'bombardo', 'bambarda', 'bombardia', 'bombaria'];
  var CONFRINGO_TARGETS = ['confringo', 'confringgo', 'confrengo', 'confrigo', 'confrinko'];

  function isIncendioPhrase(text) {
    return INCENDIO_RE.test(text) || phraseHasFuzzyWord(text, INCENDIO_TARGETS);
  }
  function isAccioPhrase(text) {
    return ACCIO_RE.test(text) || phraseHasFuzzyWord(text, ACCIO_TARGETS);
  }
  function isDepulsoPhrase(text) {
    return DEPULSO_RE.test(text) || phraseHasFuzzyWord(text, DEPULSO_TARGETS);
  }

  // "Bombarda Maxima" must be checked before plain "Bombarda", the same way
  // Lumos Maxima is checked before plain Lumos.
  var BOMBARDA_MAXIMA_RE = /^\s*bombarda\s*maxima\b/i;
  var BOMBARDA_RE = /\bbombarda\b/i;
  function isBombardaPhrase(text) {
    return BOMBARDA_RE.test(text) || phraseHasFuzzyWord(text, BOMBARDA_TARGETS);
  }
  function isConfringoPhrase(text) {
    return CONFRINGO_RE.test(text) || phraseHasFuzzyWord(text, CONFRINGO_TARGETS);
  }

  // "Avada Kedavra" — English ASR almost never returns both words cleanly;
  // it collapses the phrase into things like "abracadabra", "a cadaver",
  // "had a cadaver", "of other cadaver". So instead of requiring both words,
  // we trigger on the distinctive second-word sound ALONE — "kedavra" /
  // "cadaver" / "cadabra" isn't close to any other spell here — plus the
  // whole-phrase mishears ("abracadabra"). The "avada"/"cadaver" combo also
  // still works when ASR does get both.
  var KEDAVRA_RE = /\b(k[ae]d[ae]?vr?[ae]|cadav(er|re|ra)|cadabra|kadabra)\b/i;
  var ABRACADABRA_RE = /\babra\s*cadabra\b/i;
  var KEDAVRA_TARGETS = ['kedavra', 'kedavera', 'kadavra', 'kadabra', 'cadabra',
    'kedabra', 'kadavera', 'cadaver', 'cadavre', 'cadavera'];
  function isAvadaPhrase(text) {
    return KEDAVRA_RE.test(text) || ABRACADABRA_RE.test(text) ||
      phraseHasFuzzyWord(text, KEDAVRA_TARGETS);
  }

  function tryIncantation(text) {
    if (isPatronusPhrase(text)) { castPatronus(); return true; }
    if (isLeviosaPhrase(text)) { castLeviosa(); return true; }
    if (NOX_RE.test(text)) { castLumosOff(); return true; }
    if (LUMOS_MAXIMA_RE.test(text)) { castLumosMaxima(); return true; }
    if (LUMOS_RE.test(text)) { castLumosOn(); return true; }
    if (isIncendioPhrase(text)) { castIncendio(); return true; }
    if (isAccioPhrase(text)) { castAccio(); return true; }
    if (isDepulsoPhrase(text)) { castDepulso(); return true; }
    if (BOMBARDA_MAXIMA_RE.test(text)) { castBombardaMaxima(); return true; }
    if (isConfringoPhrase(text)) { castConfringo(); return true; }
    if (isBombardaPhrase(text)) { castBombarda(); return true; }
    if (isAvadaPhrase(text)) { castAvada(); return true; }
    return false;
  }

  /* ---------- voice: always-on, self-restarting incantation listener ---------- */

  var mic = { supported: false, active: false, wantOn: false };

  function micStartRecognition() {
    if (!mic.supported || mic.active) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = function (ev) {
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        if (!ev.results[i].isFinal) continue;
        var heard = ev.results[i][0].transcript;
        if (isPatronusPhrase(heard)) { castPatronus(); continue; }
        if (isLeviosaPhrase(heard)) { castLeviosa(); continue; }
        if (NOX_RE.test(heard)) { castLumosOff(); continue; }
        if (LUMOS_MAXIMA_RE.test(heard)) { castLumosMaxima(); continue; }
        if (LUMOS_RE.test(heard)) { castLumosOn(); continue; }
        if (isIncendioPhrase(heard)) { castIncendio(); continue; }
        if (isAccioPhrase(heard)) { castAccio(); continue; }
        if (isDepulsoPhrase(heard)) { castDepulso(); continue; }
        if (BOMBARDA_MAXIMA_RE.test(heard)) { castBombardaMaxima(); continue; }
        if (isConfringoPhrase(heard)) { castConfringo(); continue; }
        if (isBombardaPhrase(heard)) { castBombarda(); continue; }
        if (isAvadaPhrase(heard)) { castAvada(); continue; }
      }
    };
    rec.onend = function () {
      mic.active = false;
      els.mic.classList.remove('listening');
      if (mic.wantOn) setTimeout(micStartRecognition, 400);
    };
    rec.onerror = function (ev) {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        mic.wantOn = false;
        els.mic.title = 'Microphone access denied';
      }
      // other errors (no-speech, aborted, network) just fall through to onend and retry
    };
    try {
      rec.start();
      mic.active = true;
      els.mic.classList.add('listening');
    } catch (e) {}
  }

  function setupVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    mic.supported = true;
    els.mic.hidden = false;
    els.mic.title = 'Always listening for “Expecto Patronum”, “Lumos”, “Lumos Maxima”, “Nox”, “Wingardium Leviosa”, “Incendio”, “Accio”, “Depulso”, “Bombarda”, “Bombarda Maxima”, “Confringo”, or “Avada Kedavra”';
    els.mic.addEventListener('click', function () {
      mic.wantOn = true;
      micStartRecognition();
    });
  }

  function startVoice() {
    if (!mic.supported) return;
    mic.wantOn = true;
    micStartRecognition();
  }

  /* ---------- pointer sparkles ---------- */

  var sparks = [];
  var sctx = null;

  function setupSparkles() {
    var canvas = els.sparkles;
    sctx = canvas.getContext('2d');
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    var last = 0;
    window.addEventListener('pointermove', function (ev) {
      var t = performance.now();
      if (t - last < 24) return;
      last = t;
      for (var i = 0; i < 2; i++) {
        sparks.push({
          x: ev.clientX + (Math.random() - 0.5) * 8,
          y: ev.clientY + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30 - 12,
          life: 1, size: 1 + Math.random() * 2
        });
      }
      if (sparks.length > 140) sparks.splice(0, sparks.length - 140);
    });
  }

  function updateSparkles(dt) {
    if (!sctx) return;
    var c = els.sparkles;
    sctx.clearRect(0, 0, c.width, c.height);
    if (!sparks.length) return;
    sctx.globalCompositeOperation = 'lighter';
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.life -= dt * 1.6;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vy += 10 * dt;
      var a = s.life * s.life;
      sctx.fillStyle = 'rgba(190,225,255,' + (a * 0.9).toFixed(3) + ')';
      sctx.beginPath();
      sctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
      sctx.fill();
    }
    sctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- journal ---------- */

  function openJournal() {
    var casts = store.get('casts', 0);
    var last = store.get('last', null);
    var fav = store.get('fav', null);
    var counts = store.get('counts', {});
    var best = null, bestN = 0;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestN) { bestN = counts[k]; best = k; }
    });
    els.journalStats.innerHTML =
      'Patronus charms cast: <span class="stat-value">' + casts + '</span><br>' +
      'Last Patronus: <span class="stat-value">' + (last ? ANIMALS.byId(last).name : 'none yet') + '</span><br>' +
      'Favourite: <span class="stat-value">' + (fav ? ANIMALS.byId(fav).name : 'not chosen') + '</span><br>' +
      'Most summoned: <span class="stat-value">' + (best ? ANIMALS.byId(best).name + ' (' + bestN + ')' : 'none yet') + '</span>';
    els.journal.hidden = false;
  }

  /* ---------- public ---------- */

  window.UI = {
    init: function (h) {
      hooks = h;
      els.cards = document.getElementById('animal-cards');
      els.hint = document.getElementById('hint');
      els.input = document.getElementById('incantation');
      els.mic = document.getElementById('mic-btn');
      els.sparkles = document.getElementById('sparkles');
      els.journal = document.getElementById('journal');
      els.journalStats = document.getElementById('journal-stats');
      els.caption = document.getElementById('caption');
      els.animalBtn = document.getElementById('animal-btn');
      els.animalModal = document.getElementById('animal-modal');

      buildCards();
      var fav = store.get('fav', null);
      var last = store.get('last', null);
      select(fav || last || 'stag');

      document.getElementById('open-book').addEventListener('click', function () {
        var landing = document.getElementById('landing');
        landing.classList.add('closing');
        setTimeout(function () { landing.remove(); }, 1700);
        if (hooks.onStart) hooks.onStart();
      });

      document.getElementById('cast-btn').addEventListener('click', castPatronus);
      els.input.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        if (!tryIncantation(els.input.value)) {
          els.input.classList.remove('nope');
          void els.input.offsetWidth;             // restart animation
          els.input.classList.add('nope');
          els.hint.textContent = 'The words must be exact: “Expecto Patronum”, “Lumos”, “Nox”, “Wingardium Leviosa”, “Incendio”, “Accio”, “Depulso”, “Bombarda”, “Confringo”, or “Avada Kedavra”.';
        } else {
          els.input.value = '';
        }
      });

      els.animalBtn.addEventListener('click', openAnimalModal);
      document.getElementById('animal-modal-close').addEventListener('click', closeAnimalModal);
      els.animalModal.addEventListener('click', function (ev) {
        if (ev.target === els.animalModal) closeAnimalModal();
      });
      var spellPatronus = document.getElementById('spell-patronus');
      if (spellPatronus) {
        spellPatronus.addEventListener('click', openAnimalModal);
        spellPatronus.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openAnimalModal(); }
        });
      }
      var spellLumos = document.getElementById('spell-lumos');
      if (spellLumos) {
        spellLumos.addEventListener('click', toggleLumos);
        spellLumos.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleLumos(); }
        });
      }
      var spellLeviosa = document.getElementById('spell-leviosa');
      if (spellLeviosa) {
        spellLeviosa.addEventListener('click', castLeviosa);
        spellLeviosa.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castLeviosa(); }
        });
      }
      var spellIncendio = document.getElementById('spell-incendio');
      if (spellIncendio) {
        spellIncendio.addEventListener('click', castIncendio);
        spellIncendio.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castIncendio(); }
        });
      }
      var spellAccio = document.getElementById('spell-accio');
      if (spellAccio) {
        spellAccio.addEventListener('click', castAccio);
        spellAccio.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castAccio(); }
        });
      }
      var spellDepulso = document.getElementById('spell-depulso');
      if (spellDepulso) {
        spellDepulso.addEventListener('click', castDepulso);
        spellDepulso.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castDepulso(); }
        });
      }
      var spellBombarda = document.getElementById('spell-bombarda');
      if (spellBombarda) {
        spellBombarda.addEventListener('click', castBombarda);
        spellBombarda.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castBombarda(); }
        });
      }
      var spellConfringo = document.getElementById('spell-confringo');
      if (spellConfringo) {
        spellConfringo.addEventListener('click', castConfringo);
        spellConfringo.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castConfringo(); }
        });
      }
      var spellAvada = document.getElementById('spell-avada');
      if (spellAvada) {
        spellAvada.addEventListener('click', castAvada);
        spellAvada.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castAvada(); }
        });
      }

      document.getElementById('journal-btn').addEventListener('click', openJournal);
      document.getElementById('journal-close').addEventListener('click', function () {
        els.journal.hidden = true;
      });
      els.journal.addEventListener('click', function (ev) {
        if (ev.target === els.journal) els.journal.hidden = true;
      });

      document.getElementById('capture-btn').addEventListener('click', function () {
        if (hooks.onCapture) hooks.onCapture();
      });

      // Screen brightness compensation: the scene is deliberately dark and
      // moody, which reads poorly on dim phone/tablet screens or in bright
      // rooms. A fine-grained 1-100 slider (50 = normal) drives a CSS filter
      // over the WebGL canvas, so people on weak-brightness screens can
      // boost it a lot without touching the actual in-scene lighting/mood.
      var sceneCanvas = document.getElementById('scene');
      var brightnessBtn = document.getElementById('brightness-btn');
      var brightnessPopover = document.getElementById('brightness-popover');
      var brightnessSlider = document.getElementById('brightness-slider');
      var brightnessValue = document.getElementById('brightness-value');

      function brightnessFilter(v) {
        // 1..50 -> 0.5x..1x (dim), 50..100 -> 1x..3.2x (strong boost)
        var b = v <= 50 ? (0.5 + (v / 50) * 0.5) : (1 + ((v - 50) / 50) * 2.2);
        var c = 1 + Math.max(0, b - 1) * 0.06;
        var s = 1 + Math.max(0, b - 1) * 0.04;
        return 'brightness(' + b.toFixed(2) + ') contrast(' + c.toFixed(2) + ') saturate(' + s.toFixed(2) + ')';
      }
      function applyBrightness(v) {
        sceneCanvas.style.filter = v === 50 ? 'none' : brightnessFilter(v);
        brightnessValue.textContent = v;
        brightnessBtn.classList.toggle('active', v !== 50);
      }
      var brightVal = Math.max(1, Math.min(100, store.get('brightness', 50)));
      brightnessSlider.value = brightVal;
      applyBrightness(brightVal);

      brightnessBtn.addEventListener('click', function () {
        brightnessPopover.hidden = !brightnessPopover.hidden;
      });
      brightnessSlider.addEventListener('input', function () {
        var v = parseInt(brightnessSlider.value, 10);
        applyBrightness(v);
        store.set('brightness', v);
      });
      document.addEventListener('click', function (ev) {
        if (brightnessPopover.hidden) return;
        if (ev.target === brightnessBtn || brightnessPopover.contains(ev.target)) return;
        brightnessPopover.hidden = true;
      });

      var viewBtn = document.getElementById('view-btn');
      viewBtn.addEventListener('click', function () {
        if (hooks.onViewToggle) hooks.onViewToggle();
      });
      window.UI.setViewMode = function (mode) {
        var third = mode === 'third';
        viewBtn.textContent = third ? '🧙' : '🚶';
        viewBtn.classList.toggle('active', third);
        viewBtn.title = third ? 'First-person view (C)' : 'Third-person view (C)';
      };

      var zombieAttackOn = !!store.get('zombieAttack', true);
      var zombieBtn = document.getElementById('zombie-btn');
      function paintZombieBtn() {
        zombieBtn.classList.toggle('active', zombieAttackOn);
        zombieBtn.title = zombieAttackOn
          ? 'Zombies attack you (click to make them peaceful)'
          : 'Zombies are peaceful (click to let them attack)';
      }
      paintZombieBtn();
      zombieBtn.addEventListener('click', function () {
        zombieAttackOn = !zombieAttackOn;
        store.set('zombieAttack', zombieAttackOn);
        paintZombieBtn();
        if (hooks.onZombieToggle) hooks.onZombieToggle(zombieAttackOn);
      });
      window.UI.zombiesAttackEnabled = function () { return zombieAttackOn; };

      els.healthFill = document.getElementById('health-fill');
      els.healthText = document.getElementById('health-text');

      var weatherOn = false;
      var weatherBtn = document.getElementById('weather-btn');
      weatherBtn.addEventListener('click', function () {
        weatherOn = !weatherOn;
        weatherBtn.classList.toggle('active', weatherOn);
        weatherBtn.title = weatherOn ? 'Clear the skies' : 'Dementor weather';
        if (hooks.onWeather) hooks.onWeather(weatherOn);
      });

      var mutedNow = !!store.get('mute', false);
      var muteBtn = document.getElementById('mute-btn');
      function paintMute() {
        muteBtn.textContent = mutedNow ? '♪̸' : '♪';
        muteBtn.classList.toggle('active', mutedNow);
        muteBtn.title = mutedNow ? 'Unmute' : 'Mute';
      }
      paintMute();
      muteBtn.addEventListener('click', function () {
        mutedNow = !mutedNow;
        store.set('mute', mutedNow);
        paintMute();
        if (hooks.onMute) hooks.onMute(mutedNow);
      });
      window.UI.isMuted = function () { return mutedNow; };

      var menu = document.getElementById('spell-menu');
      document.getElementById('menu-toggle').addEventListener('click', function () {
        menu.classList.toggle('open');
      });

      // flash overlay for capture
      var flash = document.createElement('div');
      flash.id = 'flash';
      document.body.appendChild(flash);
      els.flash = flash;

      setupVoice();
      setupSparkles();
    },

    selectedAnimal: function () { return selected; },

    setCasting: function (on) {
      casting = on;
      document.body.classList.toggle('casting', on);
      document.getElementById('cast-btn').disabled = on;
      els.input.disabled = on;
      if (!on) {
        els.hint.textContent = 'Choose your Patronus, then speak the words.';
      }
    },

    recordCast: function (animalId) {
      store.set('casts', store.get('casts', 0) + 1);
      store.set('last', animalId);
      var counts = store.get('counts', {});
      counts[animalId] = (counts[animalId] || 0) + 1;
      store.set('counts', counts);
    },

    caption: function (text) {
      if (!text) { els.caption.classList.remove('show'); return; }
      els.caption.hidden = false;
      els.caption.textContent = text;
      els.caption.classList.add('show');
    },

    flash: function () {
      els.flash.classList.add('on');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          els.flash.classList.remove('on');
        });
      });
    },

    update: updateSparkles,
    startVoice: startVoice,

    setPlayerHealth: function (hp, max) {
      var pct = Math.max(0, Math.min(100, (hp / max) * 100));
      els.healthFill.style.width = pct + '%';
      els.healthText.textContent = Math.ceil(hp) + '/' + max;
    }
  };
})();