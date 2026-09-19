/* Episkey: a minor healing charm. Restores a chunk of the player's health and
   wreathes them in rising golden-white sparkles. Casting at full health does
   nothing (and says so); no cooldown otherwise.
   Global: Episkey */
(function () {
  'use strict';

  var HEAL = 30, LIFE = 1.3, COUNT = 16, RISE = 1.5;

  function create(scene, zombies) {
    var tex = makeGlowTexture('rgba(255,255,235,1)', 'rgba(255,205,90,0.6)');
    var sparks = [];
    for (var i = 0; i < COUNT; i++) {
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0
      }));
      sprite.visible = false;
      scene.add(sprite);
      sparks.push({ sprite: sprite, delay: 0, baseY: 0 });
    }

    var E = {
      active: false,
      onPhase: function () {},
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    var age = 0;

    E.cast = function () {
      if (zombies.healPlayer(HEAL) <= 0) { E.onPhase('full'); return false; }

      // Sparkles ring the player and drift upward, staggered so they trickle.
      var pos = E.getCameraPose().pos;
      for (var i = 0; i < COUNT; i++) {
        var a = Math.random() * Math.PI * 2, r = 0.9 + Math.random() * 0.7;
        var s = sparks[i], size = 0.16 + Math.random() * 0.2;
        s.sprite.position.set(pos.x + Math.cos(a) * r, pos.y - 1.5 + Math.random() * 1.2, pos.z + Math.sin(a) * r);
        s.baseY = s.sprite.position.y;
        s.delay = Math.random() * 0.35;
        s.sprite.scale.set(size, size, 1);
        s.sprite.material.opacity = 0;
        s.sprite.visible = true;
      }
      age = 0;
      E.active = true;
      E.onPhase('cast');
      return true;
    };

    E.update = function (t, dt) {
      if (!E.active) return;
      age += dt;
      var live = false;
      for (var i = 0; i < COUNT; i++) {
        var s = sparks[i], k = (age - s.delay) / LIFE;
        if (k < 0) { live = true; continue; }
        if (k >= 1) { s.sprite.visible = false; continue; }
        live = true;
        s.sprite.position.y = s.baseY + k * RISE;
        s.sprite.material.opacity = Math.sin(k * Math.PI); // fade in, then out
      }
      if (!live) { E.active = false; E.onPhase('done'); }
    };

    return E;
  }

  window.Episkey = { create: create };
})();
