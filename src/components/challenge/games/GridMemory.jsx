import React, { useEffect, useRef } from "react";

const TILE_COUNT = 4;
const ROUND_SEQUENCES = [3, 4, 5, 4];
const TOTAL_ROUNDS = ROUND_SEQUENCES.length;
const PREVIEW_ON_MS = 550;
const PREVIEW_OFF_MS = 200;
const PREVIEW_START_DELAY_MS = 300;

function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeRandomSeedPart() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0] >>> 0;
  }
  const highResolutionTime = Math.floor((globalThis.performance?.now?.() || 0) * 1000);
  return ((Date.now() >>> 0) ^ highResolutionTime ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function makeSeed(card) {
  const code = card?.stateCode || "XX";
  const hash = code.split("").reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 7);
  return (makeRandomSeedPart() ^ Math.imul(hash, 2654435761) ^ (Date.now() >>> 0)) >>> 0;
}

function shuffledCopy(items, rng) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function makeSequence(length, rng) {
  const sequence = [];
  let previous = -1;
  for (let i = 0; i < length; i++) {
    let tileId = Math.floor(rng() * TILE_COUNT);
    if (tileId === previous) {
      tileId = (tileId + 1 + Math.floor(rng() * (TILE_COUNT - 1))) % TILE_COUNT;
    }
    sequence.push(tileId);
    previous = tileId;
  }
  return sequence;
}

const PALETTES = [
  { bg:"#EDE8DF", hill1:"#7A9E7E", hill2:"#A8C4A8", blob:"#D4C48A", dots:"#5A7A5E",
    primary:"#C8543C", secondary:"#6B8C6E", accent:"#D4A850", text:"#2C3A2E", muted:"#7A8A7E", hit:"#4A7A9B" },
  { bg:"#F0E8DC", hill1:"#C8634C", hill2:"#E0A090", blob:"#E8D4A8", dots:"#B84030",
    primary:"#4A7A9B", secondary:"#C8634C", accent:"#E8B860", text:"#2A1E18", muted:"#8A6A60", hit:"#7A9E4A" },
  { bg:"#E4ECF0", hill1:"#5B8FA8", hill2:"#8BB8D0", blob:"#C8D8B0", dots:"#3A6A88",
    primary:"#2C5F7A", secondary:"#7A9E4A", accent:"#D48C40", text:"#1A2C38", muted:"#5A7888", hit:"#C8543C" },
  { bg:"#EDEAE2", hill1:"#8BA888", hill2:"#BCC8B4", blob:"#D8A87A", dots:"#6A8A68",
    primary:"#C47840", secondary:"#4A7A6A", accent:"#8BA888", text:"#28241C", muted:"#6A7060", hit:"#5B8FA8" },
];

// Earthy tile colors: terracotta, dusty blue, amber, sage
const TILE_COLORS = ["#C8543C", "#5B8FA8", "#D4A850", "#7A9E7E"];

const TILES = [
  { id: 0, color: TILE_COLORS[0], icon: "star",     label: "Terracotta" },
  { id: 1, color: TILE_COLORS[1], icon: "diamond",  label: "Blue" },
  { id: 2, color: TILE_COLORS[2], icon: "triangle", label: "Amber" },
  { id: 3, color: TILE_COLORS[3], icon: "circle",   label: "Sage" },
];

// Tile layout: 2x2 grid centered
const TILE_SIZE = 110;
const TILE_GAP = 20;
const TILE_RADIUS = 16;
const GRID_Y = 80;

function drawIcon(ctx, icon, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  if (icon === "star") {
    const r = size;
    const ir = r * 0.42;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : ir;
      if (i === 0) ctx.moveTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
      else ctx.lineTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
    }
    ctx.closePath();
    ctx.fill();
  } else if (icon === "diamond") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.75, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size * 0.75, cy);
    ctx.closePath();
    ctx.fill();
  } else if (icon === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.9, cy + size * 0.75);
    ctx.lineTo(cx - size * 0.9, cy + size * 0.75);
    ctx.closePath();
    ctx.fill();
  } else if (icon === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Grain texture generated once
function buildGrain(w, h) {
  const oc = document.createElement("canvas");
  oc.width = w; oc.height = h;
  const oc2 = oc.getContext("2d");
  const id = oc2.createImageData(w, h);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 22;
  }
  oc2.putImageData(id, 0, 0);
  return oc;
}

// Organic landscape background
function drawBg(ctx, w, h, pal) {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);

  // Bottom hill layer 1 (back)
  ctx.fillStyle = pal.hill2;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.bezierCurveTo(w * 0.1, h * 0.74, w * 0.3, h * 0.88, w * 0.52, h * 0.80);
  ctx.bezierCurveTo(w * 0.72, h * 0.72, w * 0.88, h * 0.84, w, h * 0.76);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

  // Bottom hill layer 2 (front)
  ctx.fillStyle = pal.hill1;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.bezierCurveTo(w * 0.18, h * 0.84, w * 0.42, h * 0.96, w * 0.65, h * 0.90);
  ctx.bezierCurveTo(w * 0.82, h * 0.85, w * 0.92, h * 0.94, w, h * 0.88);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

  // Top-right blob accent
  ctx.fillStyle = pal.blob + "99";
  ctx.beginPath();
  ctx.ellipse(w * 0.88, h * 0.14, w * 0.13, h * 0.11, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Dot grid (top-left area)
  ctx.fillStyle = pal.dots + "66";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      ctx.beginPath();
      ctx.arc(w * 0.06 + c * 10, h * 0.12 + r * 10, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export default function GridMemory({ card, onResult }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect0 = canvas.getBoundingClientRect();
    const W = rect0.width || 480;
    const H = rect0.height || 380;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const displayFont = getComputedStyle(document.documentElement).getPropertyValue('--display-font').trim() || 'system-ui';
    const labelFont = getComputedStyle(document.documentElement).getPropertyValue('--label-font').trim() || 'system-ui';
    const GRID_X = W / 2 - TILE_SIZE - TILE_GAP / 2;
    const getTileRect = (i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return {
        x: GRID_X + col * (TILE_SIZE + TILE_GAP),
        y: GRID_Y + row * (TILE_SIZE + TILE_GAP),
        w: TILE_SIZE,
        h: TILE_SIZE,
      };
    };

    const grain = buildGrain(W, H);

    const seed = makeSeed(card);
    const rng = makeRng(seed);
    const pal = PALETTES[Math.floor(rng() * PALETTES.length)];
    const tiles = shuffledCopy(TILES, rng);

    const doneRef = { current: false };
    let rafId = 0;
    const startTime = performance.now();

    const sequences = shuffledCopy(ROUND_SEQUENCES, rng).map((length) => makeSequence(length, rng));

    let round = 0;
    let phase = "preview";
    let previewPhaseStart = performance.now() + PREVIEW_START_DELAY_MS;
    let inputStep = 0;
    let misses = 0;

    // Visual state per tile
    const tileState = Array.from({ length: TILE_COUNT }, () => ({
      greenFlash: 0,
    }));

    let screenShakeFrames = 0;
    let screenShakeOffset = { x: 0, y: 0 };
    let redTintAlpha = 0;
    let particles = [];
    let phaseLabel = "Watch";

    function spawnParticles(tileId) {
      const rect = getTileRect(tileId);
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 * i) / 10 + rng() * 0.3;
        const speed = 1.5 + rng() * 3;
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.045 + rng() * 0.03,
          r: 2 + rng() * 2.5,
          color: pal.accent,
        });
      }
    }

    function startPreview(now) {
      phase = "preview";
      previewPhaseStart = now + PREVIEW_START_DELAY_MS;
      phaseLabel = "Watch";
    }

    function startInput() {
      phase = "input";
      inputStep = 0;
      phaseLabel = "Your turn";
    }

    function getPreviewTileId(now) {
      if (phase !== "preview" || round >= TOTAL_ROUNDS) return null;
      const seq = sequences[round];
      const elapsed = now - previewPhaseStart;
      if (elapsed < 0) return null;

      const stepDuration = PREVIEW_ON_MS + PREVIEW_OFF_MS;
      const currentPreviewIndex = Math.floor(elapsed / stepDuration);
      if (currentPreviewIndex < 0 || currentPreviewIndex >= seq.length) return null;

      const stepElapsed = elapsed - currentPreviewIndex * stepDuration;
      return stepElapsed < PREVIEW_ON_MS ? seq[currentPreviewIndex] : null;
    }

    function updatePreview(now) {
      if (phase !== "preview" || round >= TOTAL_ROUNDS) return;
      const seq = sequences[round];
      const stepDuration = PREVIEW_ON_MS + PREVIEW_OFF_MS;
      const elapsed = now - previewPhaseStart;
      if (elapsed >= seq.length * stepDuration + 200) startInput();
    }

    function handleClick(e) {
      if (doneRef.current || phase !== "input") return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      for (let i = 0; i < TILE_COUNT; i++) {
        const tr = getTileRect(i);
        if (cx >= tr.x && cx <= tr.x + tr.w && cy >= tr.y && cy <= tr.y + tr.h) {
          const seq = sequences[round];
          if (i === seq[inputStep]) {
            // Correct
            tileState[i].greenFlash = 12;
            spawnParticles(i);
            inputStep++;
            if (inputStep >= seq.length) {
              round++;
              if (round >= TOTAL_ROUNDS) {
                doneRef.current = true;
                const label = misses === 0 ? "cleanly" : misses <= 3 ? "with a few resets" : "with extra scouting";
                const patternScore = Math.max(0, Math.min(100, 100 - misses * 12));
                setTimeout(() => onResult({
                  type: "pattern_scout",
                  summary: `You completed all ${TOTAL_ROUNDS} patterns ${label} with ${misses} wrong taps.`,
                  patternLabel: label,
                  patternScore,
                  misses,
                  metrics: [
                    { label: "Pattern score", value: `${patternScore}%` },
                    { label: "Resets", value: `${misses}` },
                    { label: "Rounds", value: `${TOTAL_ROUNDS}` },
                  ],
                }), 600);
              } else {
                setTimeout(() => {
                  startPreview(performance.now());
                }, 800);
                phase = "transition";
                phaseLabel = "Round " + (round + 1);
              }
            }
          } else {
            // Wrong
            misses++;
            screenShakeFrames = 6;
            redTintAlpha = 0.25;
            inputStep = 0;
          }
          return;
        }
      }
    }

    function onTouch(e) {
      e.preventDefault();
      if (e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        handleClick({ clientX: t.clientX, clientY: t.clientY });
      }
    }

    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });

    startPreview(startTime);

    function drawTiles(now, previewTileId) {
      for (let i = 0; i < TILE_COUNT; i++) {
        const tr = getTileRect(i);
        const tile = tiles[i];
        const ts = tileState[i];

        const isLit = previewTileId === i;
        const greenFlash = ts.greenFlash > 0;

        ctx.save();

        // Rounded rect fill
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(tr.x, tr.y, tr.w, tr.h, TILE_RADIUS);
        } else {
          const r = TILE_RADIUS;
          ctx.moveTo(tr.x + r, tr.y);
          ctx.lineTo(tr.x + tr.w - r, tr.y);
          ctx.quadraticCurveTo(tr.x + tr.w, tr.y, tr.x + tr.w, tr.y + r);
          ctx.lineTo(tr.x + tr.w, tr.y + tr.h - r);
          ctx.quadraticCurveTo(tr.x + tr.w, tr.y + tr.h, tr.x + tr.w - r, tr.y + tr.h);
          ctx.lineTo(tr.x + r, tr.y + tr.h);
          ctx.quadraticCurveTo(tr.x, tr.y + tr.h, tr.x, tr.y + tr.h - r);
          ctx.lineTo(tr.x, tr.y + r);
          ctx.quadraticCurveTo(tr.x, tr.y, tr.x + r, tr.y);
          ctx.closePath();
        }

        // Fill: lit = full color, greenFlash = accent tint, inactive = semi-transparent
        if (isLit) {
          ctx.fillStyle = tile.color + "EE";
        } else if (greenFlash) {
          ctx.fillStyle = tile.color + "CC";
        } else {
          ctx.fillStyle = tile.color + "88";
        }
        ctx.fill();

        // Border
        ctx.strokeStyle = isLit ? tile.color : tile.color + "88";
        ctx.lineWidth = isLit ? 2.5 : 1.5;
        ctx.stroke();

        // Icon
        const iconAlpha = isLit ? 1 : greenFlash ? 0.95 : 0.55;
        ctx.globalAlpha = iconAlpha;
        drawIcon(ctx, tile.icon, tr.x + tr.w / 2, tr.y + tr.h / 2, 22, isLit || greenFlash ? "#ffffff" : tile.color);
        ctx.globalAlpha = 1;

        // Decrement green flash
        if (ts.greenFlash > 0) ts.greenFlash--;

        ctx.restore();
      }
    }

    function drawParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
      }
      ctx.globalAlpha = 1;
    }

    function drawHUD() {
      // Phase label
      ctx.fillStyle = pal.text;
      ctx.font = `bold 15px ${displayFont}`;
      ctx.textAlign = "center";
      ctx.fillText(phaseLabel, W / 2, 38);

      // Round indicator dots
      const dotSpacing = 28;
      const startX = W / 2 - (TOTAL_ROUNDS - 1) * dotSpacing / 2;
      for (let i = 0; i < TOTAL_ROUNDS; i++) {
        const x = startX + i * dotSpacing;
        const y = 60;
        ctx.beginPath();
        ctx.arc(x, y, i === round ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = i < round ? pal.primary : i === round ? pal.accent : pal.muted + "55";
        ctx.fill();
      }

      // Sequence progress if in input phase
      if (phase === "input" && round < TOTAL_ROUNDS) {
        const seq = sequences[round];
        ctx.fillStyle = pal.muted;
        ctx.font = `11px ${labelFont}`;
        ctx.textAlign = "center";
        ctx.fillText(`${inputStep} / ${seq.length} correct`, W / 2, H - 30);

        const stepSpacing = 18;
        const stepsStartX = W / 2 - (seq.length - 1) * stepSpacing / 2;
        for (let i = 0; i < seq.length; i++) {
          const x = stepsStartX + i * stepSpacing;
          const y = H - 14;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = i < inputStep
            ? pal.accent
            : i === inputStep
            ? pal.primary
            : pal.muted + "55";
          ctx.fill();
        }
      }

      // Misses
      if (misses > 0) {
        ctx.fillStyle = pal.muted;
        ctx.font = `11px ${labelFont}`;
        ctx.textAlign = "right";
        ctx.fillText(`Resets: ${misses}`, W - 18, H - 12);
      }
    }

    function frame(now) {
      updatePreview(now);
      const previewTileId = getPreviewTileId(now);

      // Screen shake
      if (screenShakeFrames > 0) {
        screenShakeOffset.x = (rng() - 0.5) * 8;
        screenShakeOffset.y = (rng() - 0.5) * 8;
        screenShakeFrames--;
      } else {
        screenShakeOffset.x = 0;
        screenShakeOffset.y = 0;
      }

      ctx.save();
      ctx.translate(screenShakeOffset.x, screenShakeOffset.y);

      drawBg(ctx, W, H, pal);
      drawTiles(now, previewTileId);
      drawParticles();

      // Red tint on wrong (earthy tone)
      if (redTintAlpha > 0) {
        ctx.fillStyle = `rgba(180,60,40,${redTintAlpha})`;
        ctx.fillRect(-10, -10, W + 20, H + 20);
        redTintAlpha = Math.max(0, redTintAlpha - 0.025);
      }

      drawHUD();
      ctx.restore();

      // Grain overlay
      ctx.globalAlpha = 0.07;
      ctx.drawImage(grain, 0, 0, W, H);
      ctx.globalAlpha = 1;

      if (!doneRef.current) {
        rafId = requestAnimationFrame(frame);
      }
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("touchend", onTouch);
    };
  }, [card, onResult]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Grid memory challenge game canvas"
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
