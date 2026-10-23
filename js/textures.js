// Procedural textures: fabric height maps are drawn on canvas, then converted to normal maps.
import * as THREE from 'three';

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261021);

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Calls fn for every tiled copy of (x, y) that touches the canvas, so textures tile seamlessly.
function wrapDraw(size, x, y, pad, fn) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const X = x + ox, Y = y + oy;
      if (X > -pad && X < size + pad && Y > -pad && Y < size + pad) fn(X, Y);
    }
  }
}

function blurred(src, px) {
  const s = src.width;
  const c = makeCanvas(s);
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${px}px)`;
  for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) ctx.drawImage(src, ox, oy);
  return c;
}

function boucleHeight() {
  const s = 512, c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, s, s);
  ctx.lineCap = 'round';
  for (let i = 0; i < 7500; i++) {
    const x = rand() * s, y = rand() * s, r = 2 + rand() * 4.5;
    const a = rand() * Math.PI * 2, b = a + Math.PI * (1.2 + rand() * 0.7);
    const g = Math.floor(110 + rand() * 145);
    ctx.strokeStyle = `rgb(${g},${g},${g})`;
    ctx.lineWidth = 1.3 + rand() * 1.7;
    wrapDraw(s, x, y, 10, (X, Y) => {
      ctx.beginPath();
      ctx.arc(X, Y, r, a, b);
      ctx.stroke();
    });
  }
  return blurred(c, 0.7);
}

function leatherHeight() {
  const s = 512, c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    const x = rand() * s, y = rand() * s, r = 1.5 + rand() * 4;
    const g = Math.floor(50 + rand() * 160);
    ctx.fillStyle = `rgba(${g},${g},${g},0.2)`;
    wrapDraw(s, x, y, 8, (X, Y) => {
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const soft = blurred(c, 1.6);
  const sctx = soft.getContext('2d');
  sctx.lineWidth = 0.8;
  for (let i = 0; i < 700; i++) {
    const x = rand() * s, y = rand() * s, len = 6 + rand() * 18, a = rand() * Math.PI;
    sctx.strokeStyle = `rgba(30,30,30,${0.15 + rand() * 0.2})`;
    wrapDraw(s, x, y, 30, (X, Y) => {
      sctx.beginPath();
      sctx.moveTo(X, Y);
      sctx.quadraticCurveTo(X + Math.cos(a) * len * 0.5 + 3, Y + Math.sin(a) * len * 0.5 - 3, X + Math.cos(a) * len, Y + Math.sin(a) * len);
      sctx.stroke();
    });
  }
  return blurred(soft, 0.5);
}

function velvetHeight() {
  const s = 256, c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, s, s);
  // large soft "crushed" patches
  for (let i = 0; i < 50; i++) {
    const x = rand() * s, y = rand() * s, r = 20 + rand() * 50, g = rand() > 0.5 ? 255 : 0;
    wrapDraw(s, x, y, r, (X, Y) => {
      const grd = ctx.createRadialGradient(X, Y, 0, X, Y, r);
      grd.addColorStop(0, `rgba(${g},${g},${g},0.12)`);
      grd.addColorStop(1, `rgba(${g},${g},${g},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(X - r, Y - r, r * 2, r * 2);
    });
  }
  const img = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 50;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, img.data[i] + n));
  }
  ctx.putImageData(img, 0, 0);
  return blurred(c, 0.6);
}

function linenHeight() {
  const s = 256, period = 8, c = makeCanvas(s), ctx = c.getContext('2d');
  const img = ctx.createImageData(s, s);
  const rowN = Array.from({ length: s / period }, () => 0.75 + rand() * 0.35);
  const colN = Array.from({ length: s / period }, () => 0.75 + rand() * 0.35);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const cx = Math.floor(x / period), cy = Math.floor(y / period);
      const warp = Math.sin((Math.PI * (x % period + 0.5)) / period) * colN[cx];
      const weft = Math.sin((Math.PI * (y % period + 0.5)) / period) * rowN[cy];
      const over = (cx + cy) % 2 === 0;
      let h = over ? warp * 0.85 + weft * 0.15 : weft * 0.85 + warp * 0.15;
      h += (rand() - 0.5) * 0.12;
      const v = Math.max(0, Math.min(255, h * 230));
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function woodMap() {
  const s = 512, c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 240; i++) {
    const x0 = rand() * s, amp = 2 + rand() * 9, k = 1 + Math.floor(rand() * 3), ph = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(70,40,15,${0.04 + rand() * 0.16})`;
    ctx.lineWidth = 0.5 + rand() * 2.5;
    wrapDraw(s, x0, 0, 40, (X) => {
      ctx.beginPath();
      for (let y = 0; y <= s; y += 8) {
        const x = X + Math.sin((y / s) * Math.PI * 2 * k + ph) * amp;
        y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }
  return c;
}

function contactShadow() {
  const s = 256, c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.filter = 'blur(22px)';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.beginPath();
  ctx.roundRect(s * 0.16, s * 0.16, s * 0.68, s * 0.68, 30);
  ctx.fill();
  return c;
}

function heightToNormal(src, strength) {
  const s = src.width;
  const data = src.getContext('2d').getImageData(0, 0, s, s).data;
  const h = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) h[i] = data[i * 4] / 255;
  const out = makeCanvas(s);
  const octx = out.getContext('2d');
  const img = octx.createImageData(s, s);
  const at = (x, y) => h[((y + s) % s) * s + ((x + s) % s)];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * s + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export function createTextures(renderer, materials) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const heights = {
    boucle: boucleHeight(),
    velvet: velvetHeight(),
    leather: leatherHeight(),
    linen: linenHeight(),
  };
  const strength = { boucle: 3, velvet: 2, leather: 2.5, linen: 3 };
  const normals = {};
  for (const m of materials) {
    const t = new THREE.CanvasTexture(heightToNormal(heights[m.id], strength[m.id]));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(m.repeat, m.repeat);
    t.anisotropy = aniso;
    normals[m.id] = t;
  }
  const wood = new THREE.CanvasTexture(woodMap());
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.anisotropy = aniso;
  const contact = new THREE.CanvasTexture(contactShadow());
  return { heights, normals, wood, contact };
}
