import React, { useEffect, useRef } from "react";

const ORB_COUNT = 14;
const LEAD_IN_MS = 1200;
const TRAVEL_MS = 1300;
const HIT_ZONE_X = 70;
const ORB_START_X = 460;
const PERFECT_MS = 60;
const GOOD_MS = 130;
const OK_MS = 220;
const BPM_OPTIONS = [65, 72, 80, 88];

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

export default function WaveRider({ card, onResult }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect0 = canvas.getBoundingClientRect();
    const W = rect0.width || 480;
    const H = rect0.height || 300;
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
    const bpm = BPM_OPTIONS[Math.floor(rng() * BPM_OPTIONS.length)];
    const intervalMs = (60 / bpm) * 1000;

    const doneRef = { current: false };
    let rafId = 0;
    const startTime = performance.now();

    // Build orbs: targetTime = beat_index * intervalMs + LEAD_IN_MS
    const orbs = Array.from({ length: ORB_COUNT }, (_, i) => ({
      index: i,
      targetTime: LEAD_IN_MS + i * intervalMs,
      scored: false,
      expired: false,
      score: 0,
      errorMs: 0,
      ripple: 0,
      rippleAlpha: 0,
      missFlash: false,
      missFlashTimer: 0,
    }));

    let totalPts = 0;
    let lateCount = 0;
    let errorSum = 0;
    let scoredCount = 0;

    const ripples = [];

    function getOrbX(orb, now) {
      const elapsed = now - startTime;
      const t = elapsed - orb.targetTime;
      const progress = (t + TRAVEL_MS) / TRAVEL_MS;
      return ORB_START_X + (HIT_ZONE_X - ORB_START_X) * progress;
    }

    function handleInput() {
      if (doneRef.current) return;
      const now = performance.now();
      const elapsed = now - startTime;

      let best = null;
      let bestErr = Infinity;
      for (const orb of orbs) {
        if (orb.scored || orb.expired) continue;
        const err = Math.abs(elapsed - orb.targetTime);
        if (err < OK_MS && err < bestErr) {
          bestErr = err;
          best = orb;
        }
      }

      if (best) {
        best.scored = true;
        const err = Math.abs(elapsed - best.targetTime);
        const late = elapsed > best.targetTime;
        const pts = err <= PERFECT_MS ? 10 : err <= GOOD_MS ? 7 : 4;
        best.score = pts;
        best.errorMs = Math.round(err);
        totalPts += pts;
        errorSum += err;
        scoredCount++;
        if (late) lateCount++;
        ripples.push({ x: HIT_ZONE_X, y: H * 0.52, r: 8, maxR: 40, life: 1, color: pal.hit });
      }
    }

    function onKey(e) {
      if (e.code === "Space") { e.preventDefault(); handleInput(); }
    }
    function onClick() { handleInput(); }
    function onTouch(e) { e.preventDefault(); handleInput(); }

    window.addEventListener("keydown", onKey);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });

    function drawWaves(now) {
      // Animated sine waves layered on top of the bg hills
      const t = (now - startTime) / 1000;
      for (let wave = 0; wave < 2; wave++) {
        const color = wave === 0 ? pal.hill1 : pal.hill2;
        const yBase = H * 0.6 + wave * 12;
        const amp = 14 - wave * 4;
        const freq = 0.025 + wave * 0.01;
        const phase = t * (1.2 + wave * 0.4) * (wave === 0 ? 1 : -1);
        ctx.beginPath();
        ctx.moveTo(0, yBase);
        for (let x = 0; x <= W; x += 3) {
          ctx.lineTo(x, yBase + Math.sin(x * freq + phase) * amp);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fillStyle = color + "66";
        ctx.fill();
      }
    }

    function drawHitZone() {
      // Flat vertical bar indicator
      ctx.fillStyle = pal.hit + "22";
      ctx.fillRect(HIT_ZONE_X - 18, 40, 36, H * 0.55);

      ctx.strokeStyle = pal.hit + "99";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(HIT_ZONE_X, 40);
      ctx.lineTo(HIT_ZONE_X, H * 0.58);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawOrbs(now) {
      const elapsed = now - startTime;
      for (const orb of orbs) {
        if (orb.scored || orb.expired) continue;
        if (elapsed > orb.targetTime + OK_MS + 100) {
          orb.expired = true;
          if (!orb.scored) lateCount++;
          continue;
        }
        const x = getOrbX(orb, now);
        if (x < 0 || x > W + 20) continue;
        const y = H * 0.52;
        const r = 14;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = pal.primary;
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Beat index label
        ctx.fillStyle = pal.text;
        ctx.font = `bold 9px ${labelFont}`;
        ctx.textAlign = "center";
        ctx.fillText(orb.index + 1, x, y + 4);
      }
    }

    function drawRipples() {
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle = rp.color + Math.round(rp.life * 200).toString(16).padStart(2, "0");
        ctx.lineWidth = 2;
        ctx.stroke();
        rp.r += 2.5;
        rp.life -= 0.06;
        if (rp.life <= 0) ripples.splice(i, 1);
      }
    }

    function drawHUD(now) {
      const elapsed = now - startTime;
      const beat = Math.floor((elapsed - LEAD_IN_MS) / intervalMs);
      const progress = (orbs.filter(o => o.scored || o.expired).length) / ORB_COUNT;

      ctx.fillStyle = pal.text;
      ctx.font = `11px ${labelFont}`;
      ctx.textAlign = "left";
      ctx.fillText(`${bpm} BPM`, 18, 22);

      ctx.textAlign = "right";
      ctx.fillText(`Beat ${Math.max(1, Math.min(beat + 1, ORB_COUNT))} / ${ORB_COUNT}`, W - 18, 22);

      // Progress bar
      const barY = H - 14;
      const barW = W - 40;
      ctx.fillStyle = "rgba(44,58,46,0.12)";
      ctx.beginPath();
      ctx.roundRect(20, barY, barW, 5, 2);
      ctx.fill();
      ctx.fillStyle = pal.primary;
      ctx.beginPath();
      ctx.roundRect(20, barY, barW * progress, 5, 2);
      ctx.fill();

      // Score
      ctx.fillStyle = pal.text;
      ctx.font = `bold 13px ${labelFont}`;
      ctx.textAlign = "center";
      ctx.fillText(`${totalPts} pts`, W / 2, 22);

      // Tap hint
      if (elapsed < LEAD_IN_MS) {
        ctx.fillStyle = pal.muted;
        ctx.font = `12px ${labelFont}`;
        ctx.textAlign = "center";
        ctx.fillText("Tap SPACE or click when orbs reach the line", W / 2, H / 2);
      }
    }

    function frame(now) {
      drawBg(ctx, W, H, pal);
      drawWaves(now);
      drawHitZone();
      drawOrbs(now);
      drawRipples();
      drawHUD(now);

      // Grain overlay
      ctx.globalAlpha = 0.07;
      ctx.drawImage(grain, 0, 0, W, H);
      ctx.globalAlpha = 1;

      const allDone = orbs.every(o => o.scored || o.expired);
      const lastOrbTime = orbs[ORB_COUNT - 1].targetTime + OK_MS + 500;
      const elapsed = now - startTime;

      if ((allDone || elapsed > lastOrbTime + 500) && !doneRef.current) {
        doneRef.current = true;
        const pct = Math.round(Math.min(100, Math.max(0, (totalPts / (ORB_COUNT * 10)) * 100)));
        const avgErr = scoredCount > 0 ? Math.round(errorSum / scoredCount) : 0;
        const adapt = Math.min(100, Math.max(0, 100 - lateCount * 8));
        const label = pct >= 85 ? "steady" : pct >= 70 ? "mostly steady" : pct >= 50 ? "variable" : "hard to settle";
        setTimeout(() => onResult({
          type: "cadence_keeper",
          summary: `Your rhythm was ${label}: ${pct}% sync at ${bpm} BPM with ~${avgErr}ms average offset.`,
          rhythmLabel: label,
          stabilityScore: pct,
          averageErrorMs: avgErr,
          adaptationScore: adapt,
          metrics: [
            { label: "Rhythm", value: `${pct}%` },
            { label: "Avg offset", value: `${avgErr}ms` },
            { label: "BPM", value: `${bpm}` },
          ],
          conditionBreakdown: [],
        }), 400);
        return;
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("click", onClick);
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
