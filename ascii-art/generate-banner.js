/**
 * generate-banner.js
 * 
 * Renders a single high-quality frame of the Vignette Bloom mosaic effect
 * as a static PNG image for use as a GitHub profile banner.
 * 
 * Usage: node generate-banner.js
 * Output: ../assets/ascii-mosaic-banner.png
 * 
 * Requires: npm install canvas
 */

const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
  cellSize: 12,           // Slightly smaller cells for banner crispness
  brightness: 12,
  contrast: 115,
  saturation: 100,
  grayscale: 0,
  tintOpacity: 0,
  tint: "#3ca6ff",
  overlayBlend: "multiply",
  invert: false,
  coverage: 100,
  vignette: { enabled: true, intensity: 38 },
  bloom: { enabled: true, intensity: 25 },
  animTime: 1.2,          // Frozen animation time for a nice wave position
  animSpeed: 100,
  animIntensity: 60,
};

// Output dimensions
const BANNER_W = 1200;
const BANNER_H = 400;

// ═══════════════════════════════════════════════════════════════
// COLOR HELPERS
// ═══════════════════════════════════════════════════════════════
function adjustBrightness(r, g, b, amount) {
  const factor = 1 + amount / 100;
  return [Math.min(255, r * factor), Math.min(255, g * factor), Math.min(255, b * factor)];
}

function adjustContrast(r, g, b, contrastPct) {
  const f = contrastPct / 100;
  return [
    Math.min(255, Math.max(0, ((r / 255 - 0.5) * f + 0.5) * 255)),
    Math.min(255, Math.max(0, ((g / 255 - 0.5) * f + 0.5) * 255)),
    Math.min(255, Math.max(0, ((b / 255 - 0.5) * f + 0.5) * 255)),
  ];
}

function processColor(r, g, b) {
  [r, g, b] = adjustBrightness(r, g, b, CONFIG.brightness);
  [r, g, b] = adjustContrast(r, g, b, CONFIG.contrast);
  return [Math.round(r), Math.round(g), Math.round(b)];
}

// ═══════════════════════════════════════════════════════════════
// GRID SAMPLING
// ═══════════════════════════════════════════════════════════════
function sampleGrid(imgData, w, h, cellSize) {
  const cells = [];
  const d = imgData.data;
  const cols = Math.ceil(w / cellSize);
  const rows = Math.ceil(h / cellSize);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cellSize;
      const y0 = row * cellSize;
      const x1 = Math.min(x0 + cellSize, w);
      const y1 = Math.min(y0 + cellSize, h);
      let rSum = 0, gSum = 0, bSum = 0, count = 0;

      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const idx = (py * w + px) * 4;
          rSum += d[idx]; gSum += d[idx + 1]; bSum += d[idx + 2];
          count++;
        }
      }

      const r = rSum / count;
      const g = gSum / count;
      const b = bSum / count;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      cells.push({ col, row, x: x0, y: y0, r, g, b, lum });
    }
  }
  return cells;
}

// ═══════════════════════════════════════════════════════════════
// WAVE ANIMATION (frozen at a single time point)
// ═══════════════════════════════════════════════════════════════
function getWaveOffset(col, row, time) {
  const speed = CONFIG.animSpeed / 100;
  const intensity = CONFIG.animIntensity / 100;
  const maxOffset = CONFIG.cellSize * 0.3 * intensity;
  const freq = 0.15;
  const phase = (col + row) * freq - time * speed * 2;
  return {
    dx: Math.sin(phase) * maxOffset,
    dy: Math.cos(phase * 0.7 + 0.5) * maxOffset * 0.6,
  };
}

function getWaveScale(col, row, time) {
  const speed = CONFIG.animSpeed / 100;
  const intensity = CONFIG.animIntensity / 100;
  const phase = (col - row) * 0.12 + time * speed * 1.5;
  return 1 + Math.sin(phase) * 0.08 * intensity;
}

function getWaveAlpha(col, row, time) {
  const speed = CONFIG.animSpeed / 100;
  const intensity = CONFIG.animIntensity / 100;
  const phase = (col + row * 0.5) * 0.1 + time * speed * 1.2;
  return 0.85 + Math.sin(phase) * 0.15 * intensity;
}

// ═══════════════════════════════════════════════════════════════
// ROUNDED RECT HELPER
// ═══════════════════════════════════════════════════════════════
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ═══════════════════════════════════════════════════════════════
// VIGNETTE
// ═══════════════════════════════════════════════════════════════
function applyVignette(ctx, w, h, intensity) {
  const strength = intensity / 100;
  const cx = w / 2, cy = h / 2;
  const radius = Math.sqrt(cx * cx + cy * cy);
  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
  gradient.addColorStop(0, `rgba(0,0,0,0)`);
  gradient.addColorStop(0.35, `rgba(0,0,0,${0.05 * strength})`);
  gradient.addColorStop(0.6, `rgba(0,0,0,${0.25 * strength})`);
  gradient.addColorStop(0.8, `rgba(0,0,0,${0.55 * strength})`);
  gradient.addColorStop(1, `rgba(0,0,0,${0.95 * strength})`);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// BLOOM (simplified for node-canvas)
// ═══════════════════════════════════════════════════════════════
function applyBloom(ctx, w, h, intensity) {
  const strength = intensity / 100;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const bloomCanvas = createCanvas(w, h);
  const bCtx = bloomCanvas.getContext("2d");
  const bloomData = bCtx.createImageData(w, h);
  const bd = bloomData.data;

  const threshold = 140;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum > threshold) {
      const t = (lum - threshold) / (255 - threshold);
      bd[i] = d[i] * t;
      bd[i + 1] = d[i + 1] * t;
      bd[i + 2] = d[i + 2] * t;
      bd[i + 3] = 255;
    }
  }
  bCtx.putImageData(bloomData, 0, 0);

  // Simple box blur approximation (node-canvas filter support is limited)
  const blurPasses = Math.round(6 * strength);
  for (let pass = 0; pass < blurPasses; pass++) {
    const src = bCtx.getImageData(0, 0, w, h);
    const sd = src.data;
    const dst = bCtx.createImageData(w, h);
    const dd = dst.data;
    const radius = 3;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rr = 0, gg = 0, bb = 0, aa = 0, cnt = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const idx = (ny * w + nx) * 4;
              rr += sd[idx]; gg += sd[idx + 1]; bb += sd[idx + 2]; aa += sd[idx + 3];
              cnt++;
            }
          }
        }
        const idx = (y * w + x) * 4;
        dd[idx] = rr / cnt;
        dd[idx + 1] = gg / cnt;
        dd[idx + 2] = bb / cnt;
        dd[idx + 3] = aa / cnt;
      }
    }
    bCtx.putImageData(dst, 0, 0);
  }

  // Composite bloom
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.5 * strength + 0.2;
  ctx.drawImage(bloomCanvas, 0, 0);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  const imgPath = path.join(__dirname, "myself.png");
  if (!fs.existsSync(imgPath)) {
    console.error("Error: myself.png not found in", __dirname);
    process.exit(1);
  }

  console.log("Loading source image...");
  const img = await loadImage(imgPath);

  // Compute dimensions — we want a 3:1 banner aspect ratio
  // Crop source to center on face (upper portion)
  const srcAspect = img.width / img.height;
  const bannerAspect = BANNER_W / BANNER_H;

  let sx, sy, sw, sh;
  if (srcAspect > bannerAspect) {
    sh = img.height;
    sw = img.height * bannerAspect;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / bannerAspect;
    sx = 0;
    // Center the face — for a portrait, the face is typically in the upper 30-40%
    // Position so that ~35% of the crop height is above the face center
    const faceCenter = img.height * 0.35;
    sy = Math.max(0, Math.min(img.height - sh, faceCenter - sh * 0.45));
  }

  // Create working canvas at banner size
  const canvas = createCanvas(BANNER_W, BANNER_H);
  const ctx = canvas.getContext("2d");

  // Draw source photo cropped to banner
  const srcCanvas = createCanvas(BANNER_W, BANNER_H);
  const sCtx = srcCanvas.getContext("2d");
  sCtx.drawImage(img, sx, sy, sw, sh, 0, 0, BANNER_W, BANNER_H);
  const sourceData = sCtx.getImageData(0, 0, BANNER_W, BANNER_H);

  console.log("Sampling grid...");
  const cells = sampleGrid(sourceData, BANNER_W, BANNER_H, CONFIG.cellSize);

  console.log(`Rendering ${cells.length} mosaic cells...`);

  // Background
  ctx.fillStyle = "#050706";
  ctx.fillRect(0, 0, BANNER_W, BANNER_H);

  const cs = CONFIG.cellSize;
  const time = CONFIG.animTime;

  const cols = Math.ceil(BANNER_W / cs);
  const rows = Math.ceil(BANNER_H / cs);
  const centerCol = cols / 2;
  const centerRow = rows / 2;
  const maxDist = Math.sqrt(centerCol * centerCol + centerRow * centerRow);

  for (const cell of cells) {
    const { dx, dy } = getWaveOffset(cell.col, cell.row, time);
    const scale = getWaveScale(cell.col, cell.row, time);
    const alpha = getWaveAlpha(cell.col, cell.row, time);

    let [r, g, b] = processColor(cell.r, cell.g, cell.b);
    const lumNorm = cell.lum / 255;

    // Per-cell distance dimming — darkens cells further from center
    const distCol = (cell.col - centerCol) / centerCol;
    const distRow = (cell.row - centerRow) / centerRow;
    const dist = Math.sqrt(distCol * distCol + distRow * distRow);
    const dimFactor = Math.max(0.15, 1 - dist * 0.6);

    // Darken bright background cells (luminance > 0.75 = photo background)
    // Blend them toward the dark theme color
    if (lumNorm > 0.7) {
      const bgBlend = (lumNorm - 0.7) / 0.3; // 0 at 0.7, 1 at 1.0
      const darkR = 12, darkG = 15, darkB = 14;
      r = r * (1 - bgBlend * 0.7) + darkR * (bgBlend * 0.7);
      g = g * (1 - bgBlend * 0.7) + darkG * (bgBlend * 0.7);
      b = b * (1 - bgBlend * 0.7) + darkB * (bgBlend * 0.7);
    }

    // Apply distance dimming
    r *= dimFactor;
    g *= dimFactor;
    b *= dimFactor;

    const fillRatio = 0.75 + lumNorm * 0.2;
    const size = cs * fillRatio * scale;
    const gap = (cs - size) / 2;

    const x = cell.x + gap + dx;
    const y = cell.y + gap + dy;
    const cornerRadius = Math.max(1, size * 0.15);

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0.3, alpha * dimFactor));
    ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

    roundedRect(ctx, x, y, size, size, cornerRadius);
    ctx.fill();

    // Subtle highlight on face-area bright cells (not background-bright)
    if (lumNorm > 0.4 && lumNorm < 0.75) {
      const highlightAlpha = (lumNorm - 0.4) * 0.15;
      ctx.fillStyle = `rgba(255,255,255,${highlightAlpha * alpha})`;
      ctx.fill();
    }

    ctx.restore();
  }

  console.log("Applying post-effects...");

  if (CONFIG.vignette.enabled) {
    applyVignette(ctx, BANNER_W, BANNER_H, CONFIG.vignette.intensity);
  }
  if (CONFIG.bloom.enabled) {
    applyBloom(ctx, BANNER_W, BANNER_H, CONFIG.bloom.intensity);
  }

  // Save
  const outDir = path.join(__dirname, "..", "assets");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "ascii-mosaic-banner.png");
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ Saved banner to: ${outPath}`);
  console.log(`   Size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
