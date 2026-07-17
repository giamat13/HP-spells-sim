/* Lumos: a warm light kindles at the wand tip and stays lit until dismissed
   with Nox. Lumos Maxima swells it into a large, far-reaching globe of light.
   Global: Lumos */
(function () {
  'use strict';

  var SMALL = { distance: 9, peak: 3.3, glowScale: 0.7, glowOpacity: 0.9, color: 0xffe9b8 };
  var MAXIMA = { distance: 32, peak: 7.5, glowScale: 1.35, glowOpacity: 0.95, color: 0xfff6e0 };

  function create(scene) {
    var light = new THREE.PointLight(0xffe9b8, 0, SMALL.distance, 2);
    scene.add(light);

    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,246,220,1)', 'rgba(255,214,140,0.5)'),
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0
    }));
    glow.scale.set(SMALL.glowScale, SMALL.glowScale, 1);
    scene.add(glow);

    var L = {
      on: false,
      maxima: false,
      intensity: 0,
      onPhase: function () {},
      getWandTip: function () { return new THREE.Vector3(); }
    };

    // on: true (lit), false (Nox), or 'toggle' (menu quick-access).
    // maxima: true for the wide-reaching variant; ignored while turning off.
    L.set = function (on, maxima) {
      var wantOn = on === 'toggle' ? !L.on : !!on;
      var changed = wantOn !== L.on;
      if (wantOn && typeof maxima === 'boolean' && maxima !== L.maxima) {
        L.maxima = maxima;
        changed = true;
      }
      if (!changed) return false;
      L.on = wantOn;
      L.onPhase(!L.on ? 'off' : (L.maxima ? 'maxima' : 'on'));
      return true;
    };

    var curDistance = SMALL.distance;
    var warm = new THREE.Color(SMALL.color), bright = new THREE.Color(MAXIMA.color);

    L.update = function (t, dt) {
      var target = L.on ? 1 : 0;
      L.intensity += (target - L.intensity) * (1 - Math.exp(-dt * (L.on ? 4.5 : 2.8)));
      if (L.intensity < 0.002 && !L.on) L.intensity = 0;

      var profile = L.maxima ? MAXIMA : SMALL;
      curDistance += (profile.distance - curDistance) * (1 - Math.exp(-dt * 2.2));
      light.distance = curDistance;
      light.color.lerp(L.maxima ? bright : warm, 1 - Math.exp(-dt * 2.2));

      var tip = L.getWandTip();
      light.position.copy(tip);
      glow.position.copy(tip);
      var flicker = 1 + Math.sin(t * 9.5) * 0.04 + Math.sin(t * 23) * 0.02;
      light.intensity = L.intensity * profile.peak * flicker;
      var gs = glow.scale.x + (profile.glowScale - glow.scale.x) * (1 - Math.exp(-dt * 3));
      glow.scale.set(gs, gs, 1);
      glow.material.opacity = L.intensity * profile.glowOpacity;
    };

    return L;
  }

  window.Lumos = { create: create };
})();
