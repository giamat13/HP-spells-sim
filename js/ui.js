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

  function castExpelliarmus() {
    if (hooks.onCast) hooks.onCast('expelliarmus', null);
  }

  function castStupefy() {
    if (hooks.onCast) hooks.onCast('stupefy', null);
  }

  function castPetrificus() {
    if (hooks.onCast) hooks.onCast('petrificus', null);
  }

  function castEpiskey() {
    if (hooks.onCast) hooks.onCast('episkey', null);
  }

  // Confringo is presented as its own spell, but under the hood it's just
  // Bombarda's blast fired with the "confringo" caption and no Maxima variant.
  function castConfringo() {
    if (hooks.onCast) hooks.onCast('confringo', null);
  }

  // Maps an identified spell id (see voice.js) to its cast.
  function castById(id) {
    switch (id) {
      case 'patronus': castPatronus(); break;
      case 'leviosa': castLeviosa(); break;
      case 'nox': castLumosOff(); break;
      case 'lumos-maxima': castLumosMaxima(); break;
      case 'lumos': castLumosOn(); break;
      case 'incendio': castIncendio(); break;
      case 'accio': castAccio(); break;
      case 'depulso': castDepulso(); break;
      case 'bombarda-maxima': castBombardaMaxima(); break;
      case 'confringo': castConfringo(); break;
      case 'bombarda': castBombarda(); break;
      case 'avada': castAvada(); break;
      case 'expelliarmus': castExpelliarmus(); break;
      case 'petrificus': castPetrificus(); break;
      case 'stupefy': castStupefy(); break;
      case 'episkey': castEpiskey(); break;
    }
  }

  // Word matching lives in voice.js (shared with the voice training page).
  function tryIncantation(text) {
    var id = Voice.identify(text);
    if (!id) return false;
    castById(id);
    return true;
  }

  /* ---------- voice: always-on, self-restarting incantation listener ---------- */

  // Two routes listen at once. Speech recognition gives the words, but only
  // commits about a second after you stop talking, and mangles invented Latin.
  // voiceprint.js listens to the sound itself, matches it against what was
  // trained (training/index.html) and knows on its own when you stopped, so it
  // casts far sooner. Whichever concludes first casts; the other is dropped for
  // that utterance. With no trained recordings, or no microphone access, the
  // words alone still drive everything exactly as before.
  var mic = {
    supported: false, active: false, wantOn: false,
    sound: null,          // handle on the voiceprint microphone, when open
    interim: '',          // latest partial transcript
    interimAt: 0,         // when it arrived, to tell it apart from the last utterance
    spokeAt: 0,           // when the current utterance began
    suppress: 0           // final transcripts the sound route has already answered
  };
  var SOUND_WINDOW = 3000;

  function printLibrary() {
    return Voice.mergePrints(Voice.sourcePrints(), Voice.readLocalPrints());
  }

  // One conclusion from both routes, then cast it.
  function castDecision(text, sims) {
    var res = Voice.decide(text, sims);
    devShow(text, sims, res);
    if (res.id) castById(res.id);
    return res;
  }

  function micStartSound() {
    if (!window.Voiceprint || mic.sound) return;
    Voiceprint.open({
      onStart: function () { mic.spokeAt = Date.now(); },
      onEnd: function (print) {
        if (!mic.wantOn || !print) return;
        // Only trust a partial transcript that arrived during this utterance:
        // recognition lags, so an older one belongs to the previous spell.
        var text = mic.interimAt >= mic.spokeAt ? mic.interim : '';
        mic.interim = '';
        var res = castDecision(text, Voiceprint.matchAll(print, printLibrary()));
        if (!res.id) return;
        // The recognizer will still deliver words for this one: ignore them.
        mic.suppress++;
        setTimeout(function () { if (mic.suppress > 0) mic.suppress--; }, SOUND_WINDOW);
      }
    }).then(function (h) {
      if (!mic.wantOn) { h.close(); return; }
      mic.sound = h;
    }).catch(function () { mic.sound = null; });   // words only, as before
  }

  function micStopSound() {
    if (mic.sound) { mic.sound.close(); mic.sound = null; }
    mic.suppress = 0;
  }

  function micStartRecognition() {
    if (!mic.supported || mic.active) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;      // the sound route casts with whatever words exist by then
    rec.onresult = function (ev) {
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var heard = ev.results[i][0].transcript;
        if (!ev.results[i].isFinal) {
          mic.interim = heard;
          mic.interimAt = Date.now();
          continue;
        }
        mic.interim = '';
        if (mic.suppress > 0) { mic.suppress--; continue; }
        castDecision(heard, null);
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
        micStopSound();
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
    els.mic.title = 'Always listening (words + trained sound) for “Expecto Patronum”, “Lumos”, “Lumos Maxima”, “Nox”, “Wingardium Leviosa”, “Incendio”, “Accio”, “Depulso”, “Bombarda”, “Bombarda Maxima”, “Confringo”, “Avada Kedavra”, “Expelliarmus”, “Stupefy”, “Petrificus Totalus”, or “Episkey”';
    els.mic.addEventListener('click', function () {
      mic.wantOn = true;
      micStartRecognition();
      micStartSound();
    });
  }

  function startVoice() {
    if (!mic.supported) return;
    mic.wantOn = true;
    micStartRecognition();
    micStartSound();
  }

  /* ---------- DEV mode: how close was what you said to each spell ---------- */

  var dev = { on: false };

  function devRow(name, pct, cls) {
    var row = document.createElement('div');
    row.className = 'dev-row' + (cls ? ' ' + cls : '');
    var n = document.createElement('span');
    n.textContent = name;
    var bar = document.createElement('span');
    bar.className = 'dev-bar';
    var fill = document.createElement('i');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    var p = document.createElement('span');
    p.className = 'dev-pct';
    p.textContent = pct + '%';
    row.appendChild(n); row.appendChild(bar); row.appendChild(p);
    return row;
  }

  function devShow(heard, sims, res) {
    if (!dev.on) return;
    res = res || Voice.decide(heard, sims);
    var panel = els.dev;
    panel.textContent = '';
    var h = document.createElement('div');
    h.className = 'dev-heard';
    h.textContent = 'Heard: \u201c' + String(heard || '').trim() + '\u201d' +
      (sims ? '' : ' (words only)');
    var m = document.createElement('div');
    m.className = 'dev-match';
    m.textContent = res.id
      ? '\u2192 ' + Voice.spellById(res.id).name + ' (' + res.via + ')'
      : '\u2192 no spell cast';
    panel.appendChild(h);
    panel.appendChild(m);
    // Share of the utterance each spell owns, from the trained data.
    Voice.distribution(heard, null, sims).forEach(function (s, i) {
      panel.appendChild(devRow(s.name, s.share, (i === 0 ? 'top ' : '') + (s.id && s.id === res.id ? 'picked' : '')));
    });
  }

  function setDev(on) {
    dev.on = on;
    els.dev.hidden = !on;
    els.devBtn.textContent = '\uD83D\uDEE0 Dev mode: ' + (on ? 'on' : 'off');
    if (on) {
      els.dev.textContent = 'DEV: say a spell (mic must be on) to see how much of it each spell owns, per the trained data.';
    }
    try { localStorage.setItem('hp-dev', on ? '1' : '0'); } catch (e) {}
  }

  function setupDev() {
    var on = /[?&]dev\b/.test(location.search);
    try { if (localStorage.getItem('hp-dev') === '1') on = true; } catch (e) {}
    setDev(on);
    els.devBtn.addEventListener('click', function () { setDev(!dev.on); });
    // ` (backtick) toggles it too, since the sidebar can't be clicked while walking.
    window.addEventListener('keydown', function (ev) {
      if (ev.code !== 'Backquote') return;
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      setDev(!dev.on);
    });
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
      els.dev = document.getElementById('dev-panel');
      els.devBtn = document.getElementById('dev-btn');
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
          els.hint.textContent = 'The words must be exact: “Expecto Patronum”, “Lumos”, “Nox”, “Wingardium Leviosa”, “Incendio”, “Accio”, “Depulso”, “Bombarda”, “Confringo”, “Avada Kedavra”, “Expelliarmus”, “Stupefy”, “Petrificus Totalus”, or “Episkey”.';
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
      var spellExpelliarmus = document.getElementById('spell-expelliarmus');
      if (spellExpelliarmus) {
        spellExpelliarmus.addEventListener('click', castExpelliarmus);
        spellExpelliarmus.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castExpelliarmus(); }
        });
      }
      var spellStupefy = document.getElementById('spell-stupefy');
      if (spellStupefy) {
        spellStupefy.addEventListener('click', castStupefy);
        spellStupefy.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castStupefy(); }
        });
      }
      var spellPetrificus = document.getElementById('spell-petrificus');
      if (spellPetrificus) {
        spellPetrificus.addEventListener('click', castPetrificus);
        spellPetrificus.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castPetrificus(); }
        });
      }

      var spellEpiskey = document.getElementById('spell-episkey');
      if (spellEpiskey) {
        spellEpiskey.addEventListener('click', castEpiskey);
        spellEpiskey.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); castEpiskey(); }
        });
      }

      setupDev();

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