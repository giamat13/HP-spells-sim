/* Avada Kedavra: a bolt of green light from the wand tip to the nearest
   enemy, killing it instantly. No cooldown — cast it as fast as you like.
   Global: Avada */
(function () {
  'use strict';

  var RANGE = 45, BEAM_TIME = 0.16, FADE_TIME = 0.3;

  function create(scene, zombies) {
    var coreMat = new THREE.MeshBasicMaterial({
      color: 0x66ff5a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var glowMat = new THREE.MeshBasicMaterial({
      color: 0x1f8a1a, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true), coreMat);
    var glow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true), glowMat);
    core.visible = false; glow.visible = false;
    scene.add(core, glow);

    var impact = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(210,255,190,1)', 'rgba(60,220,60,0.7)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
    }));
    impact.visible = false;
    scene.add(impact);

    var A = {
      active: false,
      phase: null,
      onPhase: function () {},
      getWandTip: function () { return new THREE.Vector3(); },
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    var from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3();
    var up = new THREE.Vector3(0, 1, 0), quat = new THREE.Quaternion();
    var phaseT = 0;

    A.cast = function () {
      // No lock: casting again just re-aims and re-fires immediately.
      var target = zombies.killNearest(A.getCameraPose().pos, RANGE);
      if (!target) { A.onPhase('none'); return false; }

      from.copy(A.getWandTip());
      to.copy(target);
      dir.subVectors(to, from);
      var len = Math.max(0.01, dir.length());
      dir.normalize();
      quat.setFromUnitVectors(up, dir);

      core.quaternion.copy(quat);
      glow.quaternion.copy(quat);
      core.position.copy(from).lerp(to, 0.5);
      glow.position.copy(core.position);
      core.scale.set(0.035, len, 0.035);
      glow.scale.set(0.11, len, 0.11);

      impact.position.copy(to);
      impact.scale.set(1.4, 1.4, 1);

      phaseT = 0;
      A.active = true;
      A.phase = 'beam';
      core.visible = glow.visible = impact.visible = true;
      coreMat.opacity = 1;
      glowMat.opacity = 0.55;
      impact.material.opacity = 1;
      A.onPhase('cast');
      return true;
    };

    function finish() {
      A.active = false;
      A.phase = null;
      core.visible = glow.visible = impact.visible = false;
      A.onPhase('done');
    }

    A.update = function (t, dt) {
      if (!A.active) return;
      phaseT += dt;
      if (A.phase === 'beam' && phaseT >= BEAM_TIME) {
        phaseT = 0; A.phase = 'fade'; A.onPhase('fade');
      } else if (A.phase === 'fade' && phaseT >= FADE_TIME) {
        finish();
        return;
      }
      if (A.phase === 'beam') {
        coreMat.opacity = 1;
        glowMat.opacity = 0.55;
        impact.material.opacity = 1;
      } else {
        var f = 1 - phaseT / FADE_TIME;
        coreMat.opacity = f;
        glowMat.opacity = f * 0.55;
        impact.material.opacity = f;
        impact.scale.setScalar(1.4 + (1 - f) * 1.6);
      }
    };

    return A;
  }

  window.Avada = { create: create };
})();
