/* Patronus animals: canvas silhouettes (side view, facing right),
   point-cloud sampling, and per-animal motion/sound configs.
   Global: ANIMALS */
(function () {
  'use strict';

  var W = 320, H = 240;

  function E(ctx, cx, cy, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tapered limb from (x1,y1) w1 wide to (x2,y2) w2 wide, rounded ends.
  function limb(ctx, x1, y1, x2, y2, w1, w2) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    var px = -dy / len, py = dx / len;
    ctx.beginPath();
    ctx.moveTo(x1 + px * w1 / 2, y1 + py * w1 / 2);
    ctx.lineTo(x2 + px * w2 / 2, y2 + py * w2 / 2);
    ctx.lineTo(x2 - px * w2 / 2, y2 - py * w2 / 2);
    ctx.lineTo(x1 - px * w1 / 2, y1 - py * w1 / 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.arc(x1, y1, w1 / 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x2, y2, w2 / 2, 0, Math.PI * 2); ctx.fill();
  }

  // Two-segment leg: hip -> knee -> foot.
  function leg(ctx, hx, hy, kx, ky, fx, fy, wTop, wMid) {
    limb(ctx, hx, hy, kx, ky, wTop, wMid);
    limb(ctx, kx, ky, fx, fy, wMid, wMid * 0.55);
  }

  function strokePath(ctx, lw, fn) {
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    fn(ctx);
    ctx.stroke();
  }

  var drawFns = {

    stag: function (ctx) {
      E(ctx, 150, 128, 60, 32, -0.06);                 // body
      limb(ctx, 196, 120, 230, 70, 34, 18);            // neck
      E(ctx, 238, 62, 16, 11, 0.35);                   // head
      limb(ctx, 248, 66, 268, 74, 11, 4);              // snout
      limb(ctx, 230, 50, 218, 36, 8, 2);               // ear
      strokePath(ctx, 4.5, function (c) {              // antlers
        c.moveTo(242, 50); c.quadraticCurveTo(238, 24, 254, 8);
        c.moveTo(241, 36); c.lineTo(258, 27);
        c.moveTo(245, 22); c.lineTo(263, 16);
        c.moveTo(238, 48); c.quadraticCurveTo(219, 24, 202, 10);
        c.moveTo(226, 31); c.lineTo(212, 20);
        c.moveTo(216, 22); c.lineTo(200, 24);
      });
      leg(ctx, 185, 140, 212, 178, 236, 208, 16, 8);   // front, reaching
      leg(ctx, 178, 145, 168, 186, 148, 200, 14, 7);   // front, tucked
      leg(ctx, 118, 138, 88, 178, 58, 208, 20, 8);     // rear, extended
      leg(ctx, 112, 145, 96, 192, 84, 224, 18, 8);     // rear, under
      limb(ctx, 92, 108, 78, 96, 10, 3);               // tail
    },

    doe: function (ctx) {
      E(ctx, 152, 130, 56, 28, -0.06);
      limb(ctx, 194, 122, 226, 74, 28, 15);
      E(ctx, 234, 66, 14, 10, 0.35);
      limb(ctx, 243, 70, 260, 77, 9, 4);
      limb(ctx, 227, 54, 214, 34, 7, 2);               // ears (two)
      limb(ctx, 234, 52, 229, 30, 7, 2);
      leg(ctx, 186, 142, 210, 178, 232, 206, 14, 7);
      leg(ctx, 178, 146, 168, 186, 150, 200, 12, 6);
      leg(ctx, 120, 140, 92, 178, 64, 206, 17, 7);
      leg(ctx, 114, 146, 98, 192, 88, 222, 15, 7);
      limb(ctx, 96, 112, 82, 100, 9, 3);
    },

    horse: function (ctx) {
      E(ctx, 152, 126, 68, 36, -0.04);
      limb(ctx, 202, 116, 244, 58, 40, 22);
      E(ctx, 252, 54, 17, 10, 0.45);
      limb(ctx, 262, 60, 280, 70, 10, 5);
      limb(ctx, 246, 42, 240, 28, 7, 2);
      strokePath(ctx, 10, function (c) {               // mane
        c.moveTo(238, 42); c.quadraticCurveTo(214, 64, 198, 94);
      });
      strokePath(ctx, 12, function (c) {               // tail
        c.moveTo(86, 108); c.quadraticCurveTo(56, 130, 44, 168);
      });
      strokePath(ctx, 8, function (c) {
        c.moveTo(84, 114); c.quadraticCurveTo(58, 138, 52, 176);
      });
      leg(ctx, 192, 140, 222, 178, 250, 204, 18, 9);
      leg(ctx, 184, 146, 172, 190, 152, 204, 16, 8);
      leg(ctx, 120, 136, 90, 176, 60, 204, 24, 10);
      leg(ctx, 114, 146, 100, 196, 88, 228, 20, 9);
    },

    dog: function (ctx) {
      E(ctx, 150, 142, 55, 28, -0.05);
      limb(ctx, 192, 134, 216, 100, 26, 17);
      E(ctx, 226, 92, 15, 12, 0.2);
      limb(ctx, 238, 96, 258, 102, 10, 5);
      E(ctx, 219, 79, 6, 13, -0.45);                   // floppy ear
      strokePath(ctx, 8, function (c) {                // tail, curled up
        c.moveTo(100, 128); c.quadraticCurveTo(76, 102, 80, 76);
      });
      leg(ctx, 180, 152, 204, 182, 226, 204, 13, 6);
      leg(ctx, 172, 156, 162, 190, 146, 202, 12, 6);
      leg(ctx, 122, 150, 98, 180, 74, 202, 16, 7);
      leg(ctx, 116, 156, 104, 194, 96, 218, 14, 6);
    },

    wolf: function (ctx) {
      E(ctx, 150, 134, 60, 29, -0.03);
      limb(ctx, 196, 128, 224, 108, 26, 18);           // head low, hunting
      E(ctx, 234, 102, 16, 11, 0.12);
      limb(ctx, 246, 104, 268, 109, 9, 4);
      limb(ctx, 228, 88, 221, 70, 8, 2);               // pointed ears
      limb(ctx, 238, 88, 236, 70, 8, 2);
      limb(ctx, 94, 128, 52, 138, 12, 14);             // bushy tail
      limb(ctx, 52, 138, 26, 146, 14, 4);
      leg(ctx, 184, 144, 210, 176, 234, 200, 14, 7);
      leg(ctx, 176, 148, 164, 186, 146, 198, 13, 6);
      leg(ctx, 120, 140, 94, 174, 66, 198, 18, 8);
      leg(ctx, 114, 148, 100, 190, 92, 216, 15, 7);
    },

    otter: function (ctx) {
      E(ctx, 150, 146, 72, 25, -0.10);                 // long low body
      E(ctx, 196, 130, 42, 22, -0.28);                 // arched shoulders
      E(ctx, 240, 108, 14, 11, 0.15);                  // head
      limb(ctx, 250, 112, 264, 116, 8, 4);             // muzzle
      limb(ctx, 80, 158, 30, 182, 20, 5);              // thick tail
      limb(ctx, 190, 148, 200, 176, 10, 5);            // stubby legs
      limb(ctx, 170, 156, 176, 182, 10, 5);
      limb(ctx, 120, 160, 112, 186, 11, 5);
      limb(ctx, 140, 162, 140, 188, 10, 5);
    },

    raven: function (ctx) {
      E(ctx, 165, 140, 42, 17, -0.12);                 // body
      E(ctx, 202, 126, 12, 9, 0.1);                    // head
      ctx.beginPath();                                 // beak
      ctx.moveTo(212, 124); ctx.lineTo(230, 130); ctx.lineTo(210, 133);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();                                 // tail wedge
      ctx.moveTo(130, 146); ctx.lineTo(84, 168); ctx.lineTo(96, 136);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();                                 // far wing
      ctx.moveTo(146, 132);
      ctx.quadraticCurveTo(112, 92, 86, 40);
      ctx.quadraticCurveTo(110, 70, 124, 92);
      ctx.quadraticCurveTo(136, 110, 160, 124);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();                                 // near wing
      ctx.moveTo(168, 126);
      ctx.quadraticCurveTo(186, 78, 208, 38);
      ctx.quadraticCurveTo(184, 72, 174, 92);
      ctx.quadraticCurveTo(166, 108, 182, 118);
      ctx.closePath(); ctx.fill();
      limb(ctx, 160, 152, 148, 160, 5, 2);             // tucked feet
    },

    phoenix: function (ctx) {
      E(ctx, 160, 132, 44, 20, -0.12);
      E(ctx, 202, 114, 12, 9, 0.1);
      ctx.beginPath();                                 // beak
      ctx.moveTo(212, 112); ctx.lineTo(230, 120); ctx.lineTo(209, 122);
      ctx.closePath(); ctx.fill();
      strokePath(ctx, 4, function (c) {                // crest
        c.moveTo(204, 104); c.quadraticCurveTo(214, 86, 224, 80);
        c.moveTo(200, 102); c.quadraticCurveTo(206, 84, 210, 74);
      });
      ctx.beginPath();                                 // far wing, flame-edged
      ctx.moveTo(142, 126);
      ctx.quadraticCurveTo(104, 84, 70, 26);
      ctx.lineTo(88, 46);
      ctx.quadraticCurveTo(96, 70, 88, 84);
      ctx.quadraticCurveTo(106, 88, 104, 102);
      ctx.quadraticCurveTo(126, 112, 152, 120);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();                                 // near wing
      ctx.moveTo(170, 118);
      ctx.quadraticCurveTo(196, 70, 216, 26);
      ctx.lineTo(220, 48);
      ctx.quadraticCurveTo(206, 76, 210, 88);
      ctx.quadraticCurveTo(192, 96, 196, 108);
      ctx.quadraticCurveTo(182, 114, 178, 118);
      ctx.closePath(); ctx.fill();
      strokePath(ctx, 8, function (c) {                // tail plumes
        c.moveTo(120, 140); c.quadraticCurveTo(80, 168, 38, 176);
      });
      strokePath(ctx, 7, function (c) {
        c.moveTo(122, 144); c.quadraticCurveTo(90, 184, 52, 206);
      });
      strokePath(ctx, 6, function (c) {
        c.moveTo(126, 146); c.quadraticCurveTo(104, 194, 78, 220);
      });
    }
  };

  var LIST = [
    { id: 'stag',    name: 'Stag',    kind: 'run', sound: 'hooves',  speed: 9.0,  gait: 8.0, bob: 0.32, length: 4.3 },
    { id: 'doe',     name: 'Doe',     kind: 'run', sound: 'hooves',  speed: 8.5,  gait: 8.5, bob: 0.30, length: 3.7 },
    { id: 'horse',   name: 'Horse',   kind: 'run', sound: 'hooves',  speed: 10.0, gait: 7.5, bob: 0.36, length: 4.7 },
    { id: 'dog',     name: 'Dog',     kind: 'run', sound: 'paws',    speed: 8.0,  gait: 9.0, bob: 0.30, length: 3.2 },
    { id: 'wolf',    name: 'Wolf',    kind: 'run', sound: 'paws',    speed: 9.2,  gait: 8.5, bob: 0.30, length: 3.8 },
    { id: 'otter',   name: 'Otter',   kind: 'run', sound: 'chitter', speed: 6.5,  gait: 7.0, bob: 0.50, length: 2.9, undulate: true },
    { id: 'raven',   name: 'Raven',   kind: 'fly', sound: 'wings',   speed: 8.0,  flap: 7.0, length: 3.0, flyH: 3.2 },
    { id: 'phoenix', name: 'Phoenix', kind: 'fly', sound: 'wings',   speed: 7.0,  flap: 3.2, length: 4.5, flyH: 3.8, majestic: true }
  ];

  function drawSilhouette(animal) {
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    drawFns[animal.id](ctx);
    return c;
  }

  // Sample `count` points from the silhouette interior.
  // Returns { pos, leg, wing, phase, groundOffset } — pos in local units,
  // x forward (facing +x), y up, z thin depth.
  function samplePoints(animal, count) {
    var c = drawSilhouette(animal);
    var data = c.getContext('2d').getImageData(0, 0, W, H).data;
    var px = [];
    var minX = W, maxX = 0, minY = H, maxY = 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > 40) {
          px.push(x, y);
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    var n = px.length / 2;
    var L = animal.length;
    var cxMid = (minX + maxX) / 2;
    // Belly line: below it points count as legs (runners).
    var bellyY = minY + (maxY - minY) * 0.62;
    // Shoulder line: above it points count as wings (flyers).
    var shoulderY = minY + (maxY - minY) * 0.45;

    var pos = new Float32Array(count * 3);
    var legF = new Float32Array(count);
    var wingF = new Float32Array(count);
    var phase = new Float32Array(count);
    var lowest = Infinity;

    for (var i = 0; i < count; i++) {
      var k = (Math.random() * n) | 0;
      var sx = px[k * 2] + (Math.random() - 0.5) * 1.4;
      var sy = px[k * 2 + 1] + (Math.random() - 0.5) * 1.4;
      var x3 = (sx - W / 2) / W * L;
      var y3 = (H / 2 - sy) / W * L;
      var z3 = (Math.random() * 2 - 1) * 0.065 * L;
      pos[i * 3] = x3; pos[i * 3 + 1] = y3; pos[i * 3 + 2] = z3;
      if (y3 < lowest) lowest = y3;
      if (animal.kind === 'run') {
        legF[i] = Math.max(0, Math.min(1, (sy - bellyY) / (maxY - bellyY || 1)));
      } else {
        wingF[i] = Math.max(0, Math.min(1, (shoulderY - sy) / (shoulderY - minY || 1)));
      }
      phase[i] = sx > cxMid ? 0 : Math.PI;
    }
    return { pos: pos, leg: legF, wing: wingF, phase: phase, groundOffset: -lowest };
  }

  // Glowing icon for the selection cards.
  function makeIcon(animal, w, h, color) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.scale(w / W, h / H);
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    drawFns[animal.id](ctx);
    return c;
  }

  window.ANIMALS = {
    list: LIST,
    byId: function (id) {
      for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
      return LIST[0];
    },
    samplePoints: samplePoints,
    makeIcon: makeIcon
  };
})();
