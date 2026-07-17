/* Bombarda: a concussive Blasting Curse. Strikes the ground ahead of the
   wand with a flash and shockwave, knocks nearby trees flat, sets fire to
   whatever's close by (shrubs, logs, mushrooms, flowers, or bare ground),
   flings debris outward, and leaves a scorched crater behind.
   Bombarda Maxima is the same curse thrown with far greater force: a wider
   blast radius, more trees felled, more fires, more debris, a bigger crater.
   Global: Bombarda */
(function () {
  'use strict';

  var BLAST_TIME = 0.85, BURN_TIME = 8.0, FADE_TIME = 1.8;
  var AIM_DIST = 13, GRAVITY = 13;

  var NORMAL = {
    radius: 13, igniteRadius: 9, flameCount: 5, emberCount: 62, smokeCount: 6,
    debrisCount: 75, craterR: 3.4, craterDepth: 1.0, craterRim: 0.4, flameScale: 1.15,
    lightPeak: 9, lightRange: 20, shakeAmt: 1.35
  };
  var MAXIMA = {
    radius: 23, igniteRadius: 15, flameCount: 10, emberCount: 110, smokeCount: 11,
    debrisCount: 140, craterR: 5.8, craterDepth: 1.9, craterRim: 0.65, flameScale: 1.6,
    lightPeak: 16, lightRange: 32, shakeAmt: 2.3
  };

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
    blob(W / 2, H * 0.86, W * 0.44, H * 0.19, 'rgba(255,220,150,0.95)', 'rgba(255,110,25,0)');
    blob(W / 2, H * 0.58, W * 0.32, H * 0.25, 'rgba(255,165,75,0.9)', 'rgba(255,80,15,0)');
    blob(W / 2, H * 0.32, W * 0.18, H * 0.20, 'rgba(255,245,205,0.92)', 'rgba(255,180,70,0)');
    return new THREE.CanvasTexture(c);
  }

  function smokeTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(60,56,52,0.34)');
    g.addColorStop(0.5, 'rgba(45,42,38,0.16)');
    g.addColorStop(1, 'rgba(25,24,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // A dark, faintly jagged scorch mark left behind on the ground.
  function craterTexture() {
    var W = 128;
    var c = document.createElement('canvas');
    c.width = c.height = W;
    var ctx = c.getContext('2d');
    var cx = W / 2, cy = W / 2;
    var spikes = 14, rOut = W * 0.48, rIn = W * 0.34;
    ctx.beginPath();
    for (var i = 0; i < spikes * 2; i++) {
      var ang = (i / (spikes * 2)) * Math.PI * 2;
      var r = (i % 2 === 0 ? rOut : rIn) * (0.85 + Math.random() * 0.3);
      var x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOut);
    g.addColorStop(0, 'rgba(15,10,8,0.85)');
    g.addColorStop(0.6, 'rgba(20,14,10,0.55)');
    g.addColorStop(1, 'rgba(20,14,10,0)');
    ctx.fillStyle = g;
    ctx.fill();
    return new THREE.CanvasTexture(c);
  }

  // A bright ring that fades toward both its inner and outer edge — the
  // shockwave racing outward from the blast.
  function ringTexture() {
    var W = 128;
    var c = document.createElement('canvas');
    c.width = c.height = W;
    var ctx = c.getContext('2d');
    var cx = W / 2, cy = W / 2;
    var g = ctx.createRadialGradient(cx, cy, W * 0.26, cx, cy, W * 0.5);
    g.addColorStop(0, 'rgba(255,235,190,0)');
    g.addColorStop(0.55, 'rgba(255,220,160,0.9)');
    g.addColorStop(1, 'rgba(255,180,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
    return new THREE.CanvasTexture(c);
  }

  function create(scene, forest) {
    var flameTex = flameTexture(), smokeTex = smokeTexture();
    var craterTex = craterTexture(), ringTex = ringTexture();

    var MAX_FLAMES = MAXIMA.flameCount, MAX_SMOKES = MAXIMA.smokeCount;
    var MAX_EMBERS = MAXIMA.emberCount, MAX_DEBRIS = MAXIMA.debrisCount;

    var flames = [];
    for (var i = 0; i < MAX_FLAMES; i++) {
      var flm = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, transparent: true, depthWrite: false, opacity: 0,
        blending: THREE.AdditiveBlending
      }));
      flm.userData.seed = Math.random() * 30;
      flm.visible = false;
      scene.add(flm);
      flames.push(flm);
    }

    var smokes = [];
    for (i = 0; i < MAX_SMOKES; i++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, transparent: true, opacity: 0, depthWrite: false
      }));
      sp.userData.seed = Math.random() * 20;
      sp.userData.rise = Math.random() * 2.4;
      sp.visible = false;
      scene.add(sp);
      smokes.push(sp);
    }

    var emberGeo = new THREE.BufferGeometry();
    var ePos = new Float32Array(MAX_EMBERS * 3);
    var eCol = new Float32Array(MAX_EMBERS * 3);
    var eSeed = new Float32Array(MAX_EMBERS);
    for (i = 0; i < MAX_EMBERS; i++) eSeed[i] = Math.random() * Math.PI * 2;
    emberGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    emberGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
    var embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(255,225,165,1)', 'rgba(255,95,30,0.6)'),
      size: 0.11, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    embers.visible = false;
    embers.frustumCulled = false;
    scene.add(embers);

    // Flung earth/debris — additive like the rest of the effect pool so it
    // reads as glowing hot chunks rather than plain grey dots at night.
    var debrisGeo = new THREE.BufferGeometry();
    var dPos = new Float32Array(MAX_DEBRIS * 3);
    var dVel = new Float32Array(MAX_DEBRIS * 3);
    var dLife = new Float32Array(MAX_DEBRIS);
    var dCol = new Float32Array(MAX_DEBRIS * 3);
    debrisGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    debrisGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
    var debris = new THREE.Points(debrisGeo, new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(255,210,160,1)', 'rgba(150,95,50,0.5)'),
      size: 0.16, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    debris.visible = false;
    debris.frustumCulled = false;
    scene.add(debris);

    var ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: ringTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide
      }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.visible = false;
    scene.add(ring);

    var blastLight = new THREE.PointLight(0xffa361, 0, 16, 2);
    scene.add(blastLight);

    // Scorch craters left behind by every cast — permanent, but fade in
    // quickly so they don't just pop into existence.
    var craterFades = [];

    var B = {
      active: false,
      phase: null,
      shake: 0,
      onPhase: function () {},
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    var basePos = new THREE.Vector3(), phaseT = 0;
    var profile = NORMAL, origins = [], activeMaxima = false;
    var tmpTarget = new THREE.Vector3();

    function computeTarget(pose, out) {
      out.copy(pose.pos).addScaledVector(pose.dir, AIM_DIST);
      out.y = 0.02;
      return out;
    }

    function gatherOrigins(center, prof) {
      var list = [basePos.clone()];
      var cands = [];
      var liftables = forest.liftables || [];
      for (var n = 0; n < liftables.length; n++) {
        var it = liftables[n];
        if (it.label === 'rock') continue;               // rocks don't burn
        var d = it.basePos.distanceTo(center);
        if (d <= prof.igniteRadius) cands.push({ pos: it.basePos, dist: d });
      }
      cands.sort(function (a, b) { return a.dist - b.dist; });
      for (var k = 0; k < cands.length && list.length < prof.flameCount; k++) {
        list.push(cands[k].pos.clone());
      }
      return list;
    }

    B.cast = function (maxima) {
      if (B.active) return false;
      var pose = B.getCameraPose();
      computeTarget(pose, basePos);
      profile = maxima ? MAXIMA : NORMAL;
      activeMaxima = !!maxima;

      if (forest.fellTrees) forest.fellTrees(basePos, profile.radius);

      // Actually dig a bowl-shaped pit into the ground mesh, and drop the
      // blast's own origin down onto the new crater floor so the fire,
      // embers, debris and light all erupt out of the hole itself.
      if (forest.digCrater) {
        forest.digCrater(basePos, profile.craterR, profile.craterDepth, profile.craterRim);
        if (forest.groundHeightAt) basePos.y = forest.groundHeightAt(basePos.x, basePos.z) + 0.04;
      }

      origins = gatherOrigins(basePos, profile);

      // Crater decal, faded in over the first fraction of a second, resting
      // right on the new pit floor.
      var crater = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: craterTex, transparent: true, depthWrite: false, opacity: 0
        }));
      crater.rotation.x = -Math.PI / 2;
      crater.rotation.z = Math.random() * Math.PI * 2;
      crater.position.set(basePos.x, basePos.y + 0.015, basePos.z);
      var cs = profile.craterR * 2.3;
      crater.scale.set(cs, cs, 1);
      scene.add(crater);
      craterFades.push({ mesh: crater, t: 0 });

      // Debris burst.
      for (var i = 0; i < MAX_DEBRIS; i++) {
        if (i < profile.debrisCount) {
          dPos[i * 3] = basePos.x;
          dPos[i * 3 + 1] = basePos.y + 0.1;
          dPos[i * 3 + 2] = basePos.z;
          var ang = Math.random() * Math.PI * 2;
          var speedH = (2.4 + Math.random() * 4.2) * (activeMaxima ? 1.5 : 1.15);
          var speedV = (4.5 + Math.random() * 6.5) * (activeMaxima ? 1.45 : 1.15);
          dVel[i * 3] = Math.cos(ang) * speedH;
          dVel[i * 3 + 1] = speedV;
          dVel[i * 3 + 2] = Math.sin(ang) * speedH;
          dLife[i] = 1;
        } else {
          dLife[i] = 0;
        }
      }
      debris.visible = true;

      // Shockwave ring.
      ring.position.set(basePos.x, 0.03, basePos.z);
      ring.scale.set(profile.craterR * 0.6, profile.craterR * 0.6, 1);
      ring.material.opacity = 0.9;
      ring.visible = true;

      // Fires: main crater fire plus one per nearby ignitable found.
      var activeFlames = Math.min(profile.flameCount, origins.length);
      for (i = 0; i < MAX_FLAMES; i++) {
        flames[i].visible = i < activeFlames;
        flames[i].material.opacity = 0;
      }
      var activeSmokes = Math.min(profile.smokeCount, MAX_SMOKES);
      for (i = 0; i < MAX_SMOKES; i++) {
        smokes[i].visible = i < activeSmokes;
        smokes[i].material.opacity = 0;
      }
      embers.visible = true;

      blastLight.distance = profile.lightRange;
      blastLight.position.copy(basePos);
      blastLight.position.y += 0.6;

      B.shake = profile.shakeAmt;
      phaseT = 0;
      B.active = true;
      B.phase = 'blast';
      B.onPhase('blast');
      return true;
    };

    function finish() {
      B.active = false;
      B.phase = null;
      B.shake = 0;
      ring.visible = false;
      embers.visible = false;
      debris.visible = false;
      for (var i = 0; i < MAX_FLAMES; i++) flames[i].visible = false;
      for (i = 0; i < MAX_SMOKES; i++) smokes[i].visible = false;
      blastLight.intensity = 0;
      B.onPhase('done');
    }

    B.update = function (t, dt) {
      // Crater fade-in runs regardless of whether a blast is still active,
      // so a crater from an earlier cast keeps fading in correctly.
      for (var ci = craterFades.length - 1; ci >= 0; ci--) {
        var cf = craterFades[ci];
        cf.t += dt;
        cf.mesh.material.opacity = Math.min(1, cf.t / 0.35) * 0.95;
        if (cf.t > 0.4) craterFades.splice(ci, 1);
      }

      if (!B.active) return;
      phaseT += dt;

      if (B.phase === 'blast' && phaseT >= BLAST_TIME) {
        phaseT = 0; B.phase = 'burn';
        ring.visible = false;
        B.onPhase('burn');
      } else if (B.phase === 'burn' && phaseT >= BURN_TIME) {
        phaseT = 0; B.phase = 'fade'; B.onPhase('fade');
      } else if (B.phase === 'fade' && phaseT >= FADE_TIME) {
        finish();
        return;
      }

      B.shake *= Math.exp(-dt * (B.phase === 'blast' ? 2.6 : 6.5));
      if (B.shake < 0.002) B.shake = 0;

      // Shockwave ring expansion.
      if (B.phase === 'blast') {
        var rp = phaseT / BLAST_TIME;
        var rs = profile.craterR * (0.6 + rp * 2.6);
        ring.scale.set(rs, rs, 1);
        ring.material.opacity = (1 - rp) * 0.9;
      }

      // Blast light: a quick bright flash, settling into an ember glow that
      // lingers through the burn and fades out at the end.
      var flash = B.phase === 'blast' ? Math.max(0, 1 - phaseT / (BLAST_TIME * 0.6)) : 0;
      var fireHeight;
      if (B.phase === 'blast') fireHeight = Math.min(1, phaseT / (BLAST_TIME * 0.55));
      else if (B.phase === 'burn') fireHeight = 1;
      else fireHeight = 1 - phaseT / FADE_TIME;
      fireHeight = Math.max(0, Math.min(1, fireHeight));
      fireHeight = fireHeight * fireHeight * (3 - 2 * fireHeight);
      var flicker = 1 + Math.sin(t * 11.5) * 0.1 + Math.sin(t * 27) * 0.06;
      blastLight.intensity = profile.lightPeak * (flash * 1.7 + fireHeight * 0.4) * flicker;

      // Debris flight + settle.
      for (var i = 0; i < MAX_DEBRIS; i++) {
        if (dLife[i] <= 0) { dCol[i * 3] = dCol[i * 3 + 1] = dCol[i * 3 + 2] = 0; continue; }
        dVel[i * 3 + 1] -= GRAVITY * dt;
        dPos[i * 3] += dVel[i * 3] * dt;
        dPos[i * 3 + 1] += dVel[i * 3 + 1] * dt;
        dPos[i * 3 + 2] += dVel[i * 3 + 2] * dt;
        if (dPos[i * 3 + 1] < 0.05) {
          dPos[i * 3 + 1] = 0.05; dVel[i * 3 + 1] = 0;
          dVel[i * 3] *= 0.85; dVel[i * 3 + 2] *= 0.85;
        }
        dLife[i] -= dt * 0.55;
        var de = Math.max(0, dLife[i]);
        dCol[i * 3] = 0.85 * de; dCol[i * 3 + 1] = 0.55 * de; dCol[i * 3 + 2] = 0.22 * de;
      }
      debrisGeo.attributes.position.needsUpdate = true;
      debrisGeo.attributes.color.needsUpdate = true;

      // Embers, cycled across every fire origin.
      var originCount = origins.length || 1;
      for (i = 0; i < MAX_EMBERS; i++) {
        if (i >= profile.emberCount) { eCol[i * 3] = eCol[i * 3 + 1] = eCol[i * 3 + 2] = 0; continue; }
        var origin = origins[i % originCount];
        var a = eSeed[i] + t * 1.4;
        var r = 0.18 + 0.32 * ((eSeed[i] * 37) % 1);
        var rise = ((t * (0.6 + (eSeed[i] * 13 % 1) * 0.8) + eSeed[i]) % 1.3);
        ePos[i * 3] = origin.x + Math.cos(a) * r * (1 - rise * 0.4);
        ePos[i * 3 + 1] = origin.y + 0.05 + rise * 1.6;
        ePos[i * 3 + 2] = origin.z + Math.sin(a) * r * (1 - rise * 0.4);
        var ee = fireHeight * (1 - rise * 0.8) * (0.6 + 0.4 * Math.sin(t * 5 + eSeed[i] * 4));
        eCol[i * 3] = 1.0 * ee; eCol[i * 3 + 1] = (0.55 + 0.3 * (1 - rise)) * ee; eCol[i * 3 + 2] = 0.18 * ee;
      }
      emberGeo.attributes.position.needsUpdate = true;
      emberGeo.attributes.color.needsUpdate = true;

      // Flame billboards, one per active origin.
      var activeFlames = Math.min(profile.flameCount, origins.length);
      for (i = 0; i < MAX_FLAMES; i++) {
        var flm = flames[i];
        if (i >= activeFlames) { flm.material.opacity = 0; continue; }
        var forigin = origins[i];
        var seed = flm.userData.seed;
        var jitter = 0.85 + 0.15 * Math.sin(t * 9 + seed * 3) + 0.08 * Math.sin(t * 23 + seed);
        var core = i === 0;
        var rise2 = core ? 0.95 : 0.62;
        flm.position.set(
          forigin.x + Math.sin(t * 2.1 + seed) * 0.06,
          forigin.y + rise2 * jitter * fireHeight * 0.5 + 0.05,
          forigin.z + Math.cos(t * 1.7 + seed) * 0.06
        );
        var baseW = (core ? 1.1 : 0.68) * profile.flameScale, baseH = (core ? 1.8 : 1.2) * profile.flameScale;
        var sc = fireHeight * jitter;
        flm.scale.set(baseW * sc, baseH * sc, 1);
        flm.material.rotation = Math.sin(t * 1.4 + seed) * 0.12;
        flm.material.opacity = fireHeight * (core ? 0.95 : 0.7) * (0.7 + 0.3 * Math.sin(t * 6 + seed * 4));
      }

      // Smoke columns, cycled across origins the same way as embers.
      var activeSmokes = Math.min(profile.smokeCount, MAX_SMOKES);
      for (i = 0; i < MAX_SMOKES; i++) {
        var s = smokes[i];
        if (i >= activeSmokes) { s.material.opacity = 0; continue; }
        var sorigin = origins[i % originCount];
        var u = s.userData;
        u.rise += dt * 0.35;
        if (u.rise > 2.4) u.rise -= 2.4;
        var f = u.rise / 2.4;
        s.position.set(
          sorigin.x + Math.sin(t * 0.4 + u.seed) * 0.4 * f,
          sorigin.y + 0.6 + f * 3.4,
          sorigin.z + Math.cos(t * 0.33 + u.seed) * 0.4 * f
        );
        var ssc = 1.0 + f * 1.8;
        s.scale.set(ssc, ssc, 1);
        s.material.opacity = fireHeight * 0.3 * (1 - f);
      }
    };

    return B;
  }

  window.Bombarda = { create: create };
})();
