/* Lumos: a warm light kindles at the wand tip and stays lit until dismissed
   with Nox.
   Global: Lumos */
(function () {
  'use strict';

  function create(scene) {
    var light = new THREE.PointLight(0xffe9b8, 0, 15, 2);
    scene.add(light);

    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,246,220,1)', 'rgba(255,214,140,0.5)'),
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0
    }));
    glow.scale.set(0.55, 0.55, 1);
    scene.add(glow);

    var L = {
      on: false,
      intensity: 0,
      onPhase: function () {},
      getWandTip: function () { return new THREE.Vector3(); }
    };

    // state: true (Lumos), false (Nox), or 'toggle' (menu quick-access)
    L.set = function (state) {
      var on = state === 'toggle' ? !L.on : !!state;
      if (on === L.on) return false;
      L.on = on;
      L.onPhase(on ? 'on' : 'off');
      return true;
    };

    L.update = function (t, dt) {
      var target = L.on ? 1 : 0;
      L.intensity += (target - L.intensity) * (1 - Math.exp(-dt * (L.on ? 4.5 : 2.8)));
      if (L.intensity < 0.002 && !L.on) L.intensity = 0;
      var tip = L.getWandTip();
      light.position.copy(tip);
      glow.position.copy(tip);
      var flicker = 1 + Math.sin(t * 9.5) * 0.04 + Math.sin(t * 23) * 0.02;
      light.intensity = L.intensity * 3.4 * flicker;
      glow.material.opacity = L.intensity * 0.9;
    };

    return L;
  }

  window.Lumos = { create: create };
})();
