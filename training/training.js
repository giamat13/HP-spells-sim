/* Voice training page. Say (or upload, or type) something; it shows what it
   made of it and, from the trained data, how much of it each spell owns. If
   that's wrong, pick the spell you meant and teach it — both the words the
   recognizer heard and a voiceprint of the sound go into that spell's data.
   Save it in this browser, or download it for the source code.

   Two routes run at once (see recog.js): the words from speech recognition,
   and the sound itself. Voice.decide combines them, so verdicts here match
   the game. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var CUSTOM = '__custom__';

  // The editable, browser-local set, split the same way the data file is.
  var work = Voice.merge(Voice.readLocal());
  var workPrints = Voice.mergePrints(Voice.readLocalPrints());
  // Starting point: the shared data. Fetched from GitHub so it works as soon
  // as the file is pushed; the copy loaded from ../js/ is the fallback.
  var base = Voice.merge(Voice.sourceData());
  var basePrints = Voice.mergePrints(Voice.sourcePrints());

  var dirty = false;
  var views = [];                             // one refresh() per result card
  var cards = [];                             // newest first, for late transcripts
  var tries = 0, understood = 0;              // guessed right before any teaching
  var audioUrl = null, audioBlob = null;
  var fileChosen = false;                     // the user supplied their own starting file

  /* ---------- helpers ---------- */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function status(text, kind) {
    var s = $('status');
    s.textContent = text || '';
    s.className = kind || '';
  }

  function setDirty(v) {
    dirty = v;
    $('dirty').classList.toggle('hidden', !v);
  }

  function combined() { return Voice.merge(base, work); }
  function combinedPrints() { return Voice.mergePrints(basePrints, workPrints); }

  function nameOf(id) {
    var s = Voice.spellById(id);
    return s ? s.name : id;
  }

  function slug(text) { return Voice.normalize(text).replace(/ /g, '-'); }

  function dataChanged() {
    setDirty(true);
    renderData();
    views.forEach(function (v) { v(); });
  }

  // How close a voiceprint is to each spell's recordings: { spellId: 0..1 }.
  function soundSims(print) {
    if (!print || !window.Voiceprint) return null;
    return Voiceprint.matchAll(print, combinedPrints());
  }

  /* ---------- how much each spell owns ---------- */

  function renderDist(box, text, sims, limit) {
    box.textContent = '';
    var data = combined();
    var rows = Voice.distribution(text, data, sims);
    if (limit) rows = rows.slice(0, limit);
    var pickedId = Voice.decide(text, sims, data).id;
    rows.forEach(function (r, i) {
      var line = el('div', 'score rowc' + (i === 0 ? ' top' : '') + (r.id === null ? ' none' : ''));
      var bar = el('span', 'bar'), fill = el('i');
      fill.style.width = r.share + '%';
      bar.appendChild(fill);
      line.appendChild(el('span', null, r.name + (r.id && r.id === pickedId ? ' ✓' : '')));
      line.appendChild(bar);
      line.appendChild(el('span', 'pct', r.share + '%'));
      var note = r.id === null ? ''
        : (r.count + ' phrase' + (r.count === 1 ? '' : 's')) +
          (r.audio == null ? '' : ' · sound ' + r.audio + '%');
      line.appendChild(el('span', 'cover', note));
      box.appendChild(line);
    });
  }

  // The spell dropdown on a result card: every known spell, or type a new one.
  function makeSpellPicker(preselectId, onChange) {
    var wrap = el('span', 'picker');
    var sel = el('select');
    var none = el('option', null, '— which spell? —'); none.value = '';
    sel.appendChild(none);
    Voice.SPELLS.forEach(function (s) {
      var o = el('option', null, s.name); o.value = s.id;
      sel.appendChild(o);
    });
    var other = el('option', null, 'Other (type it)…'); other.value = CUSTOM;
    sel.appendChild(other);
    var text = el('input'); text.type = 'text'; text.placeholder = 'spell name';
    text.className = 'hidden'; text.style.width = '10rem';
    sel.value = preselectId || '';
    sel.addEventListener('change', function () {
      text.classList.toggle('hidden', sel.value !== CUSTOM);
      onChange();
    });
    text.addEventListener('input', onChange);
    wrap.appendChild(sel); wrap.appendChild(text);
    return {
      el: wrap,
      get: function () {
        if (sel.value === CUSTOM) {
          var t = text.value.trim();
          return t ? { id: slug(t), name: t } : null;
        }
        var s = sel.value && Voice.spellById(sel.value);
        return s ? { id: s.id, name: s.name } : null;
      }
    };
  }

  /* ---------- live readout while speaking ---------- */

  function showLive(text) {
    text = String(text || '').trim();
    $('live').classList.toggle('hidden', !text);
    if (!text) return;
    var res = Voice.decide(text, null, combined());
    $('live-heard').textContent = 'Hearing “' + text + '” → ' +
      (res.id ? nameOf(res.id) + ' (' + res.via + ')' : 'no spell');
    renderDist($('live-dist'), text, null);
  }

  /* ---------- result cards ---------- */

  function renderTally() {
    $('tally').textContent = tries
      ? understood + ' of ' + tries + ' understood before teaching (' + Math.round(understood / tries * 100) + '%)'
      : '';
  }

  function addResult(u) {
    var alts = u.alts && u.alts.length ? u.alts : [];
    if (!alts.length && !u.print) return;
    $('live').classList.add('hidden');
    $('results-section').classList.remove('hidden');

    var card = {
      print: u.print,
      seconds: u.seconds,
      alts: alts,
      at: Date.now(),
      counted: false,
      first: null            // the verdict before anything was taught
    };

    var box = el('div', 'utt');
    var head = el('div', 'utt-head');
    box.appendChild(head);
    var verdictLine = el('p', 'big');
    box.appendChild(verdictLine);
    var dist = el('div', 'scores');
    box.appendChild(dist);
    var altBox = el('div');
    box.appendChild(altBox);

    var fix = el('div', 'fixrow');
    fix.appendChild(el('span', null, 'It was actually:'));
    var picker = makeSpellPicker(null, function () { refresh(); });
    fix.appendChild(picker.el);
    var go = el('button', 'primary');
    fix.appendChild(go);
    box.appendChild(fix);
    var note = el('p', 'note');
    box.appendChild(note);
    $('results').insertBefore(box, $('results').firstChild);

    function topText() { return card.alts.length ? card.alts[0].text : ''; }

    function understoodAs(text, spell) {
      return !!spell && Voice.decide(text, soundSims(card.print), combined()).id === spell.id;
    }

    function refresh() {
      var sims = soundSims(card.print);
      var res = Voice.decide(topText(), sims, combined());
      if (!card.first) card.first = res;

      head.textContent = new Date(card.at).toLocaleTimeString() + ' · ' +
        (card.print ? 'sound recorded' + (card.seconds ? ' (' + card.seconds.toFixed(1) + ' s)' : '') : 'words only') +
        (card.alts.length ? '' : ' · no words yet');

      verdictLine.textContent = '';
      if (res.id) {
        verdictLine.appendChild(document.createTextNode('The game would cast '));
        verdictLine.appendChild(el('b', null, nameOf(res.id)));
        verdictLine.appendChild(document.createTextNode(' (' + res.via + ')'));
      } else {
        verdictLine.textContent = 'The game would cast nothing.';
      }

      renderDist(dist, topText(), sims, 5);

      altBox.textContent = '';
      var spell = picker.get();
      card.alts.forEach(function (a, i) {
        var row = el('div', 'alt');
        row.appendChild(el('span', 'conf', i === 0 ? 'heard' : 'also'));
        row.appendChild(el('span', null, '“' + a.text + '”'));
        var badge = el('span', 'badge');
        if (spell) {
          var id = Voice.decide(a.text, sims, combined()).id;
          badge.textContent = id === spell.id ? '✓' : (id ? '→ ' + nameOf(id) : '✗');
          badge.className = 'badge ' + (id === spell.id ? 'ok' : (id ? 'warn' : 'bad'));
        }
        row.appendChild(badge);
        altBox.appendChild(row);
      });

      go.textContent = !spell ? 'Pick the spell'
        : (understoodAs(topText(), spell) ? '✓ Correct' : '➕ Teach “' + spell.name + '”');
      go.disabled = !spell;
    }

    card.addText = function (newAlts) {
      card.alts = newAlts;
      card.first = null;      // the words only just arrived: judge from both
      refresh();
    };
    views.push(refresh);
    cards.unshift(card);
    if (cards.length > 30) cards.pop();
    refresh();

    go.addEventListener('click', function () {
      var spell = picker.get();
      if (!spell) return;
      if (!card.counted) {
        card.counted = true;
        tries++;
        if (card.first && card.first.id === spell.id) understood++;
        renderTally();
      }
      var added = [], text = topText();
      if (text && Voice.explain(text, combined()).id !== spell.id) {
        var next = {}; next[spell.id] = [text];
        work = Voice.merge(work, next);
        added.push('the words “' + text + '”');
      }
      if (card.print) {
        var p = {}; p[spell.id] = [card.print];
        workPrints = Voice.mergePrints(workPrints, p);
        added.push('a recording of how it sounds');
      }
      if (!added.length) {
        note.textContent = 'Already understood as ' + spell.name + ', and there is nothing new to add.';
        return;
      }
      dataChanged();
      note.textContent = 'Taught ' + spell.name + ': ' + added.join(' and ') +
        '. Save or download when you’re done.';
    });
  }

  // A final transcript that arrived after the sound already opened a card.
  function attachText(alts) {
    if (cards.length && Date.now() - cards[0].at < 3000) cards[0].addText(alts);
    else addResult({ alts: alts, print: null });
  }

  /* ---------- input: microphone, recording, typing ---------- */

  var recog = Recog.create({
    onLive: showLive,
    onUtterance: addResult,
    onLateText: attachText,
    onStatus: status,
    onSound: function (on) {
      var r = $('route');
      r.textContent = on
        ? '● Both routes running: the words and the sound.'
        : '● Words only — the sound route needs microphone access.';
      r.className = 'note ' + (on ? 'ok' : 'warn');
    },
    onState: function (listening) {
      $('mic-btn').textContent = listening ? '⏹ Stop' : '🎤 Listen';
      $('mic-btn').classList.toggle('live', listening);
      $('mic-btn').dataset.live = listening ? '1' : '';
      $('route').classList.toggle('hidden', !listening);
      if (listening) status('Listening… say a spell.', '');
      else showLive('');
    }
  });

  $('mic-btn').addEventListener('click', function () {
    if ($('mic-btn').dataset.live) { recog.stop(); status('', ''); return; }
    recog.startMic();
  });

  $('audio-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioBlob = f;
    audioUrl = URL.createObjectURL(f);
    var a = $('audio-preview');
    a.src = audioUrl;
    a.classList.remove('hidden');
    $('analyze-btn').disabled = false;
    status('Loaded “' + f.name + '”. Press Recognize.', '');
  });

  $('analyze-btn').addEventListener('click', function () {
    recog.startFile($('audio-preview'), audioBlob);
  });

  $('type-input').addEventListener('input', function () { showLive(this.value); });
  $('type-input').addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || !this.value.trim()) return;
    addResult({ alts: [{ text: this.value.trim(), conf: 1 }], print: null });
    showLive('');
    this.value = '';
  });

  /* ---------- training data ---------- */

  function renderData() {
    var box = $('data');
    box.textContent = '';
    var allPhrases = combined(), allPrints = combinedPrints();
    var ids = Object.keys(allPhrases).concat(Object.keys(allPrints)).filter(function (id, i, a) {
      return a.indexOf(id) === i;
    }).sort();
    if (!ids.length) {
      box.appendChild(el('p', 'note', 'Nothing yet. Say a spell above and teach it what it heard.'));
      return;
    }
    ids.forEach(function (id) {
      var wrap = el('div', 'spell-data');
      wrap.appendChild(el('b', null, nameOf(id)));
      var prints = (allPrints[id] || []).length;
      if (prints) {
        var mine = (workPrints[id] || []).length;
        var tag = el('span', 'recs', '🎧 ' + prints + ' recording' + (prints === 1 ? '' : 's'));
        tag.title = mine + ' of them added in this browser';
        if (mine) {
          var drop = el('span', 'x', '×');
          drop.title = 'Remove the recordings you added here';
          drop.addEventListener('click', function () {
            delete workPrints[id];
            dataChanged();
          });
          tag.appendChild(drop);
        }
        wrap.appendChild(tag);
      }
      var chips = el('div', 'chips');
      var inSource = base[id] || [];
      inSource.forEach(function (p) {
        var c = el('span', 'chip src', p);
        c.title = 'From the starting file (shared with everyone)';
        chips.appendChild(c);
      });
      (work[id] || []).forEach(function (p) {
        if (inSource.indexOf(p) !== -1) return;
        var c = el('span', 'chip', p);
        var x = el('span', 'x', '×');
        x.title = 'Remove';
        x.addEventListener('click', function () {
          work[id] = work[id].filter(function (q) { return q !== p; });
          work = Voice.merge(work);
          dataChanged();
        });
        c.appendChild(x);
        chips.appendChild(c);
      });
      wrap.appendChild(chips);
      box.appendChild(wrap);
    });
  }

  /* ---------- output ---------- */

  $('save-btn').addEventListener('click', function () {
    try {
      Voice.writeLocal(combined(), combinedPrints());
      setDirty(false);
      status('Saved in this browser. The game here now uses this training.', 'ok');
    } catch (e) {
      status('Could not save: ' + e.message + '. Recordings take room — try removing a few.', 'bad');
    }
  });

  $('download-btn').addEventListener('click', function () {
    var blob = new Blob([Voice.toSourceFile(combined(), combinedPrints())], { type: 'text/javascript' });
    var a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'voice-training-data.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    status('Downloaded. To share it, replace js/voice-training-data.js in the project with this file and commit.', 'ok');
  });

  $('import-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    var input = this;
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var text = String(reader.result);
        var parsed = Voice.parseData(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
        base = Voice.merge(parsed.phrases);
        basePrints = Voice.mergePrints(parsed.prints);
        fileChosen = true;
        setBaseInfo('your file “' + f.name + '”');
        dataChanged();
        status('Loaded “' + f.name + '” as the starting point. Save or download to keep it.', 'ok');
      } catch (e) {
        status('That file doesn’t look like a voice-training-data.js file.', 'bad');
      }
      input.value = '';
    };
    reader.readAsText(f);
  });

  $('clear-btn').addEventListener('click', function () {
    if (!confirm('Delete all voice training saved in this browser? (The starting file is untouched.)')) return;
    work = {};
    workPrints = {};
    try { Voice.writeLocal({}, {}); } catch (e) {}
    renderData();
    views.forEach(function (v) { v(); });
    setDirty(false);
    status('Browser data cleared.', 'ok');
  });

  window.addEventListener('beforeunload', function (ev) {
    if (dirty) { ev.preventDefault(); ev.returnValue = ''; }
  });

  /* ---------- starting point: GitHub raw ---------- */

  var DEFAULT_REPO = 'giamat13/HP-spells-sim', BRANCH = 'main';

  // Forks: hosted on <user>.github.io/<repo>/ uses that repo; ?repo=user/name
  // (and ?branch=) override it.
  function rawUrl() {
    var q = new URLSearchParams(location.search), repo = q.get('repo');
    if (!repo && /\.github\.io$/.test(location.hostname)) {
      var name = location.pathname.split('/')[1];
      if (name) repo = location.hostname.split('.')[0] + '/' + name;
    }
    return 'https://raw.githubusercontent.com/' + (repo || DEFAULT_REPO) + '/' +
      (q.get('branch') || BRANCH) + '/js/voice-training-data.js';
  }

  function setBaseInfo(text) {
    $('base-info').textContent = 'Starting from ' + text + '.';
  }

  function loadBase() {
    setBaseInfo('the local js/voice-training-data.js (fetching the latest from GitHub…)');
    fetch(rawUrl(), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (text) {
        var parsed = Voice.parseData(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
        if (fileChosen) return;   // the user already uploaded their own starting file
        base = Voice.merge(parsed.phrases);
        basePrints = Voice.mergePrints(parsed.prints);
        setBaseInfo('the latest js/voice-training-data.js from GitHub');
        renderData();
        views.forEach(function (v) { v(); });
      })
      .catch(function () {
        if (!fileChosen) setBaseInfo('the local js/voice-training-data.js (couldn’t reach GitHub, or it isn’t pushed yet)');
      });
  }

  if (!recog.supported) status('This browser can’t listen (use Chrome or Edge). You can still type phrases and edit or import data.', 'warn');
  renderData();
  loadBase();
})();
