/* Zombies: a handful of robed, wandering undead. Touching fire (Incendio, or
   a Bombarda crater still burning) damages them over time; a Bombarda blast
   hits them instantly (harder with Maxima). Each carries a wand and, when
   attacks are enabled, periodically curses the player from range on its own
   cooldown. Dead zombies topple, vanish, and respawn elsewhere after a while.
   Global: Zombies */
(function () {
  'use strict';

  var COUNT = 7, MAX_HP = 70;
  var SPAWN_MIN_R = 12, SPAWN_MAX_R = 65, WANDER_R = 16, WALK_SPEED = 1.5;
  var FIRE_RADIUS = 1.7, FIRE_DPS = 22;
  var BOMBARDA_DAMAGE = 45, BOMBARDA_MAXIMA_DAMAGE = 100;
  var EXPELLIARMUS_DAMAGE = MAX_HP / 5;
  var ATTACK_RANGE = 17, ATTACK_MIN_CD = 4, ATTACK_MAX_CD = 7.5;
  var ATTACK_DMG_MIN = 4, ATTACK_DMG_MAX = 7, CURSE_TRAVEL_TIME = 0.55;
  var PLAYER_MAX_HP = 100, RESPAWN_MIN = 9, RESPAWN_MAX = 16, FALL_TIME = 0.6;
  var KILL_HEAL = 15;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function whiteTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 4;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 4, 4);
    return new THREE.CanvasTexture(c);
  }

  // A low-poly robed, hooded figure — same build style as the player, tinted
  // sickly green, with glowing red eyes and a wand in its hand.
  function buildZombie(mats) {
    var g = new THREE.Group();

    var legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.85, 7), mats.robeDark);
    legs.position.y = 0.43;
    g.add(legs);

    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.58, 7), mats.robe);
    torso.position.y = 1.14;
    g.add(torso);

    var cape = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.05), mats.cape);
    cape.position.set(0, 1.0, -0.27);
    cape.rotation.x = -0.1;
    g.add(cape);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 7), mats.skin);
    head.position.y = 1.62;
    g.add(head);

    var hood = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.28, 8, 1, true), mats.robe);
    hood.position.set(0, 1.70, -0.02);
    hood.rotation.x = Math.PI;
    g.add(hood);

    var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), mats.eye);
    eyeL.position.set(-0.055, 1.63, 0.13);
    var eyeR = eyeL.clone();
    eyeR.position.x = 0.055;
    g.add(eyeL, eyeR);

    function arm(side) {
      var ag = new THREE.Group();
      var upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.4, 6), mats.robe);
      upper.position.y = -0.2;
      ag.add(upper);
      var hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mats.skin);
      hand.position.y = -0.42;
      ag.add(hand);
      ag.position.set(side * 0.32, 1.38, 0.02);
      ag.rotation.z = side * -0.15;
      ag.rotation.x = 0.3;
      return ag;
    }
    var armL = arm(-1), armR = arm(1);
    g.add(armL, armR);

    var wand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.42, 6), mats.wand);
    wand.position.set(0, -0.58, 0.04);
    wand.rotation.x = 0.5;
    armR.add(wand);

    var wandTip = new THREE.Object3D();
    wandTip.position.y = -0.78;
    armR.add(wandTip);
    g.userData.wandTip = wandTip;
    g.userData.wand = wand;

    return g;
  }

  function create(scene, forest, bombarda, incendio) {
    var mats = {
      robe: new THREE.MeshLambertMaterial({ color: 0x2b3a22 }),
      robeDark: new THREE.MeshLambertMaterial({ color: 0x1c2717 }),
      cape: new THREE.MeshLambertMaterial({ color: 0x18220f, side: THREE.DoubleSide }),
      skin: new THREE.MeshLambertMaterial({ color: 0x7d9468 }),
      eye: new THREE.MeshBasicMaterial({ color: 0xff2b18 }),
      wand: new THREE.MeshLambertMaterial({ color: 0x3a2c1c })
    };

    var barTex = whiteTexture();
    var barGreen = new THREE.Color(0x4ee36b), barRed = new THREE.Color(0xe3423f), barCol = new THREE.Color();

    var Z = {
      attackEnabled: true,
      playerHP: PLAYER_MAX_HP,
      playerMaxHP: PLAYER_MAX_HP,
      onPlayerHealth: function () {},
      onPlayerHit: function () {},
      getCameraPose: function () { return { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) }; }
    };

    function spawnPoint() {
      var a = Math.random() * Math.PI * 2, r = rand(SPAWN_MIN_R, SPAWN_MAX_R);
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }

    function groundY(x, z) {
      return forest.groundHeightAt ? forest.groundHeightAt(x, z) : 0;
    }

    var list = [];
    function makeZombie() {
      var mesh = buildZombie(mats);
      scene.add(mesh);

      var barBg = new THREE.Sprite(new THREE.SpriteMaterial({
        map: barTex, color: 0x1a0d0d, transparent: true, depthWrite: false
      }));
      barBg.scale.set(0.62, 0.09, 1);
      barBg.renderOrder = 10;
      var barFg = new THREE.Sprite(new THREE.SpriteMaterial({
        map: barTex, color: 0x4ee36b, transparent: true, depthWrite: false
      }));
      barFg.scale.set(0.6, 0.065, 1);
      barFg.renderOrder = 11;
      scene.add(barBg, barFg);

      var p = spawnPoint();
      var z = {
        mesh: mesh, barBg: barBg, barFg: barFg,
        hp: MAX_HP, alive: true,
        home: new THREE.Vector3(p.x, 0, p.z),
        pos: new THREE.Vector3(p.x, groundY(p.x, p.z), p.z),
        yaw: rand(0, Math.PI * 2),
        target: null, waitT: rand(0, 2),
        attackCd: rand(ATTACK_MIN_CD, ATTACK_MAX_CD),
        fallT: 0, respawnT: 0, pulled: false
      };
      mesh.position.copy(z.pos);
      mesh.rotation.y = z.yaw;
      return z;
    }
    for (var n = 0; n < COUNT; n++) list.push(makeZombie());
    Z.list = list; // exposed so Accio can consider zombies as summon targets

    function pickTarget(z) {
      var a = Math.random() * Math.PI * 2, r = rand(2, WANDER_R);
      z.target = new THREE.Vector3(z.home.x + Math.cos(a) * r, 0, z.home.z + Math.sin(a) * r);
    }

    function respawn(z) {
      var p = spawnPoint();
      z.home.set(p.x, 0, p.z);
      z.pos.set(p.x, groundY(p.x, p.z), p.z);
      z.mesh.position.copy(z.pos);
      z.mesh.rotation.set(0, rand(0, Math.PI * 2), 0);
      z.hp = MAX_HP;
      z.alive = true;
      z.target = null;
      z.waitT = rand(0, 1.5);
      z.attackCd = rand(ATTACK_MIN_CD, ATTACK_MAX_CD);
      z.pulled = false;
      z.disarmed = false;
      z.mesh.userData.wand.visible = true;
      z.mesh.visible = true;
    }

    function killZombie(z) {
      z.alive = false;
      z.fallT = 0;
      if (Z.playerHP < Z.playerMaxHP) {
        Z.playerHP = Math.min(Z.playerMaxHP, Z.playerHP + KILL_HEAL);
        Z.onPlayerHealth(Z.playerHP, Z.playerMaxHP);
      }
    }

    function damage(z, amount) {
      if (!z.alive) return;
      z.hp -= amount;
      if (z.hp <= 0) killZombie(z);
    }

    // Instantly kills the nearest living zombie to `fromPos` (within
    // `maxRange`, default unlimited) — used by Avada Kedavra. If `facing` is
    // given, zombies behind that direction (roughly outside a forward cone)
    // are ignored, so the curse can't snipe something behind the player.
    var tmpToTarget = new THREE.Vector3();
    Z.killNearest = function (fromPos, maxRange, facing) {
      var range = maxRange || Infinity, best = null, bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var z = list[i];
        if (!z.alive) continue;
        tmpToTarget.subVectors(z.pos, fromPos);
        var d = tmpToTarget.length();
        if (d > range) continue;
        if (facing && d > 0.01) {
          tmpToTarget.multiplyScalar(1 / d);
          if (tmpToTarget.dot(facing) < 0.35) continue; // behind / far off to the side
        }
        if (d < bestD) { bestD = d; best = z; }
      }
      if (!best) return null;
      var spot = best.pos.clone();
      spot.y += 1.1;
      killZombie(best);
      return spot;
    };

    // Finds the nearest living zombie to `fromPos` (within `maxRange`, optionally
    // restricted to a forward-facing cone), without harming it — used by Incendio
    // to pick an enemy to set alight and have the fire follow.
    Z.findNearestAlive = function (fromPos, maxRange, facing) {
      var range = maxRange || Infinity, best = null, bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var z = list[i];
        if (!z.alive) continue;
        tmpToTarget.subVectors(z.pos, fromPos);
        var d = tmpToTarget.length();
        if (d > range) continue;
        if (facing && d > 0.01) {
          tmpToTarget.multiplyScalar(1 / d);
          if (tmpToTarget.dot(facing) < 0.35) continue;
        }
        if (d < bestD) { bestD = d; best = z; }
      }
      return best;
    };

    // Disarms the nearest living zombie to `fromPos` (within `maxRange`,
    // optionally restricted to a forward-facing cone) — used by Expelliarmus.
    // A disarmed zombie keeps wandering but can no longer fire curses at the
    // player; its wand is knocked out of its hand, and it takes a small
    // chunk of damage from the force of the disarming blow.
    Z.disarmNearest = function (fromPos, maxRange, facing) {
      var range = maxRange || Infinity, best = null, bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var z = list[i];
        if (!z.alive || z.disarmed) continue;
        tmpToTarget.subVectors(z.pos, fromPos);
        var d = tmpToTarget.length();
        if (d > range) continue;
        if (facing && d > 0.01) {
          tmpToTarget.multiplyScalar(1 / d);
          if (tmpToTarget.dot(facing) < 0.35) continue;
        }
        if (d < bestD) { bestD = d; best = z; }
      }
      if (!best) return null;
      best.disarmed = true;
      best.mesh.userData.wand.visible = false;
      damage(best, EXPELLIARMUS_DAMAGE);
      var spot = best.pos.clone();
      spot.y += 1.1;
      return spot;
    };

    // Damages the nearest living zombie within `radius` of `pos` by a flat
    // amount — used by Depulso to hurt whatever it knocks a burning object into.
    Z.damageNearest = function (pos, radius, amount) {
      var best = null, bestD = radius;
      for (var i = 0; i < list.length; i++) {
        var z = list[i];
        if (!z.alive) continue;
        var d = z.pos.distanceTo(pos);
        if (d < bestD) { bestD = d; best = z; }
      }
      if (!best) return null;
      damage(best, amount);
      return best.pos.clone();
    };

    function hitPlayer(dmg) {
      Z.playerHP = Math.max(0, Z.playerHP - dmg);
      Z.onPlayerHit(dmg);
      Z.onPlayerHealth(Z.playerHP, Z.playerMaxHP);
      if (Z.playerHP <= 0) {
        setTimeout(function () {
          Z.playerHP = Z.playerMaxHP;
          Z.onPlayerHealth(Z.playerHP, Z.playerMaxHP);
        }, 3000);
      }
    }

    // ---------- zombie curses flying at the player ----------
    var boltTex = makeGlowTexture('rgba(210,255,180,1)', 'rgba(70,180,40,0.7)');
    var bolts = [];
    for (n = 0; n < COUNT; n++) {
      var boltSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: boltTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0
      }));
      boltSprite.scale.set(0.5, 0.5, 1);
      boltSprite.visible = false;
      scene.add(boltSprite);
      bolts.push({ sprite: boltSprite, t: 0, active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), dmg: 0 });
    }

    function fireCurse(z, targetPos) {
      var b = null;
      for (var i = 0; i < bolts.length; i++) if (!bolts[i].active) { b = bolts[i]; break; }
      if (!b) return;
      z.mesh.userData.wandTip.getWorldPosition(b.from);
      b.to.copy(targetPos);
      b.t = 0;
      b.dmg = rand(ATTACK_DMG_MIN, ATTACK_DMG_MAX);
      b.active = true;
      b.sprite.visible = true;
      b.sprite.material.opacity = 1;
      b.sprite.position.copy(b.from);
    }

    var lastBombardaSeq = 0;
    var tmpDiff = new THREE.Vector3();

    Z.update = function (t, dt) {
      var pose = Z.getCameraPose();
      var i;

      // Instant Bombarda blast damage, applied once per new cast.
      if (bombarda && bombarda.castSeq !== lastBombardaSeq) {
        lastBombardaSeq = bombarda.castSeq;
        var blastDmg = bombarda.maxima ? BOMBARDA_MAXIMA_DAMAGE : BOMBARDA_DAMAGE;
        for (i = 0; i < list.length; i++) {
          var zb = list[i];
          if (zb.alive && zb.pos.distanceTo(bombarda.pos) <= bombarda.radius) damage(zb, blastDmg);
        }
      }

      for (i = 0; i < list.length; i++) {
        var z = list[i];

        if (!z.alive) {
          if (z.fallT < FALL_TIME) {
            z.fallT += dt;
            var f = Math.min(1, z.fallT / FALL_TIME);
            z.mesh.rotation.x = f * (Math.PI / 2);
            z.barBg.visible = z.barFg.visible = false;
          } else if (z.mesh.visible) {
            z.mesh.visible = false;
            z.respawnT = rand(RESPAWN_MIN, RESPAWN_MAX);
          } else {
            z.respawnT -= dt;
            if (z.respawnT <= 0) respawn(z);
          }
          continue;
        }

        // Fire damage: Incendio, or a still-burning Bombarda crater.
        if (incendio && incendio.active && incendio.phase !== 'fade' &&
            z.pos.distanceTo(incendio.pos) < FIRE_RADIUS) {
          damage(z, FIRE_DPS * dt);
        }
        if (bombarda && bombarda.phase === 'burn' &&
            z.pos.distanceTo(bombarda.pos) < bombarda.igniteRadius) {
          damage(z, FIRE_DPS * dt);
        }
        if (!z.alive) continue;

        // Wander within a leash around its spawn point — suspended while Accio
        // has it in the air, so the pull isn't fighting its own AI.
        if (!z.pulled) {
          z.waitT -= dt;
          if (!z.target) {
            if (z.waitT <= 0) pickTarget(z);
          } else {
            tmpDiff.set(z.target.x - z.pos.x, 0, z.target.z - z.pos.z);
            var d = tmpDiff.length();
            if (d < 0.35) {
              z.target = null;
              z.waitT = rand(1, 4);
            } else {
              tmpDiff.multiplyScalar(1 / d);
              z.pos.x += tmpDiff.x * WALK_SPEED * dt;
              z.pos.z += tmpDiff.z * WALK_SPEED * dt;
              var targetYaw = Math.atan2(tmpDiff.x, tmpDiff.z);
              var dy = ((targetYaw - z.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
              z.yaw += dy * Math.min(1, dt * 4);
            }
          }
        }
        z.pos.y = groundY(z.pos.x, z.pos.z);
        z.mesh.position.copy(z.pos);
        z.mesh.position.y += Math.sin(t * 3 + z.home.x) * 0.02;
        z.mesh.rotation.y = z.yaw;

        // Health bar (shrinks toward its center; green -> red as it drops).
        z.barBg.visible = z.barFg.visible = true;
        z.barBg.position.set(z.pos.x, z.pos.y + 2.05, z.pos.z);
        z.barFg.position.copy(z.barBg.position);
        var frac = Math.max(0, z.hp / MAX_HP);
        z.barFg.scale.x = 0.6 * frac;
        barCol.copy(barRed).lerp(barGreen, frac);
        z.barFg.material.color.copy(barCol);

        // Curse attack, on its own cooldown, only while enabled, in range,
        // and not disarmed (Expelliarmus).
        if (Z.attackEnabled && !z.pulled && !z.disarmed) {
          z.attackCd -= dt;
          if (z.attackCd <= 0 && z.pos.distanceTo(pose.pos) <= ATTACK_RANGE) {
            fireCurse(z, pose.pos);
            z.attackCd = rand(ATTACK_MIN_CD, ATTACK_MAX_CD);
          }
        }
      }

      // Curse bolts in flight.
      for (i = 0; i < bolts.length; i++) {
        var b = bolts[i];
        if (!b.active) continue;
        b.t += dt;
        var bf = Math.min(1, b.t / CURSE_TRAVEL_TIME);
        b.sprite.position.lerpVectors(b.from, b.to, bf);
        b.sprite.position.y += Math.sin(bf * Math.PI) * 0.6;
        if (bf >= 1) {
          b.active = false;
          b.sprite.visible = false;
          hitPlayer(b.dmg);
        }
      }
    };

    return Z;
  }

  window.Zombies = { create: create };
})();
