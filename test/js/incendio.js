/* Incendio: a small fire kindles wherever the wand is pointed — catching a
   nearby shrub if one's in range, or simply landing on the ground ahead.
   It flares up, burns with crackling embers and rising smoke for a while,
   then dies down on its own. Casting again while it burns snuffs it early.
   Global: Incendio */
(function () {
  'use strict';

  var IGNITE_TIME = 0.45, BURN_TIME = 11, DIE_TIME = 1.6;
  var FIRE_RANGE = 10, EMBER_COUNT = 46, SMOKE_COUNT = 9;

  function smokeTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(70,66,60,0.30)');
    g.addColorStop(0.5, 'rgba(50,46,42,0.14)');
    g.addColorStop(1, 'rgba(30,28,26,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // A tapering tongue-of-flame billboard: wide hot base fading to a thin
  // bright tip. Several of these, staggered and flickering, read as an
  // actual body of fire rather than a cloud of separate embers.
  function flameTexture() {
    var W = 64, H = 96;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    function blob(cx, cy, r, ry, inner, outer) {
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    blob(W / 2, H * 0.86, W * 0.46, H * 0.20, 'rgba(255,225,150,0.95)', 'rgba(255,120,30,0)');
    blob(W / 2, H * 0.60, W * 0.34, H * 0.26, 'rgba(255,175,80,0.92)', 'rgba(255,90,20,0)');
    blob(W / 2, H * 0.34, W * 0.20, H * 0.22, 'rgba(255,250,215,0.95)', 'rgba(255,190,80,0)');
    blob(W / 2, H * 0.12, W * 0.09, H * 0.12, 'rgba(255,255,245,1)', 'rgba(255,220,140,0)');
    return new THREE.CanvasTexture(c);
  }

  function create(scene, forest) {
    var emberGeo = new THREE.BufferGeometry();
    var ePos = new Float32Array(EMBER_COUNT * 3);
    var eCol = new Float32Array(EMBER_COUNT * 3);
    var eSeed = new Float32Array(EMBER_COUNT);
    for (var i = 0; i < EMBER_COUNT; i++) eSeed[i] = Math.random() * Math.PI * 2;
    emberGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    emberGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
    var embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(255,230,170,1)', 'rgba(255,100,35,0.6)'),
      size: 0.1, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    embers.visible = false;
    embers.frustumCulled = false;
    scene.add(embers);

    var flameTex = flameTexture();
    var FLAME_COUNT = 6;
    var flames = [];
    for (i = 0; i < FLAME_COUNT; i++) {
      var flm = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, transparent: true, depthWrite: false, opacity: 0,
        blending: THREE.AdditiveBlending
      }));
      flm.userData.seed = Math.random() * 30;
      // one central tall flame plus a ring of smaller ones around it, so the
      // fire reads as a body of flame from any viewing angle instead of a
      // single flat billboard
      flm.userData.core = (i === 0);
      flm.userData.side = flm.userData.core ? 0 : (i - (FLAME_COUNT - 1) / 2) * 0.16;
      flm.userData.forward = flm.userData.core ? 0 : ((i % 2) * 2 - 1) * 0.13;
      flm.visible = false;
      scene.add(flm);
      flames.push(flm);
    }

    var smokeTex = smokeTexture();
    var smokes = [];
    for (i = 0; i < SMOKE_COUNT; i++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, transparent: true, opacity: 0, depthWrite: false
      }));
      sp.scale.set(0.9, 0.9, 1);
      sp.userData.seed = Math.random() * 20;
      sp.userData.rise = Math.random() * 2.2;
      scene.add(sp);
      smokes.push(sp);
    }

    var fireLight = new THREE.PointLight(0xff8a3d, 0, 14, 2);
    scene.add(fireLight);

    var I = {
      active: false,
      phase: null,
      onPhase: function () {},
      zombies: null, // set from main.js; lets Incendio target a nearby enemy directly
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    var basePos = new THREE.Vector3(), phaseT = 0;
    I.pos = basePos; // exposed so other systems (zombies) can check proximity
    var toObj = new THREE.Vector3(), fallback = new THREE.Vector3();
    var followTarget = null; // a zombie the fire is currently pinned to

    function findTarget() {
      var pose = I.getCameraPose();
      var best = null, bestScore = -Infinity;
      var list = forest && forest.liftables;
      if (list) {
        for (var i = 0; i < list.length; i++) {
          var it = list[i];
          if (it.label !== 'shrub') continue;
          toObj.copy(it.basePos).sub(pose.pos);
          var dist = toObj.length();
          if (dist > FIRE_RANGE || dist < 0.01) continue;
          toObj.normalize();
          var facing = toObj.dot(pose.dir);
          if (facing < 0.4) continue;
          var score = facing * 3 - dist * 0.15;
          if (score > bestScore) { bestScore = score; best = it; }
        }
      }
      if (best) return best.basePos;
      fallback.copy(pose.pos).addScaledVector(pose.dir, 6);
      fallback.y = 0.02;
      return fallback;
    }

    I.cast = function () {
      if (I.active) {
        // already burning: snuff it out early instead of relighting elsewhere
        phaseT = 0; I.phase = 'fade'; I.onPhase('fade');
        return true;
      }
      // A nearby enemy in view takes priority over a shrub/the ground — the
      // fire is pinned to it (followTarget) and chases it every frame below.
      followTarget = null;
      var pose = I.getCameraPose();
      var enemy = I.zombies && I.zombies.findNearestAlive ?
        I.zombies.findNearestAlive(pose.pos, FIRE_RANGE, pose.dir) : null;
      if (enemy) { followTarget = enemy; basePos.copy(enemy.pos); }
      else basePos.copy(findTarget());
      phaseT = 0;
      I.active = true;
      I.phase = 'ignite';
      I.onPhase('ignite');
      embers.visible = true;
      for (var i = 0; i < flames.length; i++) { flames[i].visible = true; flames[i].material.opacity = 0; }
      for (var j = 0; j < smokes.length; j++) smokes[j].material.opacity = 0;
      return true;
    };

    function finish() {
      // the fire always burns out on its own (ignite -> burn -> fade -> out) —
      // it never lingers indefinitely, even if never re-cast.
      I.active = false;
      I.phase = null;
      embers.visible = false;
      for (var i = 0; i < flames.length; i++) flames[i].visible = false;
      fireLight.intensity = 0;
      I.onPhase('out');
    }

    I.update = function (t, dt) {
      if (!I.active) return;
      phaseT += dt;

      if (I.phase === 'ignite' && phaseT >= IGNITE_TIME) {
        phaseT = 0; I.phase = 'burn'; I.onPhase('burn');
      } else if (I.phase === 'burn' && phaseT >= BURN_TIME) {
        phaseT = 0; I.phase = 'fade'; I.onPhase('fade');
      } else if (I.phase === 'fade' && phaseT >= DIE_TIME) {
        finish();
        return;
      }

      var height;
      if (I.phase === 'ignite') height = phaseT / IGNITE_TIME;
      else if (I.phase === 'fade') height = 1 - phaseT / DIE_TIME;
      else height = 1;
      height = height * height * (3 - 2 * height);

      var flicker = 1 + Math.sin(t * 11.5) * 0.14 + Math.sin(t * 27) * 0.07;
      fireLight.position.set(basePos.x, basePos.y + 0.5, basePos.z);
      fireLight.intensity = 4.2 * height * flicker;

      for (var fi = 0; fi < flames.length; fi++) {
        var flm = flames[fi];
        var seed = flm.userData.seed;
        var jitter = 0.85 + 0.15 * Math.sin(t * 9 + seed * 3) + 0.08 * Math.sin(t * 23 + seed);
        var rise = flm.userData.core ? 0.95 : 0.62;
        var wobbleX = flm.userData.side + Math.sin(t * 2.1 + seed) * 0.06;
        var wobbleZ = flm.userData.forward + Math.cos(t * 1.7 + seed) * 0.06;
        flm.position.set(
          basePos.x + wobbleX,
          basePos.y + rise * jitter * height * 0.5 + 0.05,
          basePos.z + wobbleZ
        );
        var baseW = flm.userData.core ? 1.15 : 0.72;
        var baseH = flm.userData.core ? 1.9 : 1.25;
        var sc = height * jitter;
        flm.scale.set(baseW * sc, baseH * sc, 1);
        flm.material.rotation = Math.sin(t * 1.4 + seed) * 0.12;
        flm.material.opacity = height * (flm.userData.core ? 0.95 : 0.7) *
          (0.7 + 0.3 * Math.sin(t * 6 + seed * 4));
      }

      for (var i = 0; i < EMBER_COUNT; i++) {
        var a = eSeed[i] + t * 1.4;
        var r = 0.18 + 0.32 * ((eSeed[i] * 37) % 1);
        var rise = ((t * (0.6 + (eSeed[i] * 13 % 1) * 0.8) + eSeed[i]) % 1.3);
        ePos[i * 3] = basePos.x + Math.cos(a) * r * (1 - rise * 0.4);
        ePos[i * 3 + 1] = basePos.y + 0.05 + rise * 1.6;
        ePos[i * 3 + 2] = basePos.z + Math.sin(a) * r * (1 - rise * 0.4);
        var e = height * (1 - rise * 0.8) * (0.6 + 0.4 * Math.sin(t * 5 + eSeed[i] * 4));
        eCol[i * 3] = 1.0 * e; eCol[i * 3 + 1] = (0.55 + 0.3 * (1 - rise)) * e; eCol[i * 3 + 2] = 0.18 * e;
      }
      emberGeo.attributes.position.needsUpdate = true;
      emberGeo.attributes.color.needsUpdate = true;

      for (i = 0; i < smokes.length; i++) {
        var s = smokes[i];
        var u = s.userData;
        u.rise += dt * 0.35;
        if (u.rise > 2.2) u.rise -= 2.2;
        var f = u.rise / 2.2;
        s.position.set(
          basePos.x + Math.sin(t * 0.4 + u.seed) * 0.4 * f,
          basePos.y + 0.6 + f * 3.4,
          basePos.z + Math.cos(t * 0.33 + u.seed) * 0.4 * f
        );
        var sc = 1.0 + f * 1.8;
        s.scale.set(sc, sc, 1);
        s.material.opacity = height * 0.32 * (1 - f);
      }
    };

    return I;
  }

  window.Incendio = { create: create };
})();
