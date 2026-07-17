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
    if (casting) return;
    if (hooks.onCast) hooks.onCast('lumos', true);
  }
  function castLumosOff() {
    if (casting) return;
    if (hooks.onCast) hooks.onCast('lumos', false);
  }
  function toggleLumos() {
    if (casting) return;
    if (hooks.onCast) hooks.onCast('lumos', 'toggle');
  }

  function tryIncantation(text) {
    if (/expecto\s*patronum/i.test(text)) { castPatronus(); return true; }
    if (/^\s*nox\b/i.test(text)) { castLumosOff(); return true; }
    if (/^\s*lumos\b/i.test(text)) { castLumosOn(); return true; }
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
        if (/expecto/i.test(heard) && /patro/i.test(heard)) castPatronus();
        else if (/\bnox\b/i.test(heard)) castLumosOff();
        else if (/lumos/i.test(heard)) castLumosOn();
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
    els.mic.title = 'Always listening for “Expecto Patronum”, “Lumos”, or “Nox”';
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
          els.hint.textContent = 'The words must be exact: “Expecto Patronum”, “Lumos”, or “Nox”.';
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
    startVoice: startVoice
  };
})();
