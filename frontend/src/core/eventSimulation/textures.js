import { CanvasTexture, SRGBColorSpace } from "three";

/** 创建正方形 canvas */
function makeCanvas(size) {
	const c = document.createElement("canvas");
	c.width = c.height = size;
	return c;
}

/** 径向渐变纹理 */
function radial(size, stops) {
	const c = makeCanvas(size);
	const ctx = c.getContext("2d");
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	stops.forEach(([o, col]) => g.addColorStop(o, col));
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const t = new CanvasTexture(c);
	t.colorSpace = SRGBColorSpace;
	return t;
}

/** 发光光晕（火球 / 小行星辉光 / 太阳） */
export function glowTexture() {
	return radial(256, [
		[0, "rgba(255,255,255,1)"],
		[0.18, "rgba(255,248,220,0.92)"],
		[0.42, "rgba(255,170,70,0.45)"],
		[0.7, "rgba(255,90,20,0.14)"],
		[1, "rgba(255,60,0,0)"],
	]);
}

/** 火焰纹理（稍尖锐） */
export function fireTexture() {
	return radial(128, [
		[0, "rgba(255,255,230,1)"],
		[0.3, "rgba(255,190,80,0.8)"],
		[0.6, "rgba(255,90,20,0.35)"],
		[1, "rgba(120,20,0,0)"],
	]);
}

/** 程序化烟团：噪声同时调制边缘与内部密度，避免均匀的半透明圆盘。 */
export function smokeTexture() {
  const size = 128, c = makeCanvas(size), ctx = c.getContext("2d"), pixels = ctx.createImageData(size, size);
  const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7 + 73) * 43758.5453; return v - Math.floor(v); };
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y); let u = x - ix, v = y - iy;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v)
      + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, r = Math.hypot(u - .5, v - .5) * 2;
    const n = noise(u * 7, v * 7) * .55 + noise(u * 15, v * 15) * .3 + noise(u * 31, v * 31) * .15;
    const edge = Math.max(0, 1 - r / (.75 + n * .35));
    const alpha = Math.min(1, edge * 3) * (.25 + n * .75), i = (y * size + x) * 4;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = Math.round(190 + n * 65);
    pixels.data[i + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(c); texture.colorSpace = SRGBColorSpace; return texture;
}
