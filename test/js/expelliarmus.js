/* Expelliarmus: the Disarming Charm. A bolt of scarlet light from the wand
   tip to the nearest enemy, knocking the wand from its hand so it can no
   longer fire curses. No cooldown — cast it as fast as you like.
   Mirrors avada.js's beam, but disarms instead of killing.
   Global: Expelliarmus */
(function () {
  'use strict';

  var RANGE = 45, BEAM_TIME = 0.16, FADE_TIME = 0.3;

  function create(scene, zombies) {
    var coreMat = new THREE.MeshBasicMaterial({
      color: 0xff4d3a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var glowMat = new THREE.MeshBasicMaterial({
      color: 0x8a1f14, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true), coreMat);
    var glow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true), glowMat);
    core.visible = false; glow.visible = false;
    scene.add(core, glow);

    var impact = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,210,190,1)', 'rgba(220,60,40,0.7)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
    }));
    impact.visible = false;
    scene.add(impact);

    var E = {
      active: false,
      phase: null,
      onPhase: function () {},
      getWandTip: function () { return new THREE.Vector3(); },
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    var from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3();
    var up = new THREE.Vector3(0, 1, 0), quat = new THREE.Quaternion();
    var phaseT = 0;

    E.cast = function () {
      // No lock: casting again just re-aims and re-fires immediately.
      var pose = E.getCameraPose();
      var target = zombies.disarmNearest(pose.pos, RANGE, pose.dir);
      if (!target) { E.onPhase('none'); return false; }

      from.copy(E.getWandTip());
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
      E.active = true;
      E.phase = 'beam';
      core.visible = glow.visible = impact.visible = true;
      coreMat.opacity = 1;
      glowMat.opacity = 0.55;
      impact.material.opacity = 1;
      E.onPhase('cast');
      return true;
    };

    function finish() {
      E.active = false;
      E.phase = null;
      core.visible = glow.visible = impact.visible = false;
      E.onPhase('done');
    }

    E.update = function (t, dt) {
      if (!E.active) return;
      phaseT += dt;
      if (E.phase === 'beam' && phaseT >= BEAM_TIME) {
        phaseT = 0; E.phase = 'fade'; E.onPhase('fade');
      } else if (E.phase === 'fade' && phaseT >= FADE_TIME) {
        finish();
        return;
      }
      if (E.phase === 'beam') {
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

    return E;
  }

  window.Expelliarmus = { create: create };
})();
