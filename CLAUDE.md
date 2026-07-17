# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page "Harry Potter Spellbook" experience: a dark 3D forest (Three.js r128, loaded from CDN) in which the
user casts spells via a button, typed incantation, or continuous speech recognition. No build step, no package
manager, no bundler — plain HTML/CSS/JS loaded directly by the browser via classic `<script>` tags.

## Running / testing

- Open `index.html` directly in a browser, or serve the directory with any static file server
  (e.g. `python -m http.server`). A server is required for automated browser testing tools (Playwright etc.)
  that block the `file://` protocol; opening the file directly works fine for manual use.
- There is no test suite, linter, or build command. To catch syntax errors after editing a file, run:
  `node --check js/<file>.js`
- Casting via the microphone requires a real user gesture to grant mic permission (handled by the "Open the
  Spellbook" click) and won't work over `file://` in some browsers — test over `http://localhost`.

## Script load order matters

All modules are classic scripts (not ES modules) that attach a single global. `index.html` loads them in a fixed
dependency order — get this wrong and later scripts see `undefined` globals:

```
three.min.js (CDN, THREE)
js/animals.js   -> window.ANIMALS
js/audio.js     -> window.AudioSys
js/forest.js    -> window.Forest, window.makeGlowTexture
js/patronus.js  -> window.Patronus
js/lumos.js     -> window.Lumos
js/ui.js        -> window.UI
js/main.js      -> bootstraps everything, no exports
```

`main.js` is the only file that touches all the others; it creates the THREE renderer/scene/camera, instantiates
each spell module, and wires `UI.init({...hooks})`.

## Spell module pattern

Each spell (`patronus.js`, `lumos.js`) is a self-contained factory: `create(scene[, Q])` returns an object with:
- a `cast`/`set` entry point that starts/toggles the effect (returns `false`/no-ops if already in that state)
- `update(t, dt)` called every frame from `main.js`'s render loop
- `onPhase(name)` — a callback `main.js` overwrites to hook captions/sound to phase changes (e.g. Patronus:
  `charge`/`burst`/`form`/`run`/`fade`/`done`; Lumos: `on`/`maxima`/`off`)
- `getWandTip` — assigned by `main.js` to a shared function that returns the wand tip's world position (so effects
  originate from the wand regardless of camera/walk state)

`main.js`'s `onCast(spellId, payload)` hook (passed into `UI.init`) is the single dispatch point that routes a cast
to the right module. To add a new spell:
1. Add a `js/<spell>.js` module following the pattern above, load it in `index.html` before `ui.js`.
2. Add a `<li class="spell" data-spell="...">` entry to `#spell-list` in `index.html` (locked entries use
   `class="spell locked"` and render as "Coming soon").
3. Instantiate it in `main.js`, wire `getWandTip`/`onPhase`, add a branch in the `onCast` dispatcher.
4. Add its incantation regex(es) to `tryIncantation()` and the voice `onresult` handler in `ui.js`.
5. If it needs a settings UI (like Patronus's animal picker), give it its own modal + a small icon button in
   `#cast-bar`, opened by clicking its spell-list entry — don't add a global "currently selected spell" concept;
   each spell's list entry is independently clickable/castable.

## Incantation matching is centralized in ui.js

Both the typed textbox (Enter key) and the always-on speech recognizer route through the same regexes
(`tryIncantation()` for typed text; a near-duplicate matcher in the `SpeechRecognition.onresult` handler for
speech, since speech needs looser/fuzzier matching for ASR mishears — e.g. "Nox" is matched against
`nox|knox|knocks|noks` because it's a near-homophone of "knocks"). When adding a spell phrase, update both.

Voice recognition (`micStartRecognition` in `ui.js`) is continuous and self-restarting: it calls itself again on
`onend` unless the user denied mic permission (`mic.wantOn` gates the retry loop). It starts once, from
`main.js`'s `onStart` hook, inside the "Open the Spellbook" click handler (must stay inside a user-gesture call
stack to get mic permission).

## Rendering / performance

`main.js` builds a quality-tier object `Q` (particle counts, shadow map size, pixel ratio, patronus point counts)
chosen once at load via a mobile heuristic (coarse pointer + UA + small screen). `forest.js` and `patronus.js`
both take `Q` and scale their geometry/particle counts accordingly — when tuning visuals, check both the
`isMobile` and desktop branch of `Q` in `main.js`.

Lighting/fog "mood" (patronus glow tinting fog, Lumos Maxima widening ambient light, dementor weather darkening
everything) is blended once per frame in `main.js`'s `frame()` function from each subsystem's `.intensity`
(and, for Lumos, `.maxima`) — a spell's local `THREE.PointLight` on the wand tip is separate from this global
ambient/fog contribution. Keep that distinction when adding new spells: a small local light effect should not
also crank the scene-wide hemisphere light/fog, or it will read as "lighting up the whole forest" regardless of
the light's actual falloff distance.

## Camera modes

`updateCamera()` in `main.js` switches behavior based on `patronus.phase` and `walk.active`, in priority order:
1. Patronus `run`/`fade` — cinematic follow-cam trailing the running/flying Patronus.
2. Patronus `charge`/`burst`/`form` — fixed cinematic framing of the wand.
3. Free-walk mode (`walk.active`, entered on first WASD/Space/pointer-lock-drag input) — first-person
   WASD + jump + mouselook (via Pointer Lock, click the canvas to engage), permanently replaces the idle camera
   for the rest of the session once triggered.
4. Idle — slow autonomous drift + subtle pointer parallax (only before the user ever moves).

## Audio

`audio.js` synthesizes all sound with the Web Audio API — there are no audio file assets. A single
`ConvolverNode` fed by a generated impulse response acts as shared reverb ("forest cathedral" space); most sound
sources send to both a dry bus and the reverb bus via `out(node, dryAmount, wetAmount)`. Music is a hand-written
note sequence (`MELODY`) scheduled with a look-ahead scheduler (`schedule()` in `startMusic()`) — if you touch
that scheduler, keep the `scheduledTo` cursor logic intact or notes will double-fire.
