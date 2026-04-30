import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "..", "public", "assets", "card-art");
const WIDTH = 720;
const HEIGHT = 960;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

const themes = [
  {
    name: "winter-endurance",
    top: "#d8f0ff",
    bottom: "#11386f",
    accent: "#2f6fed",
    accent2: "#ecfeff"
  },
  {
    name: "aquatic",
    top: "#bdefff",
    bottom: "#075985",
    accent: "#22c55e",
    accent2: "#38bdf8"
  },
  {
    name: "rhythm-pace",
    top: "#e7fff0",
    bottom: "#12315e",
    accent: "#16a34a",
    accent2: "#3b82f6"
  },
  {
    name: "spatial-timing",
    top: "#d8e2ff",
    bottom: "#0f172a",
    accent: "#3b82f6",
    accent2: "#22c55e"
  },
  {
    name: "control-pressure",
    top: "#ffe6dc",
    bottom: "#131b2e",
    accent: "#e86f51",
    accent2: "#22c55e"
  },
  {
    name: "neutral-signal",
    top: "#eff6ff",
    bottom: "#334155",
    accent: "#94a3b8",
    accent2: "#cbd5e1"
  }
];

await mkdir(outputDir, { recursive: true });

for (const theme of themes) {
  const pixels = renderTheme(theme);
  await writeFile(path.join(outputDir, `${theme.name}.png`), encodePng(WIDTH, HEIGHT, pixels));
  console.log(`Generated ${theme.name}.png`);
}

function renderTheme(theme) {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  const top = hex(theme.top);
  const bottom = hex(theme.bottom);
  const accent = hex(theme.accent);
  const accent2 = hex(theme.accent2);
  const ink = hex("#0f172a");
  const white = hex("#ffffff");

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const v = y / (HEIGHT - 1);
      const radial = Math.max(0, 1 - distance(x, y, WIDTH * 0.62, HEIGHT * 0.3) / 720);
      const base = mix(top, bottom, v * 0.92);
      const glow = mix(base, accent2, radial * 0.16);
      setPixel(pixels, x, y, [...glow, 255]);
    }
  }

  drawGrid(pixels, mix(white, accent2, 0.35), 0.22);
  drawLine(pixels, -60, HEIGHT * 0.48, WIDTH + 80, HEIGHT * 0.34, 44, white, 0.36);
  drawLine(pixels, -80, HEIGHT * 0.56, WIDTH + 60, HEIGHT * 0.67, 52, mix(accent, white, 0.12), 0.45);
  drawLine(pixels, WIDTH * 0.12, -40, WIDTH * 0.88, HEIGHT + 30, 26, mix(accent2, white, 0.18), 0.28);

  if (theme.name === "winter-endurance") {
    mountainBand(pixels, HEIGHT * 0.42, accent2, white, accent);
    drawCircle(pixels, WIDTH * 0.72, HEIGHT * 0.22, 96, white, 0.22);
    drawLine(pixels, WIDTH * 0.16, HEIGHT * 0.78, WIDTH * 0.86, HEIGHT * 0.68, 18, white, 0.42);
  } else if (theme.name === "aquatic") {
    waveBand(pixels, HEIGHT * 0.34, accent2, white, 0.72);
    waveBand(pixels, HEIGHT * 0.64, accent, white, 0.55);
    drawCircle(pixels, WIDTH * 0.78, HEIGHT * 0.22, 118, accent2, 0.2);
  } else if (theme.name === "rhythm-pace") {
    for (let i = 0; i < 7; i += 1) {
      drawCircle(pixels, WIDTH * (0.18 + i * 0.12), HEIGHT * (0.34 + Math.sin(i) * 0.12), 26 + i * 3, accent, 0.2);
    }
    drawLine(pixels, 40, HEIGHT * 0.7, WIDTH - 20, HEIGHT * 0.46, 20, accent2, 0.5);
    drawLine(pixels, 22, HEIGHT * 0.77, WIDTH - 82, HEIGHT * 0.54, 12, white, 0.38);
  } else if (theme.name === "spatial-timing") {
    for (let y = 190; y < 790; y += 120) {
      for (let x = 130; x < 620; x += 120) {
        drawCircle(pixels, x, y, 15, accent2, 0.56);
      }
    }
    drawLine(pixels, 130, 190, 610, 670, 8, accent, 0.52);
    drawLine(pixels, 130, 670, 610, 190, 8, white, 0.34);
  } else if (theme.name === "control-pressure") {
    drawPolygon(pixels, [[90, 220], [370, 130], [650, 330], [470, 520], [150, 460]], accent, 0.56);
    drawPolygon(pixels, [[120, 690], [520, 560], [690, 790], [280, 860]], accent2, 0.45);
    drawLine(pixels, 80, 790, 640, 260, 18, white, 0.34);
  } else {
    drawPolygon(pixels, [[90, 220], [260, 160], [410, 250], [280, 360]], accent2, 0.36);
    drawLine(pixels, 120, 650, 600, 650, 20, accent, 0.36);
    drawCircle(pixels, WIDTH * 0.72, HEIGHT * 0.3, 112, white, 0.18);
  }

  drawCircle(pixels, WIDTH * 0.5, HEIGHT * 0.5, 74, white, 0.2);
  drawCircle(pixels, WIDTH * 0.5, HEIGHT * 0.5, 52, ink, 0.28);
  drawLine(pixels, WIDTH * 0.41, HEIGHT * 0.5, WIDTH * 0.59, HEIGHT * 0.5, 8, white, 0.7);
  drawLine(pixels, WIDTH * 0.5, HEIGHT * 0.41, WIDTH * 0.5, HEIGHT * 0.59, 8, white, 0.7);
  vignette(pixels);

  return pixels;
}

function mountainBand(pixels, baseY, accent2, white, accent) {
  drawPolygon(pixels, [[-20, baseY + 160], [150, baseY - 90], [280, baseY + 160]], white, 0.58);
  drawPolygon(pixels, [[160, baseY + 180], [360, baseY - 150], [570, baseY + 180]], accent2, 0.62);
  drawPolygon(pixels, [[420, baseY + 150], [590, baseY - 60], [780, baseY + 150]], accent, 0.42);
  drawLine(pixels, 48, baseY + 115, 650, baseY + 130, 16, white, 0.38);
}

function waveBand(pixels, centerY, color, white, alpha) {
  const points = [];
  for (let x = -40; x <= WIDTH + 40; x += 40) {
    points.push([x, centerY + Math.sin(x / 62) * 34]);
  }
  for (let i = 1; i < points.length; i += 1) {
    drawLine(pixels, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], 32, color, alpha);
    drawLine(pixels, points[i - 1][0], points[i - 1][1] + 42, points[i][0], points[i][1] + 42, 12, white, 0.28);
  }
}

function drawGrid(pixels, color, alpha) {
  for (let x = 0; x < WIDTH; x += 72) {
    drawLine(pixels, x, 0, x, HEIGHT, 2, color, alpha);
  }
  for (let y = 0; y < HEIGHT; y += 72) {
    drawLine(pixels, 0, y, WIDTH, y, 2, color, alpha);
  }
}

function drawCircle(pixels, cx, cy, radius, color, alpha) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(WIDTH - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(HEIGHT - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const d = distance(x, y, cx, cy);
      if (d <= radius) blendPixel(pixels, x, y, color, alpha * smooth(radius, radius - 2, d));
    }
  }
}

function drawLine(pixels, x1, y1, x2, y2, width, color, alpha) {
  const pad = width + 2;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - pad));
  const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(x1, x2) + pad));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - pad));
  const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(y1, y2) + pad));
  const half = width / 2;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const d = distanceToSegment(x, y, x1, y1, x2, y2);
      if (d <= half) blendPixel(pixels, x, y, color, alpha * smooth(half, half - 2, d));
    }
  }
}

function drawPolygon(pixels, points, color, alpha) {
  const minX = Math.max(0, Math.floor(Math.min(...points.map((p) => p[0]))));
  const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(...points.map((p) => p[0]))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((p) => p[1]))));
  const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(...points.map((p) => p[1]))));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x, y, points)) blendPixel(pixels, x, y, color, alpha);
    }
  }
}

function vignette(pixels) {
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const d = distance(x, y, WIDTH * 0.5, HEIGHT * 0.5) / 650;
      const darkness = Math.max(0, (d - 0.46) * 0.48);
      if (darkness > 0) blendPixel(pixels, x, y, [8, 18, 36], darkness);
    }
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function setPixel(pixels, x, y, rgba) {
  const index = (y * WIDTH + x) * 4;
  pixels[index] = rgba[0];
  pixels[index + 1] = rgba[1];
  pixels[index + 2] = rgba[2];
  pixels[index + 3] = rgba[3];
}

function blendPixel(pixels, x, y, color, alpha) {
  const index = (y * WIDTH + x) * 4;
  const clamped = Math.max(0, Math.min(1, alpha));
  pixels[index] = Math.round(pixels[index] * (1 - clamped) + color[0] * clamped);
  pixels[index + 1] = Math.round(pixels[index + 1] * (1 - clamped) + color[1] * clamped);
  pixels[index + 2] = Math.round(pixels[index + 2] * (1 - clamped) + color[2] * clamped);
  pixels[index + 3] = 255;
}

function hex(value) {
  const clean = value.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16)
  ];
}

function mix(a, b, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t)
  ];
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(px, py, x1, y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return distance(px, py, x1 + t * dx, y1 + t * dy);
}

function smooth(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr(width, height)),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function ihdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
