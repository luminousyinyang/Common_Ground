import React, { useEffect, useRef } from "react";

const GOOD_COUNT_OPTIONS = [9, 10, 11];
const DECOY_COUNT_OPTIONS = [3, 4];
const MIN_LIFESPAN_MS = 1350;
const LIFESPAN_VARIANCE_MS = 520;
const MIN_STAGGER_MS = 330;
const STAGGER_VARIANCE_MS = 300;

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

function randomChoice(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function makeSeed(card) {
  const code = card?.stateCode || "XX";
  const hash = code.split("").reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 7);
  return (makeRandomSeedPart() ^ Math.imul(hash, 2654435761) ^ (Date.now() >>> 0)) >>> 0;
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

export default function TargetBurst({ card, onResult }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect0 = canvas.getBoundingClientRect();
    const W = rect0.width || 480;
    const H = rect0.height || 340;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const displayFont = getComputedStyle(document.documentElement).getPropertyValue('--display-font').trim() || 'system-ui';
    const labelFont = getComputedStyle(document.documentElement).getPropertyValue('--label-font').trim() || 'system-ui';

    const grain = buildGrain(W, H);

    const seed = makeSeed(card);
    const rng = makeRng(seed);
    const pal = PALETTES[Math.floor(rng() * PALETTES.length)];
    const goodCount = randomChoice(GOOD_COUNT_OPTIONS, rng);
    const decoyCount = randomChoice(DECOY_COUNT_OPTIONS, rng);
    const totalTargets = goodCount + decoyCount;
    const lifespanMs = MIN_LIFESPAN_MS + Math.floor(rng() * LIFESPAN_VARIANCE_MS);
    const staggerBaseMs = MIN_STAGGER_MS + Math.floor(rng() * 120);
    const staggerVarianceMs = 180 + Math.floor(rng() * STAGGER_VARIANCE_MS);

    const doneRef = { current: false };
    let rafId = 0;
    let startTime = performance.now();

    // Build targets
    const types = [];
    for (let i = 0; i < goodCount; i++) types.push("good");
    for (let i = 0; i < decoyCount; i++) types.push("decoy");
    // Shuffle
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }

    const delays = [];
    let acc = 220 + Math.floor(rng() * 260);
    for (let i = 0; i < totalTargets; i++) {
      acc += staggerBaseMs + Math.floor(rng() * staggerVarianceMs);
      delays.push(acc);
    }

    const targets = [];
    types.forEach((type, i) => {
      const maxR = 36 + rng() * 18;
      const margin = Math.max(56, maxR + 16);
      const playTop = 54;
      const playBottom = Math.max(playTop + 120, H - 58);
      let x = margin + rng() * Math.max(1, W - margin * 2);
      let y = playTop + rng() * Math.max(1, playBottom - playTop);

      for (let attempt = 0; attempt < 22; attempt++) {
        const nextX = margin + rng() * Math.max(1, W - margin * 2);
        const nextY = playTop + rng() * Math.max(1, playBottom - playTop);
        const clear = targets.every((target) => {
          if (Math.abs(delays[i] - target.delay) > lifespanMs * 0.6) return true;
          return Math.hypot(nextX - target.x, nextY - target.y) > maxR + target.maxR + 24;
        });
        if (clear) {
          x = nextX;
          y = nextY;
          break;
        }
      }

      targets.push({ type, x, y, maxR, delay: delays[i], state: "waiting", hitScore: 0, hitTime: 0 });
    });

    let hits = 0;
    let misses = 0;
    let decoyHits = 0;
    let earnedPts = 0;

    const particles = [];

    function spawnParticles(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + rng() * 0.5;
        const speed = 2 + rng() * 4;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.03 + rng() * 0.03,
          r: 2 + rng() * 3,
          color,
        });
      }
    }

    function getRadius(target, now) {
      const elapsed = now - startTime - target.delay;
      if (elapsed < 0) return 0;
      const progress = Math.min(elapsed / lifespanMs, 1);
      return progress * target.maxR;
    }

    function handleClick(e) {
      if (doneRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const now = performance.now();

      let nearest = null;
      let nearestDist = Infinity;
      for (const t of targets) {
        if (t.state !== "active") continue;
        const r = getRadius(t, now);
        const dist = Math.hypot(cx - t.x, cy - t.y);
        if (dist < r && dist < nearestDist) {
          nearestDist = dist;
          nearest = t;
        }
      }

      if (!nearest) return;

      nearest.state = "hit";
      nearest.hitTime = now;

      if (nearest.type === "good") {
        const ratio = nearestDist / nearest.maxR;
        const pts = ratio <= 0.25 ? 10 : ratio <= 0.6 ? 6 : 3;
        nearest.hitScore = pts;
        earnedPts += pts;
        hits++;
        spawnParticles(nearest.x, nearest.y, pal.primary, 14);
      } else {
        decoyHits++;
        earnedPts = Math.max(0, earnedPts - 5);
        spawnParticles(nearest.x, nearest.y, "#B84030", 8);
      }
    }

    canvas.addEventListener("click", handleClick);

    function drawTarget(t, now) {
      const r = getRadius(t, now);
      if (r <= 0) return;
      const elapsed = now - startTime - t.delay;
      const progress = elapsed / lifespanMs;
      const alpha = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1;

      if (t.type === "good") {
        // Outer ring
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = pal.primary + Math.round(alpha * 255).toString(16).padStart(2, "0");
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // Mid ring
        if (r > 8) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, r * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = pal.accent + Math.round(alpha * 255).toString(16).padStart(2, "0");
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        // Bull
        if (r > 4) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, r * 0.28, 0, Math.PI * 2);
          ctx.fillStyle = pal.primary + Math.round(alpha * 200).toString(16).padStart(2, "0");
          ctx.fill();
        }
      } else {
        // Decoy: X ring
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(184,64,48,${alpha * 0.9})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // X
        const xSize = r * 0.55;
        ctx.strokeStyle = `rgba(184,64,48,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.x - xSize, t.y - xSize);
        ctx.lineTo(t.x + xSize, t.y + xSize);
        ctx.moveTo(t.x + xSize, t.y - xSize);
        ctx.lineTo(t.x - xSize, t.y + xSize);
        ctx.stroke();
      }
    }

    function drawParticles() {
      for (const p of particles) {
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawProgressBar(active, total) {
      const barW = W - 40;
      const barH = 6;
      const x = 20;
      const y = H - 18;
      ctx.fillStyle = "rgba(44,58,46,0.12)";
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 3);
      ctx.fill();
      const prog = (total - active) / total;
      ctx.fillStyle = pal.primary;
      ctx.beginPath();
      ctx.roundRect(x, y, barW * prog, barH, 3);
      ctx.fill();
    }

    function frame(now) {
      const elapsed = now - startTime;
      drawBg(ctx, W, H, pal);

      let activeCount = 0;
      let waitingCount = 0;

      for (const t of targets) {
        const tElapsed = elapsed - t.delay;
        if (t.state === "waiting") {
          if (tElapsed >= 0) t.state = "active";
          else waitingCount++;
        }
        if (t.state === "active") {
          if (tElapsed >= lifespanMs) {
            t.state = "expired";
            if (t.type === "good") misses++;
          } else {
            activeCount++;
          }
        }
      }

      // Draw active targets
      for (const t of targets) {
        if (t.state === "active") drawTarget(t, now);
      }

      // Update + draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
      }
      drawParticles();

      const finishedTargets = targets.filter(t => t.state === "hit" || t.state === "expired").length;
      drawProgressBar(totalTargets - finishedTargets, totalTargets);

      // Score HUD
      ctx.fillStyle = pal.text;
      ctx.font = `bold 13px ${labelFont}`;
      ctx.textAlign = "left";
      ctx.fillText(`Score: ${earnedPts}`, 20, 20);
      ctx.textAlign = "right";
      ctx.fillText(`Hits: ${hits}/${goodCount}`, W - 20, 20);

      // Grain overlay
      ctx.globalAlpha = 0.07;
      ctx.drawImage(grain, 0, 0, W, H);
      ctx.globalAlpha = 1;

      const allDone = targets.every(t => t.state === "hit" || t.state === "expired");
      if (allDone && particles.length === 0 && !doneRef.current) {
        doneRef.current = true;
        const pct = Math.round(Math.min(100, Math.max(0, (earnedPts / (goodCount * 10)) * 100)));
        const decoyAvoided = decoyCount - decoyHits;
        const result = {
          type: "reaction_grid",
          summary: `You hit ${hits} of ${goodCount} targets and avoided ${decoyAvoided} of ${decoyCount} decoys. Precision: ${pct}%.`,
          precisionScore: pct,
          hits,
          misses,
          metrics: [
            { label: "Precision", value: `${pct}%` },
            { label: "Targets hit", value: `${hits}/${goodCount}` },
            { label: "Decoys avoided", value: `${decoyAvoided}/${decoyCount}` },
          ],
          conditionBreakdown: [],
        };
        setTimeout(() => onResult(result), 400);
        return;
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("click", handleClick);
    };
  }, [card, onResult]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Target burst challenge game canvas"
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
