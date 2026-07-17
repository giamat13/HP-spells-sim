/* The dark forest: ground, trees, undergrowth, rocks, logs, moon, stars,
   dust motes, bats, glowing mushrooms, flowers, dementor weather.
   Also tracks liftable ground objects (rocks/shrubs/logs/mushrooms/flowers)
   for Wingardium Leviosa via F.liftables + F.setLiftableTransform.
   Globals: Forest, makeGlowTexture */
(function () {
  'use strict';

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Soft radial glow sprite texture (shared with the patronus system).
  window.makeGlowTexture = function (inner, outer) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner || 'rgba(255,255,255,1)');
    g.addColorStop(0.35, outer || 'rgba(160,210,255,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(c);
    return tex;
  };

  function smokeTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    for (var i = 0; i < 26; i++) {
      var x = rand(20, 108), y = rand(30, 98), r = rand(12, 34);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(8,10,16,0.20)');
      g.addColorStop(1, 'rgba(8,10,16,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(c);
  }

  // Keep a corridor clear for the patronus run (rough band along x axis).
  function inCorridor(x, z) {
    return (Math.abs(z) < 5.5 && x > -14 && x < 46) ||
           (x * x + z * z < 60);
  }

  function scatterPos(rMin, rMax) {
    for (var tries = 0; tries < 40; tries++) {
      var a = Math.random() * Math.PI * 2;
      var r = rand(rMin, rMax);
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!inCorridor(x, z)) return { x: x, z: z };
    }
    return { x: rMax, z: rMax };
  }

  function buildPine(mats) {
    var g = new THREE.Group();
    var h = rand(7, 12);
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(rand(0.12, 0.2), rand(0.3, 0.45), h, 6),
      mats.bark);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);
    var levels = 3 + (Math.random() * 2 | 0);
    for (var i = 0; i < levels; i++) {
      var f = i / levels;
      var cone = new THREE.Mesh(
        new THREE.ConeGeometry((1 - f * 0.55) * rand(1.6, 2.4), rand(2.2, 3.2), 7),
        mats.pine);
      cone.position.y = h * 0.38 + f * h * 0.62;
      cone.castShadow = true;
      g.add(cone);
    }
    return g;
  }

  function buildBareTree(mats) {
    var g = new THREE.Group();
    var h = rand(8, 13);
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(rand(0.14, 0.24), rand(0.42, 0.62), h, 7),
      mats.bark2);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);
    var branches = 3 + (Math.random() * 3 | 0);
    for (var i = 0; i < branches; i++) {
      var bl = rand(2.2, 4.2);
      var b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, rand(0.12, 0.2), bl, 5),
        mats.bark2);
      b.position.y = bl / 2;
      var pivot = new THREE.Group();
      pivot.position.y = rand(h * 0.45, h * 0.92);
      pivot.rotation.z = rand(0.5, 1.15) * (Math.random() < 0.5 ? 1 : -1);
      pivot.rotation.y = rand(0, Math.PI * 2);
      pivot.add(b);
      b.castShadow = true;
      g.add(pivot);
    }
    return g;
  }

  function build(scene, Q) {
    var F = { trees: [], bats: [], updaters: [] };

    scene.fog = new THREE.FogExp2(0x0a121e, 0.024);
    scene.background = new THREE.Color(0x05080f);

    var mats = {
      bark:  new THREE.MeshLambertMaterial({ color: 0x1b1512 }),
      bark2: new THREE.MeshLambertMaterial({ color: 0x241c15 }),
      pine:  new THREE.MeshLambertMaterial({ color: 0x0d1a16 }),
      ground: new THREE.MeshLambertMaterial({ color: 0x0d1310 }),
      rock:  new THREE.MeshLambertMaterial({ color: 0x1c2026 }),
      leaf:  new THREE.MeshLambertMaterial({ color: 0x241a10, side: THREE.DoubleSide }),
      bush:  new THREE.MeshLambertMaterial({ color: 0x101a13 })
    };

    // Ground
    var ground = new THREE.Mesh(new THREE.CircleGeometry(95, 40), mats.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Lights
    var hemi = new THREE.HemisphereLight(0x2e4468, 0x0a0e14, 0.75);
    scene.add(hemi);
    var moonLight = new THREE.DirectionalLight(0x9fc4f0, 1.25);
    moonLight.position.set(28, 50, -38);
    moonLight.castShadow = Q.shadows;
    moonLight.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    moonLight.shadow.camera.left = -50;
    moonLight.shadow.camera.right = 50;
    moonLight.shadow.camera.top = 50;
    moonLight.shadow.camera.bottom = -50;
    moonLight.shadow.camera.far = 140;
    moonLight.shadow.bias = -0.0008;
    scene.add(moonLight);
    F.moonLight = moonLight;
    F.hemi = hemi;

    // Moon sprite
    var moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(235,245,255,1)', 'rgba(160,200,255,0.4)'),
      transparent: true, depthWrite: false
    }));
    moon.position.set(30, 58, -120);
    moon.scale.set(30, 30, 1);
    scene.add(moon);
    F.moon = moon;

    // Stars
    var starGeo = new THREE.BufferGeometry();
    var starPos = new Float32Array(Q.stars * 3);
    for (var i = 0; i < Q.stars; i++) {
      var a = Math.random() * Math.PI * 2;
      var e = Math.acos(Math.random() * 0.85);
      var r = 190;
      starPos[i * 3] = Math.cos(a) * Math.sin(e) * r;
      starPos[i * 3 + 1] = Math.cos(e) * r + 10;
      starPos[i * 3 + 2] = Math.sin(a) * Math.sin(e) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    var stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xbfd4ee, size: 0.8, sizeAttenuation: false,
      transparent: true, opacity: 0.75, fog: false
    }));
    scene.add(stars);

    // Trees (kept individual for wind sway)
    for (i = 0; i < Q.trees; i++) {
      var p = scatterPos(8, 72);
      var tree = Math.random() < 0.55 ? buildPine(mats) : buildBareTree(mats);
      tree.position.set(p.x, 0, p.z);
      tree.rotation.y = rand(0, Math.PI * 2);
      var s = rand(0.8, 1.35);
      tree.scale.set(s, s, s);
      tree.userData.phase = rand(0, Math.PI * 2);
      scene.add(tree);
      F.trees.push(tree);
    }

    // Undergrowth (instanced)
    var bushGeo = new THREE.IcosahedronGeometry(0.55, 0);
    var bushes = new THREE.InstancedMesh(bushGeo, mats.bush, Q.undergrowth);
    var m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler();
    for (i = 0; i < Q.undergrowth; i++) {
      p = scatterPos(6, 66);
      e4.set(rand(0, 0.4), rand(0, Math.PI * 2), rand(0, 0.4));
      q4.setFromEuler(e4);
      m4.compose(
        new THREE.Vector3(p.x, rand(0.05, 0.25), p.z), q4,
        new THREE.Vector3(rand(0.5, 1.6), rand(0.35, 0.9), rand(0.5, 1.6)));
      bushes.setMatrixAt(i, m4);
    }
    scene.add(bushes);

    // Rocks (instanced)
    var rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
    var rocks = new THREE.InstancedMesh(rockGeo, mats.rock, Q.rocks);
    for (i = 0; i < Q.rocks; i++) {
      p = scatterPos(5, 60);
      e4.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
      q4.setFromEuler(e4);
      m4.compose(
        new THREE.Vector3(p.x, rand(0, 0.2), p.z), q4,
        new THREE.Vector3(rand(0.4, 1.8), rand(0.3, 1.1), rand(0.4, 1.8)));
      rocks.setMatrixAt(i, m4);
    }
    rocks.castShadow = Q.shadows;
    scene.add(rocks);

    // Fallen logs
    F.logs = [];
    for (i = 0; i < Q.logs; i++) {
      p = scatterPos(7, 45);
      var log = new THREE.Mesh(
        new THREE.CylinderGeometry(rand(0.18, 0.32), rand(0.22, 0.4), rand(3, 6), 7),
        mats.bark2);
      log.rotation.z = Math.PI / 2 + rand(-0.1, 0.1);
      log.rotation.y = rand(0, Math.PI * 2);
      log.position.set(p.x, 0.28, p.z);
      log.castShadow = Q.shadows;
      scene.add(log);
      F.logs.push(log);
    }

    // Scattered leaves (instanced flat quads)
    var leafGeo = new THREE.PlaneGeometry(0.28, 0.18);
    var leaves = new THREE.InstancedMesh(leafGeo, mats.leaf, Q.leaves);
    for (i = 0; i < Q.leaves; i++) {
      var a2 = Math.random() * Math.PI * 2;
      var r2 = rand(2, 55);
      e4.set(-Math.PI / 2 + rand(-0.3, 0.3), rand(0, Math.PI * 2), 0);
      q4.setFromEuler(e4);
      m4.compose(
        new THREE.Vector3(Math.cos(a2) * r2, 0.02, Math.sin(a2) * r2), q4,
        new THREE.Vector3(1, 1, 1));
      leaves.setMatrixAt(i, m4);
    }
    scene.add(leaves);

    // Glowing mushrooms — tiny blue-lit clusters
    var shroomMat = new THREE.MeshLambertMaterial({
      color: 0x14202c, emissive: 0x2a6a96, emissiveIntensity: 0.9
    });
    var stemMat = new THREE.MeshLambertMaterial({ color: 0x2a3038 });
    F.shroomMat = shroomMat;
    F.mushroomClusters = [];
    for (i = 0; i < Q.mushrooms; i++) {
      p = scatterPos(4, 40);
      var cluster = new THREE.Group();
      var count = 1 + (Math.random() * 3 | 0);
      for (var j = 0; j < count; j++) {
        var sh = rand(0.12, 0.3);
        var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, sh, 5), stemMat);
        stem.position.set(rand(-0.25, 0.25), sh / 2, rand(-0.25, 0.25));
        var cap = new THREE.Mesh(new THREE.ConeGeometry(sh * 0.55, sh * 0.5, 7), shroomMat);
        cap.position.set(stem.position.x, sh + sh * 0.2, stem.position.z);
        cluster.add(stem, cap);
      }
      cluster.position.set(p.x, 0, p.z);
      scene.add(cluster);
      F.mushroomClusters.push(cluster);
    }

    // Flowers — small bright blossoms scattered near the ground
    var flowerStemMat = new THREE.MeshLambertMaterial({ color: 0x24361f });
    var flowerColors = [0xff5577, 0xffd166, 0xff8c42, 0xc77dff, 0xf72585, 0xffffff];
    F.flowerClusters = [];
    for (i = 0; i < Q.flowers; i++) {
      p = scatterPos(3, 35);
      var flower = new THREE.Group();
      var fcount = 1 + (Math.random() * 2 | 0);
      for (var k = 0; k < fcount; k++) {
        var fh = rand(0.18, 0.34);
        var fstem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, fh, 5), flowerStemMat);
        fstem.position.set(rand(-0.15, 0.15), fh / 2, rand(-0.15, 0.15));
        var fcolor = flowerColors[(Math.random() * flowerColors.length) | 0];
        var bloomMat = new THREE.MeshLambertMaterial({ color: fcolor, emissive: fcolor, emissiveIntensity: 0.12 });
        var bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(fh * 0.32, 0), bloomMat);
        bloom.position.set(fstem.position.x, fh, fstem.position.z);
        flower.add(fstem, bloom);
      }
      flower.position.set(p.x, 0, p.z);
      scene.add(flower);
      F.flowerClusters.push(flower);
    }

    // Liftable objects for Wingardium Leviosa: rocks, shrubs, logs, mushrooms, flowers
    F.liftables = [];
    var liftM4 = new THREE.Matrix4(), liftPos = new THREE.Vector3(),
        liftQuat = new THREE.Quaternion(), liftScl = new THREE.Vector3();
    function addInstancedLiftables(mesh, count, label) {
      for (var n = 0; n < count; n++) {
        mesh.getMatrixAt(n, liftM4);
        liftM4.decompose(liftPos, liftQuat, liftScl);
        F.liftables.push({
          kind: 'instanced', mesh: mesh, index: n, label: label,
          basePos: liftPos.clone(), baseQuat: liftQuat.clone(), baseScale: liftScl.clone()
        });
      }
    }
    function addObjectLiftables(list, label) {
      for (var n = 0; n < list.length; n++) {
        var obj = list[n];
        F.liftables.push({
          kind: 'object', mesh: obj, label: label,
          basePos: obj.position.clone(), baseQuat: obj.quaternion.clone(), baseScale: obj.scale.clone()
        });
      }
    }
    addInstancedLiftables(rocks, Q.rocks, 'rock');
    addInstancedLiftables(bushes, Q.undergrowth, 'shrub');
    addObjectLiftables(F.logs, 'fallen log');
    addObjectLiftables(F.mushroomClusters, 'mushroom');
    addObjectLiftables(F.flowerClusters, 'flower');

    // Writes a liftable's current world transform back to its render representation
    // (an InstancedMesh slot for rocks/shrubs, or the object's own transform otherwise).
    F.setLiftableTransform = function (entry, pos, quat) {
      if (entry.kind === 'instanced') {
        liftM4.compose(pos, quat, entry.baseScale);
        entry.mesh.setMatrixAt(entry.index, liftM4);
        entry.mesh.instanceMatrix.needsUpdate = true;
      } else {
        entry.mesh.position.copy(pos);
        entry.mesh.quaternion.copy(quat);
      }
    };

    // Bombarda knocks nearby trees flat — they fall away from the blast
    // center along a horizontal axis perpendicular to it, and stay down
    // (no more wind sway) for the rest of the session.
    var fellDir = new THREE.Vector3(), fellAxis = new THREE.Vector3(),
        fellQuat = new THREE.Quaternion(), fellYaw = new THREE.Quaternion(),
        fellUp = new THREE.Vector3(0, 1, 0);
    F.fellTrees = function (center, radius) {
      var felled = [];
      for (var i = 0; i < F.trees.length; i++) {
        var tr = F.trees[i];
        if (tr.userData.felled) continue;
        var dx = tr.position.x - center.x, dz = tr.position.z - center.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > radius) continue;
        fellDir.set(dist > 0.01 ? dx / dist : 1, 0, dist > 0.01 ? dz / dist : 0);
        fellAxis.set(-fellDir.z, 0, fellDir.x).normalize();
        fellYaw.setFromAxisAngle(fellUp, tr.rotation.y);
        tr.userData.felled = true;
        tr.userData.fallAxis = fellAxis.clone();
        tr.userData.fallYawQuat = fellYaw.clone();
        tr.userData.fallAngle = rand(1.25, 1.48);
        tr.userData.fallProgress = 0;
        tr.userData.fallDelay = (dist / radius) * 0.15;
        tr.userData.fallDur = rand(0.55, 0.85);
        felled.push(tr);
      }
      return felled;
    };

    // Dust motes drifting in the moonlight
    var dustGeo = new THREE.BufferGeometry();
    var dustPos = new Float32Array(Q.dust * 3);
    var dustSeed = new Float32Array(Q.dust);
    for (i = 0; i < Q.dust; i++) {
      dustPos[i * 3] = rand(-40, 40);
      dustPos[i * 3 + 1] = rand(0.2, 14);
      dustPos[i * 3 + 2] = rand(-40, 40);
      dustSeed[i] = rand(0, Math.PI * 2);
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(220,235,255,0.9)', 'rgba(150,190,240,0.3)'),
      color: 0x9db8d8, size: 0.14, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(dust);
    F.updaters.push(function (t, dt) {
      var arr = dust.geometry.attributes.position.array;
      for (var i = 0; i < Q.dust; i++) {
        arr[i * 3] += Math.sin(t * 0.3 + dustSeed[i]) * dt * 0.35 + dt * 0.18;
        arr[i * 3 + 1] += Math.cos(t * 0.22 + dustSeed[i] * 1.7) * dt * 0.14;
        if (arr[i * 3] > 40) arr[i * 3] = -40;
        if (arr[i * 3 + 1] < 0.1) arr[i * 3 + 1] = 14;
        if (arr[i * 3 + 1] > 14.5) arr[i * 3 + 1] = 0.2;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    });

    // Bats / night birds — occasional fly-bys
    var batMat = new THREE.MeshBasicMaterial({ color: 0x02040a, side: THREE.DoubleSide });
    var wingGeo = new THREE.PlaneGeometry(0.9, 0.35);
    for (i = 0; i < Q.bats; i++) {
      var bat = new THREE.Group();
      var wl = new THREE.Mesh(wingGeo, batMat); wl.position.x = -0.45;
      var wr = new THREE.Mesh(wingGeo, batMat); wr.position.x = 0.45;
      var pl = new THREE.Group(); pl.add(wl);
      var pr = new THREE.Group(); pr.add(wr);
      bat.add(pl, pr);
      bat.userData = { pl: pl, pr: pr, t: rand(-30, -5), speed: rand(4, 8), y: rand(10, 22), z: rand(-45, 25), phase: rand(0, 9) };
      bat.visible = false;
      scene.add(bat);
      F.bats.push(bat);
    }

    // Dementor weather clouds (hidden until toggled)
    var cloudTex = smokeTexture();
    F.clouds = [];
    for (i = 0; i < Q.clouds; i++) {
      var cl = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, opacity: 0,
        depthWrite: false, color: 0x0a0d14
      }));
      cl.position.set(rand(-60, 60), rand(26, 44), rand(-70, -10));
      cl.scale.set(rand(30, 55), rand(14, 24), 1);
      cl.userData.drift = rand(0.2, 0.7);
      cl.visible = false;
      scene.add(cl);
      F.clouds.push(cl);
    }
    F.dementor = false;

    F.setDementor = function (on) {
      F.dementor = on;
      for (var i = 0; i < F.clouds.length; i++) F.clouds[i].visible = true;
      // fade handled in update
    };

    F.update = function (t, dt) {
      // Wind sway (felled trees skip this and animate their fall instead)
      for (var i = 0; i < F.trees.length; i++) {
        var tr = F.trees[i];
        if (tr.userData.felled) {
          if (tr.userData.fallProgress < 1) {
            if (tr.userData.fallDelay > 0) {
              tr.userData.fallDelay -= dt;
            } else {
              tr.userData.fallProgress += dt / tr.userData.fallDur;
              var f = Math.min(1, tr.userData.fallProgress);
              var e = f * f * (3 - 2 * f);
              fellQuat.setFromAxisAngle(tr.userData.fallAxis, e * tr.userData.fallAngle);
              tr.quaternion.copy(fellQuat).multiply(tr.userData.fallYawQuat);
            }
          }
          continue;
        }
        var ph = tr.userData.phase;
        tr.rotation.z = Math.sin(t * 0.55 + ph) * 0.012 + Math.sin(t * 1.7 + ph * 2) * 0.004;
        tr.rotation.x = Math.cos(t * 0.4 + ph) * 0.009;
      }
      // Mushroom pulse
      F.shroomMat.emissiveIntensity = 0.7 + Math.sin(t * 1.3) * 0.25;
      // Bats
      for (i = 0; i < F.bats.length; i++) {
        var b = F.bats[i], u = b.userData;
        u.t += dt * u.speed;
        if (u.t > 90) {
          u.t = rand(-160, -40);            // long pause before next fly-by
          u.y = rand(10, 22); u.z = rand(-45, 25);
        }
        b.visible = u.t > -2 && u.t < 82;
        if (b.visible) {
          b.position.set(u.t - 40, u.y + Math.sin(u.t * 0.4 + u.phase) * 1.5, u.z);
          var flap = Math.sin(t * 14 + u.phase) * 0.9;
          u.pl.rotation.y = flap;
          u.pr.rotation.y = -flap;
        }
      }
      // Dementor clouds fade + drift
      var target = F.dementor ? 0.85 : 0;
      for (i = 0; i < F.clouds.length; i++) {
        var c = F.clouds[i];
        c.material.opacity += (target - c.material.opacity) * dt * 0.7;
        if (c.material.opacity < 0.01 && !F.dementor) c.visible = false;
        else c.position.x += c.userData.drift * dt;
        if (c.position.x > 70) c.position.x = -70;
      }
      for (i = 0; i < F.updaters.length; i++) F.updaters[i](t, dt);
    };

    return F;
  }

  window.Forest = { build: build };
})();
