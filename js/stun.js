/* Stupefy and Petrificus Totalus: two stunning charms sharing the same beam
   mechanics as Expelliarmus (see expelliarmus.js) — a bolt from the wand tip
   to the nearest enemy, but knocking the target down instead of disarming it.
   Stupefy drops them flat; Petrificus Totalus freezes them stiff, arms out
   in a T-pose (Zombies.stunNearest handles the actual pose).
   Globals: Stupefy, PetrificusTotalus */
(function () {
  'use strict';

  var RANGE = 45, BEAM_TIME = 0.16, FADE_TIME = 0.3;

  function create(scene, zombies, pose, coreColor, glowColor) {
    var coreMat = new THREE.MeshBasicMaterial({
      color: coreColor, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var glowMat = new THREE.MeshBasicMaterial({
      color: glowColor, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true), coreMat);
    var glow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true), glowMat);
    core.visible = false; glow.visible = false;
    scene.add(core, glow);

    var impact = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,255,255,1)', glowColorCss(glowColor)),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
    }));
    impact.visible = false;
    scene.add(impact);

    var S = {
      active: false,
      phase: null,
      onPhase: function () {},
      getWandTip: function () { return new THREE.Vector3(); },
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    var from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3();
    var up = new THREE.Vector3(0, 1, 0), quat = new THREE.Quaternion();
    var phaseT = 0;

    S.cast = function () {
      var camPose = S.getCameraPose();
      var target = zombies.stunNearest(camPose.pos, RANGE, camPose.dir, pose);
      if (!target) { S.onPhase('none'); return false; }

      from.copy(S.getWandTip());
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
      S.active = true;
      S.phase = 'beam';
      core.visible = glow.visible = impact.visible = true;
      coreMat.opacity = 1;
      glowMat.opacity = 0.55;
      impact.material.opacity = 1;
      S.onPhase('cast');
      return true;
    };

    function finish() {
      S.active = false;
      S.phase = null;
      core.visible = glow.visible = impact.visible = false;
      S.onPhase('done');
    }

    S.update = function (t, dt) {
      if (!S.active) return;
      phaseT += dt;
      if (S.phase === 'beam' && phaseT >= BEAM_TIME) {
        phaseT = 0; S.phase = 'fade'; S.onPhase('fade');
      } else if (S.phase === 'fade' && phaseT >= FADE_TIME) {
        finish();
        return;
      }
      if (S.phase === 'beam') {
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

    return S;
  }

  function glowColorCss(hex) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',0.7)';
  }

  // Stupefy: the Stunning Spell — a red jet, canon's classic stunner colour.
  window.Stupefy = { create: function (scene, zombies) { return create(scene, zombies, null, 0xff3a3a, 0x8a1414); } };
  // Petrificus Totalus: the Full Body-Bind Curse — an icy blue-white jet.
  window.PetrificusTotalus = { create: function (scene, zombies) { return create(scene, zombies, 'tpose', 0x9fd9ff, 0x1c4a6e); } };
})();
