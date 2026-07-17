/* Expecto Patronum: spark burst -> swirling energy -> the animal coalesces ->
   runs/flies through the forest with a fading trail -> gentle fade-out.
   Global: Patronus */
(function () {
  'use strict';

  // Sequence timeline (seconds from cast). Run/fade ends are set per cast:
  // run duration = path length / animal speed, so each animal has its own pace.
  var T_BURST = 0.9, T_SWIRL_END = 3.4, T_FORM_END = 6.6;
  var DRIFT_MAX = 8;    // how far the mouse can steer the running Patronus off its path

  function smooth(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function create(scene, Q) {
    var N = Q.patronusPoints, M = Q.trailPoints;

    // --- main cloud ---
    var geo = new THREE.BufferGeometry();
    var cur = new Float32Array(N * 3);
    var col = new Float32Array(N * 3);
    var vel = new Float32Array(N * 3);
    var baseCol = new Float32Array(N * 3);
    var seed = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      seed[i] = Math.random();
      var w = 0.55 + Math.random() * 0.45;         // silvery blue-white mix
      baseCol[i * 3] = 0.72 * w;
      baseCol[i * 3 + 1] = 0.86 * w;
      baseCol[i * 3 + 2] = 1.0 * w;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(cur, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: makeGlowTexture(),
      size: 0.11, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: true
    }));
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);

    // --- trail ---
    var tGeo = new THREE.BufferGeometry();
    var tPos = new Float32Array(M * 3);
    var tCol = new Float32Array(M * 3);
    var tVel = new Float32Array(M * 3);
    var tLife = new Float32Array(M);
    tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
    var trail = new THREE.Points(tGeo, new THREE.PointsMaterial({
      map: makeGlowTexture(),
      size: 0.16, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    trail.frustumCulled = false;
    trail.visible = false;
    scene.add(trail);
    var tCursor = 0;

    // --- the light the patronus casts on the forest ---
    var light = new THREE.PointLight(0xbfe3ff, 0, 36, 2);
    scene.add(light);

    var P = {
      active: false,
      phase: null,
      pos: new THREE.Vector3(),
      intensity: 0,
      onPhase: function () {},
      getWandTip: function () { return new THREE.Vector3(0, 2, 8); }
    };

    var animal = null, shape = null, castT = 0;
    var runEnd = 15, fadeEnd = 19;
    var path = null, buildupHandle = null, runSound = null;
    var formCenter = new THREE.Vector3();
    var quat = new THREE.Quaternion();          // target facing
    var faceQuat = new THREE.Quaternion();      // eased facing actually used
    var bankQuat = new THREE.Quaternion();
    var haveFace = false, bank = 0;
    var offset = { x: 0, z: 0 }, desired = { x: 0, z: 0 };
    var FWD = new THREE.Vector3(1, 0, 0);
    var v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
    var groundH = 0;

    // One wide sweeping circuit through the trees. Waypoints are far apart and
    // the turns are long arcs — a galloping stag can't pivot on the spot.
    function buildPath(a) {
      groundH = a.kind === 'fly' ? a.flyH : shape.groundOffset + 0.12;
      var h = groundH;
      var wp = [
        [1, h, 5], [13, h + fly(a, 1.0), 1], [25, h + fly(a, 2.2), -5],
        [36, h + fly(a, 1.2), -14], [40, h + fly(a, 2.8), -27],
        [32, h + fly(a, 1.5), -38], [18, h + fly(a, 3.0), -42],
        [3, h + fly(a, 1.4), -38], [-7, h + fly(a, 2.6), -28],
        [-9, h + fly(a, 1.2), -16], [-4, h + fly(a, 2.4), -7]
      ];
      var pts = [];
      for (var i = 0; i < wp.length; i++) {
        pts.push(new THREE.Vector3(wp[i][0], wp[i][1], wp[i][2]));
      }
      return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    }
    function fly(a, amp) { return a.kind === 'fly' ? amp : 0; }

    // Eased path parameter: gentle start, cruise, gentle end.
    function runU(x) {
      var t = Math.max(0, Math.min(1, x));
      return t * t * (3 - 2 * t) * 0.15 + t * 0.85 * t; // slow in, near-linear out
    }

    // World position of body particle i at run-time t, origin/orientation given.
    var gaitOut = { x: 0, y: 0, z: 0 };
    function gait(i, t) {
      var lx = shape.pos[i * 3], ly = shape.pos[i * 3 + 1], lz = shape.pos[i * 3 + 2];
      var gx = 0, gy = 0, gz = 0;
      if (animal.kind === 'run') {
        var g = t * animal.gait;
        gx += Math.sin(g + shape.phase[i]) * shape.leg[i] * 0.42;
        gy += Math.abs(Math.cos(g + shape.phase[i])) * shape.leg[i] * 0.14;
        gy += Math.sin(g) * animal.bob * 0.35 * (1 - shape.leg[i]);   // body bob
        if (animal.undulate) {
          gy += Math.sin(g * 0.8 + lx * 2.0) * 0.16 * (1 - shape.leg[i]);
        }
      } else {
        var f = t * animal.flap;
        gy += Math.sin(f) * shape.wing[i] * 0.75;
        gz += Math.cos(f) * shape.wing[i] * 0.22 * (shape.phase[i] > 1 ? 1 : -1);
        gy += Math.sin(f + Math.PI) * 0.1;                            // body counter-bob
      }
      // ghostly shimmer
      var s = seed[i] * 6.28;
      gx += Math.sin(t * 2.3 + s) * 0.03;
      gy += Math.cos(t * 1.9 + s * 1.3) * 0.03;
      gz += Math.sin(t * 2.7 + s * 0.7) * 0.03;
      gaitOut.x = lx + gx; gaitOut.y = ly + gy; gaitOut.z = lz + gz;
      return gaitOut;
    }

    P.cast = function (a) {
      if (P.active) return false;
      animal = a;
      shape = ANIMALS.samplePoints(a, N);
      path = buildPath(a);
      runEnd = T_FORM_END + Math.min(17, Math.max(11, path.getLength() / a.speed));
      fadeEnd = runEnd + 3.6;
      castT = 0;
      haveFace = false;
      bank = 0;
      offset.x = 0; offset.z = 0;
      desired.x = 0; desired.z = 0;
      P.active = true;
      P.phase = 'charge';
      P.onPhase('charge');
      AudioSys.intake();

      var tip = P.getWandTip();
      formCenter.set(2, groundH + (a.kind === 'fly' ? 0 : 0.9), 2);
      for (var i = 0; i < N; i++) {
        cur[i * 3] = tip.x; cur[i * 3 + 1] = tip.y; cur[i * 3 + 2] = tip.z;
        vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
      }
      for (i = 0; i < M; i++) { tLife[i] = 0; tCol[i * 3] = tCol[i * 3 + 1] = tCol[i * 3 + 2] = 0; }
      points.visible = true;
      trail.visible = true;
      light.position.copy(tip);
      light.intensity = 0;
      return true;
    };

    // Absolute normalized pointer position (-1..1) — steers the running/flying
    // Patronus sideways/forward off its base path, the way Leviosa's setPointer
    // steers a lifted object.
    P.setPointer = function (px, py) {
      desired.x = Math.max(-1, Math.min(1, px)) * DRIFT_MAX;
      desired.z = Math.max(-1, Math.min(1, py)) * DRIFT_MAX;
    };

    function spawnTrail(count, dt) {
      for (var k = 0; k < count; k++) {
        var i = (Math.random() * N) | 0;
        var j = tCursor;
        tCursor = (tCursor + 1) % M;
        tPos[j * 3] = cur[i * 3];
        tPos[j * 3 + 1] = cur[i * 3 + 1];
        tPos[j * 3 + 2] = cur[i * 3 + 2];
        tVel[j * 3] = (Math.random() - 0.5) * 0.5;
        tVel[j * 3 + 1] = 0.2 + Math.random() * 0.5;
        tVel[j * 3 + 2] = (Math.random() - 0.5) * 0.5;
        tLife[j] = 1;
      }
    }

    function updateTrail(dt, env) {
      for (var j = 0; j < M; j++) {
        if (tLife[j] <= 0) continue;
        tLife[j] -= dt / 2.1;
        if (tLife[j] < 0) tLife[j] = 0;
        tPos[j * 3] += tVel[j * 3] * dt;
        tPos[j * 3 + 1] += tVel[j * 3 + 1] * dt;
        tPos[j * 3 + 2] += tVel[j * 3 + 2] * dt;
        var e = tLife[j] * tLife[j] * env;
        tCol[j * 3] = 0.55 * e;
        tCol[j * 3 + 1] = 0.75 * e;
        tCol[j * 3 + 2] = 1.0 * e;
      }
      tGeo.attributes.position.needsUpdate = true;
      tGeo.attributes.color.needsUpdate = true;
    }

    function finish() {
      P.active = false;
      P.phase = null;
      P.intensity = 0;
      points.visible = false;
      trail.visible = false;
      light.intensity = 0;
      if (runSound) { runSound.stop(); runSound = null; }
      P.onPhase('done');
    }

    P.update = function (t, dt) {
      if (!P.active) return;
      castT += dt;
      var i, e;

      // ----- phase transitions -----
      if (P.phase === 'charge' && castT >= T_BURST) {
        P.phase = 'burst';
        P.onPhase('burst');
        AudioSys.sparkBurst();
        buildupHandle = AudioSys.buildup(T_FORM_END - T_BURST - 0.6);
        var tip = P.getWandTip();
        for (i = 0; i < N; i++) {
          cur[i * 3] = tip.x; cur[i * 3 + 1] = tip.y; cur[i * 3 + 2] = tip.z;
          var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
          var sp = 2.5 + Math.random() * 6.5;
          vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
          vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.8 + 1.5;
          vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
        }
      } else if (P.phase === 'burst' && castT >= T_SWIRL_END) {
        P.phase = 'form';
        P.onPhase('form');
      } else if (P.phase === 'form' && castT >= T_FORM_END) {
        P.phase = 'run';
        P.onPhase('run');
        if (buildupHandle) { buildupHandle.release(); buildupHandle = null; }
        AudioSys.formationChime();
        runSound = AudioSys.animalLoop(animal);
      } else if (P.phase === 'run' && castT >= runEnd) {
        P.phase = 'fade';
        P.onPhase('fade');
        if (runSound) { runSound.stop(); runSound = null; }
        for (i = 0; i < N; i++) {
          vel[i * 3] = (Math.random() - 0.5) * 0.7;
          vel[i * 3 + 1] = 0.25 + Math.random() * 0.9;
          vel[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
        }
      } else if (P.phase === 'fade' && castT >= fadeEnd) {
        finish();
        return;
      }

      // ----- envelopes -----
      var env = 1;
      if (P.phase === 'charge') env = castT / T_BURST * 0.4;
      else if (P.phase === 'burst') env = 0.65;
      else if (P.phase === 'form') env = 0.65 + smooth(T_SWIRL_END, T_FORM_END, castT) * 0.35;
      else if (P.phase === 'fade') env = 1 - smooth(runEnd, fadeEnd, castT);
      P.intensity = env * (P.phase === 'charge' ? 0.3 : 1);

      // ----- motion -----
      var tip2 = P.getWandTip();
      if (P.phase === 'charge') {
        // a tight jittering spark at the wand tip
        for (i = 0; i < N; i++) {
          var r = 0.04 + seed[i] * 0.12 * (castT / T_BURST);
          var a1 = t * (3 + seed[i] * 9) + seed[i] * 40;
          cur[i * 3] = tip2.x + Math.cos(a1) * r;
          cur[i * 3 + 1] = tip2.y + Math.sin(a1 * 1.3) * r;
          cur[i * 3 + 2] = tip2.z + Math.sin(a1) * r;
        }
        light.position.copy(tip2);
        light.intensity = 0.6 * castT / T_BURST;

      } else if (P.phase === 'burst') {
        // fly out, then get caught in a vortex around the formation center
        var swirlPull = smooth(T_BURST + 0.4, T_SWIRL_END, castT);
        for (i = 0; i < N; i++) {
          var px = cur[i * 3], py = cur[i * 3 + 1], pz = cur[i * 3 + 2];
          var dx = formCenter.x - px, dy = formCenter.y - py, dz = formCenter.z - pz;
          var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
          // tangential swirl around vertical axis through center
          var tx = -dz, tz = dx;
          var tl = Math.sqrt(tx * tx + tz * tz) + 0.001;
          vel[i * 3] += (dx / dist * 7 * swirlPull + tx / tl * 9 * swirlPull) * dt;
          vel[i * 3 + 1] += (dy / dist * 7 * swirlPull) * dt - 2.2 * (1 - swirlPull) * dt;
          vel[i * 3 + 2] += (dz / dist * 7 * swirlPull + tz / tl * 9 * swirlPull) * dt;
          var damp = 1 - Math.min(1, dt * (0.6 + swirlPull * 1.6));
          vel[i * 3] *= damp; vel[i * 3 + 1] *= damp; vel[i * 3 + 2] *= damp;
          cur[i * 3] += vel[i * 3] * dt;
          cur[i * 3 + 1] += vel[i * 3 + 1] * dt;
          cur[i * 3 + 2] += vel[i * 3 + 2] * dt;
          if (cur[i * 3 + 1] < 0.05) { cur[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.4; }
        }
        light.position.lerpVectors(tip2, formCenter, swirlPull);
        light.intensity = 0.6 + swirlPull * 1.2;
        spawnTrail(Q.trailRate * 0.4 * dt * 60 | 0, dt);

      } else if (P.phase === 'form' || P.phase === 'run') {
        var u, tangentT;
        if (P.phase === 'form') { u = 0.0001; }
        else { u = runU((castT - T_FORM_END) / (runEnd - T_FORM_END)); }
        var driftF = 1 - Math.exp(-dt * 1.6);
        offset.x += (desired.x - offset.x) * driftF;
        offset.z += (desired.z - offset.z) * driftF;

        path.getPointAt(Math.min(u, 0.999), v1);       // origin
        v1.x += offset.x; v1.z += offset.z;             // mouse-steered drift off the base path
        path.getTangentAt(Math.min(u, 0.999), v2);     // facing
        v2.y *= 0.35; v2.normalize();
        quat.setFromUnitVectors(FWD, v2);
        // Ease into the heading rather than snapping to the tangent, and lean
        // into the turn — a body carries momentum through a corner.
        if (!haveFace) { faceQuat.copy(quat); haveFace = true; }
        else {
          var before = v3.copy(FWD).applyQuaternion(faceQuat);
          faceQuat.slerp(quat, 1 - Math.exp(-dt * 1.9));
          var after = v3.copy(FWD).applyQuaternion(faceQuat);
          var turn = (before.x * after.z - before.z * after.x) / Math.max(dt, 1e-4);
          bank += (Math.max(-0.5, Math.min(0.5, turn * 1.4)) - bank) * (1 - Math.exp(-dt * 2.2));
        }
        bankQuat.setFromAxisAngle(FWD, bank);
        quat.copy(faceQuat).multiply(bankQuat);
        P.pos.copy(v1);

        var formK = P.phase === 'form' ? smooth(T_SWIRL_END, T_FORM_END - 0.4, castT) : 1;
        var springBase = P.phase === 'form' ? (1.5 + formK * 8) : 12;
        for (i = 0; i < N; i++) {
          var g2 = gait(i, castT);
          v3.set(g2.x, g2.y, g2.z).applyQuaternion(quat).add(v1);
          // staggered arrival while forming
          var k = springBase * (P.phase === 'form' ? (0.4 + seed[i] * 0.9) : 1);
          var f = 1 - Math.exp(-k * dt);
          cur[i * 3] += (v3.x - cur[i * 3]) * f;
          cur[i * 3 + 1] += (v3.y - cur[i * 3 + 1]) * f;
          cur[i * 3 + 2] += (v3.z - cur[i * 3 + 2]) * f;
        }
        light.position.copy(v1).add(new THREE.Vector3(0, 0.6, 0));
        var flicker = 1 + Math.sin(t * 13.7) * 0.08 + Math.sin(t * 29.3) * 0.05;
        light.intensity = (P.phase === 'form' ? 1.8 + formK * 1.0 : 2.9) * flicker;
        spawnTrail((P.phase === 'run' ? Q.trailRate : Q.trailRate * 0.5) * dt * 60 | 0, dt);

      } else if (P.phase === 'fade') {
        for (i = 0; i < N; i++) {
          cur[i * 3] += vel[i * 3] * dt;
          cur[i * 3 + 1] += vel[i * 3 + 1] * dt;
          cur[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
        light.intensity = 2.9 * env * env;
      }

      // ----- colors -----
      var tw;
      for (i = 0; i < N; i++) {
        tw = env * (0.75 + 0.25 * Math.sin(t * 6 + seed[i] * 31));
        col[i * 3] = baseCol[i * 3] * tw;
        col[i * 3 + 1] = baseCol[i * 3 + 1] * tw;
        col[i * 3 + 2] = baseCol[i * 3 + 2] * tw;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      updateTrail(dt, Math.max(env, 0.15));
    };

    return P;
  }

  window.Patronus = { create: create };
})();
