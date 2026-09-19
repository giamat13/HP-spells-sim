/* Depulso: the Banishing Charm. Shoves the nearest liftable object (rock,
   shrub, fallen log, mushroom, or flower) away from the caster. If an enemy
   is close to that object, the shove redirects into the enemy instead of
   flying straight out — and if the object is a shrub currently burning
   (Incendio's fire is on it), the enemy takes a burst of fire damage on impact.
   Mirrors accio.js's object model but flings the object away instead of
   pulling it in.
   Global: Depulso */
(function () {
  'use strict';

  var PUSH_TIME = 0.55, ARC_HEIGHT = 1.6;
  var MAX_RANGE = 10, MIN_RANGE = 1.0, PUSH_DIST = 6;
  var ENEMY_SEEK_RADIUS = 7, BURN_HIT_RADIUS = 1.6, BURN_HIT_DAMAGE = 40;
  var GLOW_COUNT = 30;

  function create(scene, forest) {
    var glowGeo = new THREE.BufferGeometry();
    var gPos = new Float32Array(GLOW_COUNT * 3);
    var gCol = new Float32Array(GLOW_COUNT * 3);
    var gSeed = new Float32Array(GLOW_COUNT);
    for (var i = 0; i < GLOW_COUNT; i++) gSeed[i] = Math.random() * Math.PI * 2;
    glowGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    glowGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
    var glowPoints = new THREE.Points(glowGeo, new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(255,235,215,1)', 'rgba(255,150,60,0.55)'),
      size: 0.09, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glowPoints.visible = false;
    glowPoints.frustumCulled = false;
    scene.add(glowPoints);

    var glowLight = new THREE.PointLight(0xffb96a, 0, 7, 2);
    scene.add(glowLight);

    var D = {
      active: false,
      phase: null,
      zombies: null,   // set from main.js: lets a push redirect into a nearby enemy
      incendio: null,  // set from main.js: lets a burning shrub deal fire damage
      onPhase: function () {},
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    var target = null, phaseT = 0, hitZombie = false, burning = false;
    var basePos = new THREE.Vector3(), destPos = new THREE.Vector3();
    var curPos = new THREE.Vector3(), curQuat = new THREE.Quaternion();
    var spinQuat = new THREE.Quaternion(), upAxis = new THREE.Vector3(0, 1, 0);
    var toObj = new THREE.Vector3(), flatDir = new THREE.Vector3();

    function findNearestInView() {
      var pose = D.getCameraPose();
      var best = null, bestScore = -Infinity;
      for (var i = 0; i < forest.liftables.length; i++) {
        var it = forest.liftables[i];
        toObj.copy(it.basePos).sub(pose.pos);
        var dist = toObj.length();
        if (dist > MAX_RANGE || dist < MIN_RANGE) continue;
        toObj.normalize();
        var facing = toObj.dot(pose.dir);
        if (facing < 0.35) continue;
        var score = facing * 2 - dist * 0.08;   // prefer close, centered objects
        if (score > bestScore) { bestScore = score; best = it; }
      }
      return best;
    }

    D.cast = function () {
      if (D.active) return false;
      var found = findNearestInView();
      if (!found) { D.onPhase('none'); return false; }
      target = found;
      basePos.copy(target.basePos);
      curPos.copy(basePos);
      curQuat.copy(target.baseQuat);

      var pose = D.getCameraPose();
      flatDir.set(pose.dir.x, 0, pose.dir.z);
      if (flatDir.lengthSq() < 1e-6) flatDir.set(0, 0, -1); else flatDir.normalize();
      destPos.copy(basePos).addScaledVector(flatDir, PUSH_DIST);

      hitZombie = false;
      var enemy = D.zombies && D.zombies.findNearestAlive ?
        D.zombies.findNearestAlive(basePos, ENEMY_SEEK_RADIUS) : null;
      if (enemy) { destPos.copy(enemy.pos); hitZombie = true; }

      burning = target.label === 'shrub' && D.incendio && D.incendio.active &&
        D.incendio.phase !== 'fade' && D.incendio.pos.distanceTo(basePos) < 0.6;

      phaseT = 0;
      D.active = true;
      D.phase = 'push';
      D.onPhase('push');
      glowPoints.visible = true;
      return true;
    };

    function finish() {
      D.active = false;
      D.phase = null;
      glowPoints.visible = false;
      glowLight.intensity = 0;
      target = null;
      D.onPhase('done');
    }

    D.update = function (t, dt) {
      if (!D.active) return;
      phaseT += dt;

      if (phaseT >= PUSH_TIME) {
        curPos.copy(destPos);
        curPos.y = forest.groundHeightAt ? forest.groundHeightAt(destPos.x, destPos.z) : target.basePos.y;
        forest.setLiftableTransform(target, curPos, curQuat);
        if (hitZombie && burning) {
          D.zombies.damageNearest(curPos, BURN_HIT_RADIUS, BURN_HIT_DAMAGE);
          D.onPhase('burnHit');
        }
        finish();
        return;
      }

      var f = phaseT / PUSH_TIME;
      var ef = f * f * (3 - 2 * f);
      curPos.lerpVectors(basePos, destPos, ef);
      curPos.y += Math.sin(Math.PI * f) * ARC_HEIGHT;
      spinQuat.setFromAxisAngle(upAxis, f * Math.PI * 3.2);
      curQuat.copy(target.baseQuat).multiply(spinQuat);
      forest.setLiftableTransform(target, curPos, curQuat);

      glowLight.position.copy(curPos);
      glowLight.intensity = 1.2 * (1 - f * 0.3);
      for (var i = 0; i < GLOW_COUNT; i++) {
        var a = t * 1.6 + gSeed[i];
        var r = 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.9 + gSeed[i] * 3));
        gPos[i * 3] = curPos.x + Math.cos(a) * r;
        gPos[i * 3 + 1] = curPos.y + ((gSeed[i] + t * 0.4) % 1 - 0.5) * 0.5;
        gPos[i * 3 + 2] = curPos.z + Math.sin(a) * r;
        var e = 0.5 + 0.5 * Math.sin(t * 4.5 + gSeed[i] * 5);
        gCol[i * 3] = 1.0 * e; gCol[i * 3 + 1] = 0.72 * e; gCol[i * 3 + 2] = 0.42 * e;
      }
      glowGeo.attributes.position.needsUpdate = true;
      glowGeo.attributes.color.needsUpdate = true;
    };

    return D;
  }

  window.Depulso = { create: create };
})();
