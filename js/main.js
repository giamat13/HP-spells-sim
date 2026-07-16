/* Bootstrap: renderer, camera, wand, quality tiers, camera choreography,
   and the render loop that ties forest + patronus + UI + audio together. */
(function () {
  'use strict';

  var isMobile = (function () {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    return (coarse && ua) || (ua && Math.min(screen.width, screen.height) < 820);
  })();

  var Q = isMobile ? {
    trees: 26, undergrowth: 40, rocks: 18, logs: 3, leaves: 120, mushrooms: 6,
    dust: 120, stars: 250, bats: 2, clouds: 4,
    shadows: true, shadowSize: 1024,
    patronusPoints: 1700, trailPoints: 900, trailRate: 3.5,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    antialias: false
  } : {
    trees: 60, undergrowth: 90, rocks: 40, logs: 6, leaves: 350, mushrooms: 12,
    dust: 350, stars: 500, bats: 4, clouds: 6,
    shadows: true, shadowSize: 2048,
    patronusPoints: 4500, trailPoints: 2400, trailRate: 7,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    antialias: true
  };

  var canvas = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: Q.antialias });
  renderer.setPixelRatio(Q.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);

  var forest = Forest.build(scene, Q);
  var patronus = Patronus.create(scene, Q);

  /* ---------- wand (held at the edge of view) ---------- */

  var wand = new THREE.Group();
  var wandMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.034, 1.05, 7),
    new THREE.MeshLambertMaterial({ color: 0x4a3826, emissive: 0x140d06 }));
  var wandHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.042, 0.24, 7),
    new THREE.MeshLambertMaterial({ color: 0x241a10 }));
  wandHandle.position.y = -0.42;
  wand.add(wandMesh, wandHandle);
  var wandTip = new THREE.Object3D();
  wandTip.position.y = 0.55;
  wand.add(wandTip);
  var tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0
  }));
  tipGlow.scale.set(0.6, 0.6, 1);
  tipGlow.position.y = 0.58;
  wand.add(tipGlow);
  wand.position.set(0.85, -0.78, -2.0);
  wand.rotation.set(-1.05, 0.15, -0.25);
  camera.add(wand);
  scene.add(camera);

  var tipWorld = new THREE.Vector3();
  patronus.getWandTip = function () {
    wandTip.getWorldPosition(tipWorld);
    return tipWorld;
  };

  /* ---------- environment mood ---------- */

  var baseFog = new THREE.Color(0x0a121e);
  var dementorFog = new THREE.Color(0x04060a);
  var patronusFog = new THREE.Color(0x16283f);
  var fogTmp = new THREE.Color();
  var dementorOn = false;

  function applyWeather(on) {
    dementorOn = on;
    forest.setDementor(on);
    AudioSys.setDementor(on);
  }

  /* ---------- camera choreography ---------- */

  var camPos = new THREE.Vector3(0, 3.4, 13);
  var camLook = new THREE.Vector3(0, 2.6, 0);
  var desiredPos = new THREE.Vector3();
  var desiredLook = new THREE.Vector3();
  var prevPatronusPos = new THREE.Vector3();
  var followDir = new THREE.Vector3(1, 0, 0);
  var pointer = { x: 0, y: 0 };

  window.addEventListener('pointermove', function (ev) {
    pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (ev.clientY / window.innerHeight) * 2 - 1;
  });

  function updateCamera(t, dt) {
    var ph = patronus.phase;
    if (ph === 'run' || ph === 'fade') {
      var v = new THREE.Vector3().subVectors(patronus.pos, prevPatronusPos);
      if (v.lengthSq() > 1e-6) {
        v.normalize();
        followDir.lerp(v, 1 - Math.exp(-dt * 2.5)).normalize();
      }
      var back = ph === 'fade' ? 10.5 : 7.0;
      var up = ph === 'fade' ? 3.8 : 2.3;
      desiredPos.copy(patronus.pos)
        .addScaledVector(followDir, -back)
        .add(new THREE.Vector3(-followDir.z * 2.2, up, followDir.x * 2.2));
      desiredLook.copy(patronus.pos);
      camPos.lerp(desiredPos, 1 - Math.exp(-dt * 1.7));
      camLook.lerp(desiredLook, 1 - Math.exp(-dt * 2.8));
    } else if (ph === 'charge' || ph === 'burst' || ph === 'form') {
      desiredPos.set(0.5, 3.1, 11.2);
      desiredLook.set(1.6, 2.2, 1.5);
      camPos.lerp(desiredPos, 1 - Math.exp(-dt * 0.9));
      camLook.lerp(desiredLook, 1 - Math.exp(-dt * 1.4));
    } else {
      // idle: slow breathing drift + gentle pointer parallax
      desiredPos.set(
        Math.sin(t * 0.11) * 1.6 + pointer.x * 0.7,
        3.4 + Math.sin(t * 0.23) * 0.35 - pointer.y * 0.4,
        13 + Math.cos(t * 0.07) * 1.2);
      desiredLook.set(
        Math.sin(t * 0.05) * 1.2 + pointer.x * 1.4,
        3.6 + Math.cos(t * 0.09) * 0.3 - pointer.y * 0.8,
        0);
      camPos.lerp(desiredPos, 1 - Math.exp(-dt * 0.8));
      camLook.lerp(desiredLook, 1 - Math.exp(-dt * 0.8));
    }
    prevPatronusPos.copy(patronus.pos);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  /* ---------- phases -> captions, wand, UI ---------- */

  patronus.onPhase = function (name) {
    if (name === 'charge') {
      UI.caption('Think of your happiest memory…');
    } else if (name === 'burst') {
      UI.caption('EXPECTO PATRONUM!');
    } else if (name === 'form') {
      UI.caption('The ' + UI.selectedAnimal().name + ' answers your call');
    } else if (name === 'run') {
      UI.caption(null);
      wand.visible = false;
    } else if (name === 'fade') {
      UI.caption('The light lingers, then lets go…');
    } else if (name === 'done') {
      UI.caption(null);
      wand.visible = true;
      UI.setCasting(false);
    }
  };

  /* ---------- capture ---------- */

  function capture() {
    renderer.render(scene, camera);
    var url = renderer.domElement.toDataURL('image/png');
    var a = document.createElement('a');
    a.href = url;
    a.download = 'patronus-' + Date.now() + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    UI.flash();
  }

  /* ---------- UI wiring ---------- */

  UI.init({
    onStart: function () {
      AudioSys.init();
      AudioSys.setMuted(UI.isMuted());
    },
    onCast: function (animal) {
      AudioSys.init();
      if (patronus.cast(animal)) {
        UI.setCasting(true);
        UI.recordCast(animal.id);
      }
    },
    onCapture: capture,
    onWeather: applyWeather,
    onMute: function (m) { AudioSys.setMuted(m); }
  });

  /* ---------- resize ---------- */

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------- render loop ---------- */

  var clock = new THREE.Clock();

  // small handle for testing/tinkering from the console
  window.HP = { patronus: patronus, forest: forest, quality: Q, isMobile: isMobile };

  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    forest.update(t, dt);
    patronus.update(t, dt);
    UI.update(dt);
    updateCamera(t, dt);

    // mood: patronus light tints the fog; dementor weather darkens all
    var glow = patronus.intensity;
    fogTmp.copy(dementorOn ? dementorFog : baseFog).lerp(patronusFog, glow * 0.8);
    scene.fog.color.copy(fogTmp);
    scene.fog.density += ((dementorOn ? 0.036 : 0.024) - scene.fog.density) * dt * 0.8;
    forest.moonLight.intensity += ((dementorOn ? 0.6 : 1.25) - forest.moonLight.intensity) * dt * 0.8;
    forest.hemi.intensity = (dementorOn ? 0.45 : 0.75) + glow * 0.25;

    // wand tip glow while charging
    var ph = patronus.phase;
    tipGlow.material.opacity = (ph === 'charge' || ph === 'burst')
      ? Math.min(1, patronus.intensity * 2.5) : 0;
    // subtle idle wand sway
    wand.rotation.z = -0.25 + Math.sin(t * 0.9) * 0.015;
    wand.position.y = -0.78 + Math.sin(t * 1.3) * 0.012;

    renderer.render(scene, camera);
  }
  frame();
})();
