import React, { useEffect, useRef } from "react";

const W = 480;
const H = 380;
const TILE_COUNT = 4;
const ROUND_SEQUENCES = [3, 4, 5, 4];
const TOTAL_ROUNDS = ROUND_SEQUENCES.length;
const PREVIEW_ON_MS = 550;
const PREVIEW_OFF_MS = 200;

function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeSeed(card) {
  const code = card?.stateCode || "XX";
  const hash = code.split("").reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 7);
  return ((Date.now() & 0xffff) ^ hash) >>> 0;
}

const TILES = [
  { id: 0, color: "#ff7766", icon: "star", label: "Coral" },
  { id: 1, color: "#44cccc", icon: "diamond", label: "Teal" },
  { id: 2, color: "#ffcc44", icon: "triangle", label: "Amber" },
  { id: 3, color: "#bb66ff", icon: "circle", label: "Violet" },
];

// Tile layout: 2x2 grid centered
const TILE_SIZE = 110;
const TILE_GAP = 20;
const TILE_RADIUS = 16;
const GRID_X = W / 2 - TILE_SIZE - TILE_GAP / 2;
const GRID_Y = 80;

function getTileRect(i) {
  const col = i % 2;
  const row = Math.floor(i / 2);
  return {
    x: GRID_X + col * (TILE_SIZE + TILE_GAP),
    y: GRID_Y + row * (TILE_SIZE + TILE_GAP),
    w: TILE_SIZE,
    h: TILE_SIZE,
  };
}

function drawIcon(ctx, icon, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 0;
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

export default function GridMemory({ card, onResult }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const seed = makeSeed(card);
    const rng = makeRng(seed);

    const doneRef = { current: false };
    let rafId = 0;
    const startTime = performance.now();

    // Generate all sequences
    const sequences = ROUND_SEQUENCES.map(len =>
      Array.from({ length: len }, () => Math.floor(rng() * TILE_COUNT))
    );

    let round = 0;
    let phase = "preview"; // "preview" | "input"
    let previewIndex = 0;
    let previewPhaseStart = performance.now() + 600; // short delay before first preview
    let inputStep = 0;
    let misses = 0;

    // Visual state per tile
    const tileState = Array.from({ length: TILE_COUNT }, () => ({
      lit: false,
      litUntil: 0,
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
      const color = TILES[tileId].color;
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
          color,
        });
      }
    }

    function startPreview(now) {
      phase = "preview";
      previewIndex = 0;
      previewPhaseStart = now;
      phaseLabel = "Watch";
    }

    function startInput() {
      phase = "input";
      inputStep = 0;
      phaseLabel = "Your turn";
    }

    function advancePreview(now) {
      // Light up tile previewIndex
      const seq = sequences[round];
      if (previewIndex < seq.length) {
        const tileId = seq[previewIndex];
        tileState[tileId].lit = true;
        tileState[tileId].litUntil = now + PREVIEW_ON_MS;
      }
    }

    function handleClick(e) {
      if (doneRef.current || phase !== "input") return;
      const rect = canvas.getBoundingClientRect();
      const sx = W / rect.width;
      const cx = (e.clientX - rect.left) * sx;
      const cy = (e.clientY - rect.top) * sx;

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
              // Round complete
              round++;
              if (round >= TOTAL_ROUNDS) {
                doneRef.current = true;
                const label = misses === 0 ? "cleanly" : misses <= 3 ? "with a few resets" : "with extra scouting";
                setTimeout(() => onResult({
                  type: "pattern_scout",
                  summary: `You completed all ${TOTAL_ROUNDS} patterns ${label} with ${misses} wrong taps.`,
                  patternLabel: label,
                  misses,
                }), 600);
              } else {
                // Start next round preview
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
            redTintAlpha = 0.35;
            inputStep = 0; // Reset to start of sequence for this round
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

    // Start first preview shortly
    startPreview(startTime);

    function drawBg() {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#080810");
      grad.addColorStop(1, "#10101e");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    function drawTiles(now) {
      for (let i = 0; i < TILE_COUNT; i++) {
        const tr = getTileRect(i);
        const tile = TILES[i];
        const ts = tileState[i];

        const isLit = ts.lit && ts.litUntil > now;
        const greenFlash = ts.greenFlash > 0;

        ctx.save();
        ctx.shadowBlur = isLit ? 24 : greenFlash ? 20 : 6;
        ctx.shadowColor = greenFlash ? "#44ff88" : isLit ? tile.color : tile.color + "55";

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

        const baseAlpha = isLit ? "ee" : greenFlash ? "cc" : "44";
        ctx.fillStyle = tile.color + baseAlpha;
        ctx.fill();

        // Border
        ctx.strokeStyle = isLit ? tile.color : tile.color + "88";
        ctx.lineWidth = isLit ? 2.5 : 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Icon
        const iconAlpha = isLit ? 1 : greenFlash ? 0.95 : 0.55;
        ctx.globalAlpha = iconAlpha;
        drawIcon(ctx, tile.icon, tr.x + tr.w / 2, tr.y + tr.h / 2, 22, isLit || greenFlash ? "#ffffff" : tile.color);
        ctx.globalAlpha = 1;

        // Decrement green flash
        if (ts.greenFlash > 0) ts.greenFlash--;
        // Expire lit
        if (ts.lit && ts.litUntil <= now) ts.lit = false;

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
        ctx.shadowBlur = 5;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
      }
      ctx.globalAlpha = 1;
    }

    function drawHUD() {
      // Phase label
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 15px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(phaseLabel, W / 2, 38);

      // Round dots
      const dotSpacing = 28;
      const startX = W / 2 - (TOTAL_ROUNDS - 1) * dotSpacing / 2;
      for (let i = 0; i < TOTAL_ROUNDS; i++) {
        const x = startX + i * dotSpacing;
        const y = 60;
        ctx.beginPath();
        ctx.arc(x, y, i === round ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = i < round ? "#44ff88" : i === round ? "#ffffff" : "rgba(255,255,255,0.2)";
        ctx.shadowBlur = i === round ? 8 : 0;
        ctx.shadowColor = "#ffffff";
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Sequence progress if in input phase
      if (phase === "input" && round < TOTAL_ROUNDS) {
        const seq = sequences[round];
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "11px system-ui";
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
            ? TILES[seq[i]].color
            : i === inputStep
            ? "rgba(255,255,255,0.8)"
            : "rgba(255,255,255,0.2)";
          ctx.fill();
        }
      }

      // Misses
      if (misses > 0) {
        ctx.fillStyle = "rgba(255,100,100,0.7)";
        ctx.font = "11px system-ui";
        ctx.textAlign = "right";
        ctx.fillText(`Resets: ${misses}`, W - 18, H - 12);
      }
    }

    function frame(now) {
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

      drawBg();
      drawTiles(now);
      drawParticles();

      // Red tint on wrong
      if (redTintAlpha > 0) {
        ctx.fillStyle = `rgba(255,40,40,${redTintAlpha})`;
        ctx.fillRect(-10, -10, W + 20, H + 20);
        redTintAlpha = Math.max(0, redTintAlpha - 0.025);
      }

      drawHUD();
      ctx.restore();

      // Preview phase logic
      if (phase === "preview" && round < TOTAL_ROUNDS) {
        const seq = sequences[round];
        const elapsed = now - previewPhaseStart;
        const stepDuration = PREVIEW_ON_MS + PREVIEW_OFF_MS;
        const currentPreviewIndex = Math.floor(elapsed / stepDuration);

        if (currentPreviewIndex !== previewIndex && currentPreviewIndex < seq.length) {
          previewIndex = currentPreviewIndex;
          advancePreview(now);
        } else if (previewIndex === 0 && elapsed >= 0 && elapsed < stepDuration) {
          // Trigger first step
          if (!tileState[seq[0]].lit) {
            advancePreview(now);
          }
        }

        if (elapsed >= seq.length * stepDuration + 200) {
          startInput();
        }
      }

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
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
