/* Wingardium Leviosa: finds the nearest liftable object in view (rock, shrub,
   fallen log, mushroom, or flower), lifts it into a gentle hover, lets the
   player guide it with the mouse for a few seconds, then eases it back down
   wherever it was left.
   Global: Leviosa */
(function () {
  'use strict';

  var RISE_TIME = 0.7, HOVER_TIME = 6.0, DESCEND_TIME = 0.9;
  var HOVER_HEIGHT = 1.6, MAX_RANGE = 15, DRIFT_MAX = 2.4;
  var GLOW_COUNT = 46;

  function create(scene, forest) {
    var glowGeo = new THREE.BufferGeometry();
    var gPos = new Float32Array(GLOW_COUNT * 3);
    var gCol = new Float32Array(GLOW_COUNT * 3);
    var gSeed = new Float32Array(GLOW_COUNT);
    for (var i = 0; i < GLOW_COUNT; i++) gSeed[i] = Math.random() * Math.PI * 2;
    glowGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    glowGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
    var glowPoints = new THREE.Points(glowGeo, new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(230,255,240,1)', 'rgba(150,230,190,0.5)'),
      size: 0.09, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glowPoints.visible = false;
    glowPoints.frustumCulled = false;
    scene.add(glowPoints);

    var glowLight = new THREE.PointLight(0x9fffce, 0, 6, 2);
    scene.add(glowLight);

    var L = {
      active: false,
      phase: null,
      onPhase: function () {},
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    var target = null, phaseT = 0;
    var basePos = new THREE.Vector3(), curPos = new THREE.Vector3(), curQuat = new THREE.Quaternion();
    var spinQuat = new THREE.Quaternion(), upAxis = new THREE.Vector3(0, 1, 0);
    var offset = { x: 0, z: 0 }, desired = { x: 0, z: 0 };
    var toObj = new THREE.Vector3();

    function findNearest() {
      var pose = L.getCameraPose();
      var best = null, bestScore = -Infinity;
      for (var i = 0; i < forest.liftables.length; i++) {
        var it = forest.liftables[i];
        toObj.copy(it.basePos).sub(pose.pos);
        var dist = toObj.length();
        if (dist > MAX_RANGE || dist < 0.01) continue;
        toObj.normalize();
        var facing = toObj.dot(pose.dir);          // 1 = dead-center, -1 = behind
        if (facing < 0.25 && dist > 4) continue;   // ignore off-view unless very close
        var score = facing * 3 - dist * 0.12;
        if (score > bestScore) { bestScore = score; best = it; }
      }
      return best;
    }

    L.cast = function () {
      if (L.active) return false;
      var found = findNearest();
      if (!found) { L.onPhase('none'); return false; }
      target = found;
      basePos.copy(target.basePos);
      curQuat.copy(target.baseQuat);
      offset.x = 0; offset.z = 0;
      desired.x = 0; desired.z = 0;
      phaseT = 0;
      L.active = true;
      L.phase = 'rise';
      L.onPhase('rise');
      glowPoints.visible = true;
      return true;
    };

    // Relative drag deltas (from a pointer-locked mousemove) while hovering.
    L.nudge = function (dx, dy) {
      if (L.phase !== 'hover') return;
      offset.x += dx * 0.01;
      offset.z += dy * 0.01;
      var m = Math.hypot(offset.x, offset.z);
      if (m > DRIFT_MAX) { offset.x *= DRIFT_MAX / m; offset.z *= DRIFT_MAX / m; }
      desired.x = offset.x; desired.z = offset.z;
    };

    // Absolute normalized pointer position (-1..1), used when not pointer-locked.
    L.setPointer = function (px, py) {
      desired.x = Math.max(-1, Math.min(1, px)) * DRIFT_MAX;
      desired.z = Math.max(-1, Math.min(1, -py)) * DRIFT_MAX;
    };

    function finish() {
      L.active = false;
      L.phase = null;
      glowPoints.visible = false;
      glowLight.intensity = 0;
      target = null;
      L.onPhase('done');
    }

    L.update = function (t, dt) {
      if (!L.active) return;
      phaseT += dt;

      if (L.phase === 'rise' && phaseT >= RISE_TIME) {
        phaseT = 0; L.phase = 'hover'; L.onPhase('hover');
      } else if (L.phase === 'hover' && phaseT >= HOVER_TIME) {
        phaseT = 0; L.phase = 'descend'; L.onPhase('descend');
      } else if (L.phase === 'descend' && phaseT >= DESCEND_TIME) {
        curPos.set(basePos.x + offset.x, target.basePos.y, basePos.z + offset.z);
        forest.setLiftableTransform(target, curPos, curQuat);
        finish();
        return;
      }

      if (L.phase === 'hover') {
        var f = 1 - Math.exp(-dt * 6);
        offset.x += (desired.x - offset.x) * f;
        offset.z += (desired.z - offset.z) * f;
      }

      var height;
      if (L.phase === 'rise') height = phaseT / RISE_TIME;
      else if (L.phase === 'descend') height = 1 - phaseT / DESCEND_TIME;
      else height = 1;
      height = height * height * (3 - 2 * height);

      var bob = L.phase === 'hover' ? Math.sin(t * 1.6) * 0.08 * height : 0;
      curPos.set(
        basePos.x + offset.x * height,
        basePos.y + HOVER_HEIGHT * height + bob,
        basePos.z + offset.z * height
      );
      curQuat.copy(target.baseQuat);
      if (L.phase === 'hover') {
        spinQuat.setFromAxisAngle(upAxis, t * 0.3);
        curQuat.multiply(spinQuat);
      }
      forest.setLiftableTransform(target, curPos, curQuat);

      glowLight.position.copy(curPos);
      glowLight.intensity = 1.4 * height;
      for (var i = 0; i < GLOW_COUNT; i++) {
        var a = t * 1.1 + gSeed[i];
        var r = 0.35 + 0.25 * Math.sin(t * 0.7 + gSeed[i] * 3);
        gPos[i * 3] = curPos.x + Math.cos(a) * r;
        gPos[i * 3 + 1] = curPos.y - 0.3 + ((gSeed[i] + t * 0.3) % 1) * 1.1;
        gPos[i * 3 + 2] = curPos.z + Math.sin(a) * r;
        var e = height * (0.5 + 0.5 * Math.sin(t * 4 + gSeed[i] * 5));
        gCol[i * 3] = 0.6 * e; gCol[i * 3 + 1] = 1.0 * e; gCol[i * 3 + 2] = 0.75 * e;
      }
      glowGeo.attributes.position.needsUpdate = true;
      glowGeo.attributes.color.needsUpdate = true;
    };

    return L;
  }

  window.Leviosa = { create: create };
})();
