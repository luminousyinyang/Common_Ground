import React, { useEffect, useRef } from "react";

const W = 480;
const H = 340;
const TOTAL_TARGETS = 13;
const GOOD_COUNT = 10;
const DECOY_COUNT = 3;
const LIFESPAN_MS = 1600;

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

const PALETTES = [
  { bg1: "#0a0a1a", bg2: "#101030", outer: "#4466ff", mid: "#88aaff", bull: "#ccddff", accent: "#ffdd44" },
  { bg1: "#0d1a0d", bg2: "#102010", outer: "#22cc66", mid: "#66ee99", bull: "#ccffdd", accent: "#ffcc22" },
  { bg1: "#1a0a10", bg2: "#200810", outer: "#ff4488", mid: "#ff88bb", bull: "#ffccdd", accent: "#44ddff" },
  { bg1: "#100a1a", bg2: "#180820", outer: "#cc44ff", mid: "#ee88ff", bull: "#f0ccff", accent: "#44ffcc" },
];

export default function TargetBurst({ card, onResult }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const seed = makeSeed(card);
    const rng = makeRng(seed);
    const palette = PALETTES[Math.floor(rng() * PALETTES.length)];

    const doneRef = { current: false };
    let rafId = 0;
    let startTime = performance.now();

    // Build targets
    const types = [];
    for (let i = 0; i < GOOD_COUNT; i++) types.push("good");
    for (let i = 0; i < DECOY_COUNT; i++) types.push("decoy");
    // Shuffle
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }

    const delays = [];
    let acc = 0;
    for (let i = 0; i < TOTAL_TARGETS; i++) {
      acc += 400 + Math.floor(rng() * 281); // 400-680ms stagger
      delays.push(acc);
    }

    const targets = types.map((type, i) => {
      const margin = 60;
      const x = margin + rng() * (W - margin * 2);
      const y = margin + rng() * (H - 80 - margin * 2);
      const maxR = 36 + rng() * 18;
      return { type, x, y, maxR, delay: delays[i], state: "waiting", hitScore: 0, hitTime: 0 };
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
      const progress = Math.min(elapsed / LIFESPAN_MS, 1);
      return progress * target.maxR;
    }

    function handleClick(e) {
      if (doneRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const sx = W / rect.width;
      const cx = (e.clientX - rect.left) * sx;
      const cy = (e.clientY - rect.top) * sx;
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
        spawnParticles(nearest.x, nearest.y, palette.bull, 14);
      } else {
        decoyHits++;
        earnedPts = Math.max(0, earnedPts - 5);
        spawnParticles(nearest.x, nearest.y, "#ff4444", 8);
      }
    }

    canvas.addEventListener("click", handleClick);

    function drawBg() {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, palette.bg1);
      grad.addColorStop(1, palette.bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    function drawTarget(t, now) {
      const r = getRadius(t, now);
      if (r <= 0) return;
      const elapsed = now - startTime - t.delay;
      const progress = elapsed / LIFESPAN_MS;
      const alpha = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1;

      if (t.type === "good") {
        // Outer ring
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `${palette.outer}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = palette.outer;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Mid ring
        if (r > 8) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, r * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = `${palette.mid}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 8;
          ctx.shadowColor = palette.mid;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        // Bull
        if (r > 4) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, r * 0.28, 0, Math.PI * 2);
          ctx.fillStyle = `${palette.bull}${Math.round(alpha * 200).toString(16).padStart(2, "0")}`;
          ctx.shadowBlur = 12;
          ctx.shadowColor = palette.bull;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else {
        // Decoy: red X ring
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,40,40,${alpha * 0.9})`;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ff2222";
        ctx.stroke();
        ctx.shadowBlur = 0;
        // X
        const xSize = r * 0.55;
        ctx.strokeStyle = `rgba(255,80,80,${alpha})`;
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
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }

    function drawProgressBar(active, total) {
      const barW = W - 40;
      const barH = 6;
      const x = 20;
      const y = H - 18;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 3);
      ctx.fill();
      const prog = (total - active) / total;
      const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
      grad.addColorStop(0, palette.outer);
      grad.addColorStop(1, palette.accent);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW * prog, barH, 3);
      ctx.fill();
    }

    function frame(now) {
      const elapsed = now - startTime;
      drawBg();

      let activeCount = 0;
      let waitingCount = 0;

      for (const t of targets) {
        const tElapsed = elapsed - t.delay;
        if (t.state === "waiting") {
          if (tElapsed >= 0) t.state = "active";
          else waitingCount++;
        }
        if (t.state === "active") {
          if (tElapsed >= LIFESPAN_MS) {
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
      drawProgressBar(TOTAL_TARGETS - finishedTargets, TOTAL_TARGETS);

      // Score HUD
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`Score: ${earnedPts}`, 20, 20);
      ctx.textAlign = "right";
      ctx.fillText(`Hits: ${hits}/${GOOD_COUNT}`, W - 20, 20);

      const allDone = targets.every(t => t.state === "hit" || t.state === "expired");
      if (allDone && particles.length === 0 && !doneRef.current) {
        doneRef.current = true;
        const pct = Math.round(Math.min(100, Math.max(0, (earnedPts / (GOOD_COUNT * 10)) * 100)));
        const decoyAvoided = DECOY_COUNT - decoyHits;
        const result = {
          type: "reaction_grid",
          summary: `You hit ${hits} of ${GOOD_COUNT} targets and avoided ${decoyAvoided} of ${DECOY_COUNT} decoys. Precision: ${pct}%.`,
          precisionScore: pct,
          hits,
          misses,
          metrics: [
            { label: "Precision", value: `${pct}%` },
            { label: "Targets hit", value: `${hits}/${GOOD_COUNT}` },
            { label: "Decoys avoided", value: `${decoyAvoided}/${DECOY_COUNT}` },
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
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
