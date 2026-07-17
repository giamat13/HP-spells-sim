/* Accio: the Summoning Charm. Finds the nearest liftable object out in the
   distance (rock, shrub, fallen log, mushroom, or flower), pulls it through
   the air in an arcing flight to hover just in front of the player, holds it
   there for a moment, then eases it down onto the ground where it lands.
   Mirrors leviosa.js's object model but flies the object to the player
   instead of lifting it in place.
   Global: Accio */
(function () {
  'use strict';

  var FLY_TIME = 1.0, HOLD_TIME = 2.0, DROP_TIME = 0.55;
  var ARC_HEIGHT = 2.4, MAX_RANGE = 22, MIN_RANGE = 1.4;
  var HOLD_DIST = 1.3, HOLD_DROP = 0.55, GLOW_COUNT = 40;

  function create(scene, forest) {
    var glowGeo = new THREE.BufferGeometry();
    var gPos = new Float32Array(GLOW_COUNT * 3);
    var gCol = new Float32Array(GLOW_COUNT * 3);
    var gSeed = new Float32Array(GLOW_COUNT);
    for (var i = 0; i < GLOW_COUNT; i++) gSeed[i] = Math.random() * Math.PI * 2;
    glowGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    glowGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
    var glowPoints = new THREE.Points(glowGeo, new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(225,240,255,1)', 'rgba(140,190,255,0.55)'),
      size: 0.09, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glowPoints.visible = false;
    glowPoints.frustumCulled = false;
    scene.add(glowPoints);

    var glowLight = new THREE.PointLight(0x9fc8ff, 0, 6, 2);
    scene.add(glowLight);

    var A = {
      active: false,
      phase: null,
      zombies: null, // set from main.js: lets Accio also summon a nearby enemy
      onPhase: function () {},
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    var target = null, targetKind = null, phaseT = 0;
    var basePos = new THREE.Vector3(), curPos = new THREE.Vector3(), curQuat = new THREE.Quaternion();
    var spinQuat = new THREE.Quaternion(), upAxis = new THREE.Vector3(0, 1, 0);
    var toObj = new THREE.Vector3(), flatDir = new THREE.Vector3(), holdPoint = new THREE.Vector3();
    var dropAnchor = new THREE.Vector3();

    function findFarthestInView() {
      var pose = A.getCameraPose();
      var best = null, bestScore = -Infinity, bestKind = null;
      for (var i = 0; i < forest.liftables.length; i++) {
        var it = forest.liftables[i];
        toObj.copy(it.basePos).sub(pose.pos);
        var dist = toObj.length();
        if (dist > MAX_RANGE || dist < MIN_RANGE) continue;
        toObj.normalize();
        var facing = toObj.dot(pose.dir);
        if (facing < 0.35) continue;                 // must be roughly in view
        var score = facing * 2 + dist * 0.04;         // prefer farther, centered objects
        if (score > bestScore) { bestScore = score; best = it; bestKind = 'liftable'; }
      }
      // Enemies are candidates too, scored the same way as liftables, so
      // Accio can also summon a zombie into striking range.
      var zlist = A.zombies && A.zombies.list;
      window.__accioDebug = { hasAzombies: !!A.zombies, zlistLen: zlist ? zlist.length : null };
      if (zlist) {
        for (var j = 0; j < zlist.length; j++) {
          var z = zlist[j];
          if (!z.alive || z.pulled) continue;
          toObj.copy(z.pos).sub(pose.pos);
          var zdist = toObj.length();
          if (zdist > MAX_RANGE || zdist < MIN_RANGE) continue;
          toObj.normalize();
          var zfacing = toObj.dot(pose.dir);
          if (zfacing < 0.35) continue;
          var zscore = zfacing * 2 + zdist * 0.04;
          if (zscore > bestScore) { bestScore = zscore; best = z; bestKind = 'zombie'; }
        }
      }
      targetKind = bestKind;
      return best;
    }

    function computeHoldPoint(pose, out) {
      flatDir.set(pose.dir.x, 0, pose.dir.z);
      if (flatDir.lengthSq() < 1e-6) flatDir.set(0, 0, -1); else flatDir.normalize();
      out.set(pose.pos.x + flatDir.x * HOLD_DIST, pose.pos.y - HOLD_DROP, pose.pos.z + flatDir.z * HOLD_DIST);
      return out;
    }

    A.cast = function () {
      if (A.active) return false;
      var found = findFarthestInView();
      if (!found) { A.onPhase('none'); return false; }
      target = found;
      if (targetKind === 'zombie') {
        basePos.copy(target.pos);
        curQuat.identity();
        target.pulled = true;
      } else {
        basePos.copy(target.basePos);
        curQuat.copy(target.baseQuat);
      }
      phaseT = 0;
      A.active = true;
      A.phase = 'fly';
      A.onPhase('fly');
      glowPoints.visible = true;
      return true;
    };

    function finish() {
      A.active = false;
      A.phase = null;
      glowPoints.visible = false;
      glowLight.intensity = 0;
      if (targetKind === 'zombie' && target) target.pulled = false;
      target = null;
      A.onPhase('done');
    }

    A.update = function (t, dt) {
      if (!A.active) return;
      phaseT += dt;
      var pose = A.getCameraPose();
      computeHoldPoint(pose, holdPoint);

      // A pulled enemy is simply yanked to the hold point and released — it
      // has its own ground-height/AI logic (zombies.js) to land back into,
      // unlike an inert object there's no hover/drop for it to sit through.
      if (targetKind === 'zombie') {
        if (phaseT >= FLY_TIME) { finish(); return; }
        var fz = phaseT / FLY_TIME;
        var efz = fz * fz * (3 - 2 * fz);
        curPos.lerpVectors(basePos, holdPoint, efz);
        target.pos.copy(curPos);
      } else {
        if (A.phase === 'fly' && phaseT >= FLY_TIME) {
          phaseT = 0; A.phase = 'hold'; A.onPhase('hold');
        } else if (A.phase === 'hold' && phaseT >= HOLD_TIME) {
          phaseT = 0; A.phase = 'drop';
          dropAnchor.copy(curPos);
          A.onPhase('drop');
        } else if (A.phase === 'drop' && phaseT >= DROP_TIME) {
          curPos.set(dropAnchor.x, target.basePos.y, dropAnchor.z);
          forest.setLiftableTransform(target, curPos, curQuat);
          finish();
          return;
        }

        if (A.phase === 'fly') {
          var f = phaseT / FLY_TIME;
          var ef = f * f * (3 - 2 * f);
          curPos.lerpVectors(basePos, holdPoint, ef);
          curPos.y += Math.sin(Math.PI * f) * ARC_HEIGHT;
          spinQuat.setFromAxisAngle(upAxis, f * Math.PI * 2.4);
          curQuat.copy(target.baseQuat).multiply(spinQuat);
        } else if (A.phase === 'hold') {
          var bob = Math.sin(t * 2.4) * 0.05;
          curPos.set(holdPoint.x, holdPoint.y + bob, holdPoint.z);
          spinQuat.setFromAxisAngle(upAxis, t * 1.3);
          curQuat.copy(target.baseQuat).multiply(spinQuat);
        } else if (A.phase === 'drop') {
          var d = phaseT / DROP_TIME;
          var ed = d * d * (3 - 2 * d);
          curPos.set(dropAnchor.x, dropAnchor.y + (target.basePos.y - dropAnchor.y) * ed, dropAnchor.z);
          curQuat.copy(target.baseQuat);
        }

        forest.setLiftableTransform(target, curPos, curQuat);
      }

      glowLight.position.copy(curPos);
      var glowH = (targetKind !== 'zombie' && A.phase === 'drop') ? (1 - phaseT / DROP_TIME) : 1;
      glowLight.intensity = 1.3 * glowH;
      for (var i = 0; i < GLOW_COUNT; i++) {
        var a = t * 1.4 + gSeed[i];
        var trail = (targetKind === 'zombie' || A.phase === 'fly') ? 0.55 : 0.3;
        var r = 0.22 + trail * (0.5 + 0.5 * Math.sin(t * 0.9 + gSeed[i] * 3));
        gPos[i * 3] = curPos.x + Math.cos(a) * r;
        gPos[i * 3 + 1] = curPos.y + ((gSeed[i] + t * 0.4) % 1 - 0.5) * 0.5;
        gPos[i * 3 + 2] = curPos.z + Math.sin(a) * r;
        var e = glowH * (0.5 + 0.5 * Math.sin(t * 4.5 + gSeed[i] * 5));
        gCol[i * 3] = 0.62 * e; gCol[i * 3 + 1] = 0.82 * e; gCol[i * 3 + 2] = 1.0 * e;
      }
      glowGeo.attributes.position.needsUpdate = true;
      glowGeo.attributes.color.needsUpdate = true;
    };

    return A;
  }

  window.Accio = { create: create };
})();
