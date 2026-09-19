/* Voice: turns what speech recognition heard (or what was typed) into a
   spell id. Shared by the game (ui.js) and the voice training page
   (training/index.html), so both judge a phrase exactly the same way.

   Matching has three layers, in order:
     1. trained phrases that equal the whole utterance,
     2. the built-in sound-shape regexes / fuzzy matching below,
     3. trained phrases that appear inside a longer utterance.
   Trained phrases come from js/voice-training-data.js (shipped with the
   source, for everyone) merged with the visitor's own localStorage data.
   Global: Voice */
(function () {
  'use strict';

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

  // "Expelliarmus" is long and Latin like Expecto Patronum, so ASR mangles
  // it heavily and often splits it into separate words ("expel", "arm us").
  // Match the sound shape broadly (allowing spaces between the syllables and
  // either vowel on either end) plus a fuzzy word-list fallback for whenever
  // ASR mashes it into one unrecognizable blob.
  var EXPELLIARMUS_RE = /\bex\s*p[ae]l+i?\s*a?r?m\s*[ueoa]s?\b/i;
  var EXPELLIARMUS_TARGETS = ['expelliarmus', 'expeliarmus', 'expeliarmous',
    'expelliarmous', 'expelarmus', 'expeliarmas', 'expelearmus', 'expeliarmos',
    'expiliarmus', 'expelyarmus', 'expelliarmas', 'expelliarmos', 'xpelliarmus'];
  function isExpelliarmusPhrase(text) {
    return EXPELLIARMUS_RE.test(text) || phraseHasFuzzyWord(text, EXPELLIARMUS_TARGETS);
  }

  // "Stupefy" is short and phonetic but still gets heard as "stupefai"/
  // "stupify"/"stewpify" etc. — match the sound shape broadly plus a fuzzy
  // fallback, same approach as Incendio/Accio above.
  var STUPEFY_RE = /\bstu?p[ie]fy?\b/i;
  var STUPEFY_TARGETS = ['stupefy', 'stupefai', 'stupify', 'stewpify', 'stoopify', 'stupefye', 'stupifai'];
  function isStupefyPhrase(text) {
    return STUPEFY_RE.test(text) || phraseHasFuzzyWord(text, STUPEFY_TARGETS);
  }

  // "Petrificus Totalus" is two long Latin-ish words, so like Expecto
  // Patronum both get mangled — require a sound-shape/fuzzy match on each
  // word independently rather than the exact phrase.
  var PETRIFICUS_RE = /\bpetr?if[iy]c[au]s\b/i;
  var TOTALUS_RE = /\btot[ae]l[ou]s\b/i;
  var PETRIFICUS_TARGETS = ['petrificus', 'petrifikus', 'petrifycus', 'petrifikas', 'petrifecus'];
  var TOTALUS_TARGETS = ['totalus', 'toetalus', 'totalos', 'totales', 'totallus'];
  function isPetrificusPhrase(text) {
    return (PETRIFICUS_RE.test(text) || phraseHasFuzzyWord(text, PETRIFICUS_TARGETS)) &&
      (TOTALUS_RE.test(text) || phraseHasFuzzyWord(text, TOTALUS_TARGETS));
  }

  // "Episkey" is short but ASR turns it into "episky"/"epi ski"/"a piskey";
  // match the sound shape plus a fuzzy fallback.
  var EPISKEY_RE = /\b[ea]?\s*p[ie]s?\s*sk(ey|ie|y|ee|i)\b/i;
  var EPISKEY_TARGETS = ['episkey', 'episky', 'episkie', 'episkei', 'episkee', 'apiskey', 'ipiskey'];
  function isEpiskeyPhrase(text) {
    return EPISKEY_RE.test(text) || phraseHasFuzzyWord(text, EPISKEY_TARGETS);
  }

  /* ---------- built-in matching ---------- */

  // Order matters: "Lumos Maxima" before "Lumos", "Bombarda Maxima" and
  // "Confringo" before plain "Bombarda", and so on.
  function builtinIdentify(text) {
    if (isPatronusPhrase(text)) return 'patronus';
    if (isLeviosaPhrase(text)) return 'leviosa';
    if (NOX_RE.test(text)) return 'nox';
    if (LUMOS_MAXIMA_RE.test(text)) return 'lumos-maxima';
    if (LUMOS_RE.test(text)) return 'lumos';
    if (isIncendioPhrase(text)) return 'incendio';
    if (isAccioPhrase(text)) return 'accio';
    if (isDepulsoPhrase(text)) return 'depulso';
    if (BOMBARDA_MAXIMA_RE.test(text)) return 'bombarda-maxima';
    if (isConfringoPhrase(text)) return 'confringo';
    if (isBombardaPhrase(text)) return 'bombarda';
    if (isAvadaPhrase(text)) return 'avada';
    if (isExpelliarmusPhrase(text)) return 'expelliarmus';
    if (isPetrificusPhrase(text)) return 'petrificus';
    if (isStupefyPhrase(text)) return 'stupefy';
    if (isEpiskeyPhrase(text)) return 'episkey';
    return null;
  }

  var SPELLS = [
    { id: 'patronus', name: 'Expecto Patronum', say: 'Expecto Patronum' },
    { id: 'lumos', name: 'Lumos', say: 'Lumos' },
    { id: 'lumos-maxima', name: 'Lumos Maxima', say: 'Lumos Maxima' },
    { id: 'nox', name: 'Nox', say: 'Nox' },
    { id: 'leviosa', name: 'Wingardium Leviosa', say: 'Wingardium Leviosa' },
    { id: 'incendio', name: 'Incendio', say: 'Incendio' },
    { id: 'accio', name: 'Accio', say: 'Accio' },
    { id: 'depulso', name: 'Depulso', say: 'Depulso' },
    { id: 'bombarda', name: 'Bombarda', say: 'Bombarda' },
    { id: 'bombarda-maxima', name: 'Bombarda Maxima', say: 'Bombarda Maxima' },
    { id: 'confringo', name: 'Confringo', say: 'Confringo' },
    { id: 'avada', name: 'Avada Kedavra', say: 'Avada Kedavra' },
    { id: 'expelliarmus', name: 'Expelliarmus', say: 'Expelliarmus' },
    { id: 'stupefy', name: 'Stupefy', say: 'Stupefy' },
    { id: 'petrificus', name: 'Petrificus Totalus', say: 'Petrificus Totalus' },
    { id: 'episkey', name: 'Episkey', say: 'Episkey' }
  ];

  function spellById(id) {
    for (var i = 0; i < SPELLS.length; i++) if (SPELLS[i].id === id) return SPELLS[i];
    return null;
  }

  /* ---------- trained phrases ---------- */

  var STORE_KEY = 'hp-voice-training';

  function normalize(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // The training file (and localStorage) hold either the original plain
  // {spellId: [phrase]} map, or {phrases, prints} where prints are the
  // voiceprints from voiceprint.js. Both shapes are accepted; the two parts
  // come back separately so callers can ignore the half they don't use.
  function parseData(obj) {
    if (!obj || typeof obj !== 'object') return { phrases: {}, prints: {} };
    if (obj.phrases || obj.prints) {
      return {
        phrases: obj.phrases && typeof obj.phrases === 'object' ? obj.phrases : {},
        prints: obj.prints && typeof obj.prints === 'object' ? obj.prints : {}
      };
    }
    return { phrases: obj, prints: {} };
  }

  // Phrases shipped with the source (js/voice-training-data.js).
  function sourceData() {
    return parseData(window.VOICE_TRAINING).phrases;
  }

  function sourcePrints() {
    return parseData(window.VOICE_TRAINING).prints;
  }

  var cachedRaw = null, cachedLocal = { phrases: {}, prints: {} };
  // The visitor's own training from localStorage; re-parsed only when the
  // stored text changes, so calling this per utterance is cheap.
  function readLocalAll() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedLocal = parseData(raw ? JSON.parse(raw) : {});
      }
    } catch (e) { cachedLocal = { phrases: {}, prints: {} }; }
    return cachedLocal;
  }

  function readLocal() { return readLocalAll().phrases; }
  function readLocalPrints() { return readLocalAll().prints; }

  // Stores phrases and (optionally) voiceprints for this browser.
  function writeLocal(phrases, prints) {
    var body = parseData(phrases);
    if (prints) body.prints = prints;
    localStorage.setItem(STORE_KEY, JSON.stringify({ phrases: body.phrases, prints: body.prints }));
    cachedRaw = null; // force a re-read
  }

  // Union of several {spellId: [phrase, ...]} maps, phrases normalised,
  // de-duplicated and sorted so files diff cleanly.
  function merge() {
    var out = {};
    for (var a = 0; a < arguments.length; a++) {
      var src = arguments[a] || {};
      Object.keys(src).forEach(function (id) {
        if (!Array.isArray(src[id])) return;
        var seen = out[id] || (out[id] = []);
        src[id].forEach(function (p) {
          var n = normalize(p);
          if (n && seen.indexOf(n) === -1) seen.push(n);
        });
      });
    }
    Object.keys(out).forEach(function (id) {
      if (!out[id].length) delete out[id]; else out[id].sort();
    });
    return out;
  }

  // Union of several {spellId: [print, ...]} maps. Prints are opaque strings;
  // a spell keeps its most recent MAX_PRINTS so the file can't grow forever.
  var MAX_PRINTS = 8;
  function mergePrints() {
    var out = {};
    for (var a = 0; a < arguments.length; a++) {
      var src = arguments[a] || {};
      Object.keys(src).forEach(function (id) {
        if (!Array.isArray(src[id])) return;
        var seen = out[id] || (out[id] = []);
        src[id].forEach(function (p) {
          if (typeof p === 'string' && p && seen.indexOf(p) === -1) seen.push(p);
        });
      });
    }
    Object.keys(out).forEach(function (id) {
      if (!out[id].length) delete out[id];
      else if (out[id].length > MAX_PRINTS) out[id] = out[id].slice(-MAX_PRINTS);
    });
    return out;
  }

  function sortedKeys(obj) {
    var out = {};
    Object.keys(obj).sort().forEach(function (id) { out[id] = obj[id]; });
    return out;
  }

  // Contents for js/voice-training-data.js.
  function toSourceFile(phrases, prints) {
    var body = { phrases: sortedKeys(parseData(phrases).phrases), prints: sortedKeys(prints || {}) };
    return '/* Trained voice data. "phrases" is what speech recognition actually\n' +
      '   hears when people say each spell; "prints" are voiceprints of the sound\n' +
      '   itself (see js/voiceprint.js), used when the words come out wrong.\n' +
      '   Generated by training/index.html; replace this file with a downloaded\n' +
      '   one. Loaded before voice.js. */\n' +
      'window.VOICE_TRAINING = ' + JSON.stringify(body, null, 2) + ';\n';
  }

  function trainedExact(text, all) {
    var n = normalize(text);
    if (!n) return null;
    for (var id in all) {
      if (all[id].indexOf(n) !== -1) return id;
    }
    return null;
  }

  function trainedPartial(text, all) {
    var n = ' ' + normalize(text) + ' ', best = null, bestLen = 0;
    if (n === '  ') return null;
    Object.keys(all).forEach(function (id) {
      all[id].forEach(function (p) {
        if (p.length > bestLen && n.indexOf(' ' + p + ' ') !== -1) { best = id; bestLen = p.length; }
      });
    });
    return best;
  }

  // Returns { id, via } where via says which layer matched, or id === null.
  // `data` (optional) replaces the trained phrases, so the training page can
  // judge its unsaved edits.
  function explain(text, data) {
    var all = data || merge(sourceData(), readLocal());
    var id = trainedExact(text, all);
    if (id) return { id: id, via: 'trained' };
    id = builtinIdentify(text);
    if (id) return { id: id, via: 'built-in' };
    id = trainedPartial(text, all);
    if (id) return { id: id, via: 'trained (partial)' };
    return { id: null, via: null };
  }

  function identify(text) { return explain(text).id; }

  /* ---------- combining the words with the sound ---------- */

  // Above AUDIO_SURE the sound alone may name a spell the words missed; below
  // AUDIO_MIN it is ignored. These are first guesses and want real tuning.
  var AUDIO_SURE = 0.62, AUDIO_STRONG = 0.78, AUDIO_MIN = 0.45, AUDIO_MARGIN = 0.04;

  function bestAudio(audio) {
    var best = null, bestSim = 0, second = 0;
    Object.keys(audio || {}).forEach(function (id) {
      var v = audio[id];
      if (v > bestSim) { second = bestSim; best = id; bestSim = v; }
      else if (v > second) second = v;
    });
    return { id: best, sim: bestSim, margin: bestSim - second };
  }

  // The conclusion from both routes: the words (explain) and the sound
  // (Voiceprint.matchAll, handed in as {spellId: 0..1}). Returns
  // { id, via, text, audio, sim, agree }; id is null when neither is convinced.
  function decide(text, audio, data) {
    var words = explain(text, data);
    var snd = bestAudio(audio);
    var sure = snd.id && snd.sim >= AUDIO_MIN && snd.margin >= AUDIO_MARGIN;
    var heardId = sure ? snd.id : null;
    var res = { text: words.id, audio: heardId, sim: snd.sim, agree: false, id: null, via: null };

    if (words.id && heardId && words.id === heardId) {
      res.id = words.id; res.agree = true; res.via = 'words + sound';
    } else if (words.id && !heardId) {
      res.id = words.id; res.via = words.via;
    } else if (!words.id && heardId) {
      // On its own, the sound has to be a clear match.
      if (snd.sim >= AUDIO_SURE) { res.id = heardId; res.via = 'sound'; }
    } else if (words.id && heardId) {
      // They disagree: the sound wins only when it is very sure and the words
      // were a loose sound-shape guess rather than a phrase you trained.
      if (snd.sim >= AUDIO_STRONG && words.via === 'built-in') {
        res.id = heardId; res.via = 'sound (over the words)';
      } else {
        res.id = words.id; res.via = words.via + ' (over the sound)';
      }
    }
    return res;
  }

  /* ---------- similarity scores (DEV mode) ---------- */

  function similarity(a, b) {
    if (!a || !b) return 0;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }

  // Known mishears per spell, from the fuzzy-matching lists above.
  var EXTRA_TARGETS = {
    incendio: INCENDIO_TARGETS,
    accio: ACCIO_TARGETS,
    depulso: DEPULSO_TARGETS,
    bombarda: BOMBARDA_TARGETS,
    confringo: CONFRINGO_TARGETS,
    avada: KEDAVRA_TARGETS,
    expelliarmus: EXPELLIARMUS_TARGETS,
    stupefy: STUPEFY_TARGETS,
    petrificus: PETRIFICUS_TARGETS.concat(TOTALUS_TARGETS),
    episkey: EPISKEY_TARGETS
  };

  // How close `text` is to every spell, 0-100, best first. Pure string
  // similarity (edit distance) against the spell's words, its known
  // mishears and any trained phrases, so it shows how near a miss was, not
  // which spell the matcher would actually pick (see explain()).
  function scores(text, data) {
    var heard = normalize(text);
    var heardWords = heard ? heard.split(' ') : [];
    var trained = data || merge(sourceData(), readLocal());
    return SPELLS.map(function (s) {
      var phrase = normalize(s.say), parts = phrase.split(' ');
      var variants = (trained[s.id] || []).concat(EXTRA_TARGETS[s.id] || []);
      var best = similarity(heard, phrase);
      variants.forEach(function (v) { best = Math.max(best, similarity(heard, v)); });
      // A single heard word against one word of a multi-word spell counts a
      // little less than a whole-phrase match, so "lumos" beats "lumos maxima".
      heardWords.forEach(function (w) {
        parts.forEach(function (t) {
          best = Math.max(best, similarity(w, t) * (parts.length > 1 ? 0.9 : 1));
        });
        variants.forEach(function (v) { best = Math.max(best, similarity(w, v)); });
      });
      return { id: s.id, name: s.name, pct: Math.round(best * 100) };
    }).sort(function (a, b) { return b.pct - a.pct; });
  }

  // Below this similarity, the best spell is no better than "that wasn't a
  // spell"; SHARPNESS controls how strongly the closest spell dominates.
  var NONE_SIM = 0.6, SHARPNESS = 8;

  // How much of the utterance each spell "owns", judged from the trained data
  // (source file + this browser's phrases, or `data`): similarity scores turned
  // into shares that add up to 100, with a "Not a spell" row for things that
  // resemble nothing. Well-trained spells take ~all of the share for their own
  // phrases; a spell with little data leaves the share spread out or on
  // "Not a spell". This is a heuristic read-out; explain() is what the game
  // actually acts on. Returns rows best first: {id, name, sim, count, share}.
  function distribution(text, data, audio) {
    var d = data || merge(sourceData(), readLocal());
    var heard = normalize(text);
    var sound = audio || {};
    var rows = scores(text, d).map(function (r) {
      // Blend in the sound wherever that spell has voiceprints: a weak match
      // counts for a quarter, a clear one for half.
      var sim = r.pct / 100;
      if (sound[r.id] != null) {
        var w = sound[r.id] >= AUDIO_SURE ? 0.5 : 0.25;
        sim = sim * (1 - w) + sound[r.id] * w;
      }
      return { id: r.id, name: r.name, sim: Math.round(sim * 100), text: r.pct,
        audio: sound[r.id] == null ? null : Math.round(sound[r.id] * 100),
        count: (d[r.id] || []).length, w: Math.pow(sim, SHARPNESS) };
    });
    rows.push({ id: null, name: 'Not a spell', sim: 0, text: 0, audio: null, count: 0,
      w: heard || Object.keys(sound).length ? Math.pow(NONE_SIM, SHARPNESS) : 1 });
    var total = rows.reduce(function (t, r) { return t + r.w; }, 0) || 1;
    var used = 0;
    rows.forEach(function (r) {
      var exact = r.w / total * 100;
      r.share = Math.floor(exact);
      r.frac = exact - r.share;
      used += r.share;
    });
    // hand the rounding remainder to the largest fractions so it sums to 100
    rows.slice().sort(function (a, b) { return b.frac - a.frac; }).slice(0, 100 - used)
      .forEach(function (r) { r.share++; });
    return rows.sort(function (a, b) { return b.share - a.share || b.sim - a.sim; })
      .map(function (r) {
        return { id: r.id, name: r.name, sim: r.sim, text: r.text, audio: r.audio,
          count: r.count, share: r.share };
      });
  }

  window.Voice = {
    SPELLS: SPELLS,
    scores: scores,
    distribution: distribution,
    STORE_KEY: STORE_KEY,
    spellById: spellById,
    normalize: normalize,
    identify: identify,
    explain: explain,
    decide: decide,
    AUDIO_SURE: AUDIO_SURE,
    sourceData: sourceData,
    sourcePrints: sourcePrints,
    parseData: parseData,
    readLocal: readLocal,
    readLocalPrints: readLocalPrints,
    writeLocal: writeLocal,
    merge: merge,
    mergePrints: mergePrints,
    toSourceFile: toSourceFile
  };
})();
