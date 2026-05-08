import React, { useEffect, useRef } from "react";

const W = 480;
const H = 300;
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
  { bg1: "#06080f", bg2: "#0c1020", orb: "#44aaff", wave1: "#2255aa", wave2: "#1133cc", zone: "#88ffcc", miss: "#ff6655" },
  { bg1: "#0a0612", bg2: "#100820", orb: "#cc44ff", wave1: "#6611aa", wave2: "#441188", zone: "#ffcc44", miss: "#ff5544" },
  { bg1: "#060f08", bg2: "#0a1a0c", orb: "#44ff99", wave1: "#116633", wave2: "#0d4422", zone: "#ffee44", miss: "#ff5533" },
  { bg1: "#0f0806", bg2: "#1a0c08", orb: "#ff8844", wave1: "#aa4411", wave2: "#882200", zone: "#44eeff", miss: "#ff3366" },
];

export default function WaveRider({ card, onResult }) {
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
      ripple: 0, // 0 = none, > 0 = active
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
      // orb reaches HIT_ZONE_X at t=0; starts at ORB_START_X at t=-TRAVEL_MS
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
        // Ripple
        ripples.push({ x: HIT_ZONE_X, y: H * 0.52, r: 8, maxR: 40, life: 1, color: palette.zone });
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

    function drawBg(now) {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, palette.bg1);
      grad.addColorStop(1, palette.bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Animated sine waves
      const t = (now - startTime) / 1000;
      for (let wave = 0; wave < 2; wave++) {
        const color = wave === 0 ? palette.wave1 : palette.wave2;
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
      // Glowing vertical bar
      const grad = ctx.createLinearGradient(HIT_ZONE_X - 18, 0, HIT_ZONE_X + 18, 0);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.5, palette.zone + "44");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(HIT_ZONE_X - 18, 40, 36, H * 0.55);

      ctx.strokeStyle = palette.zone + "99";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 16;
      ctx.shadowColor = palette.zone;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(HIT_ZONE_X, 40);
      ctx.lineTo(HIT_ZONE_X, H * 0.58);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    function drawOrbs(now) {
      const elapsed = now - startTime;
      for (const orb of orbs) {
        if (orb.scored || orb.expired) continue;
        // Expire if way past window
        if (elapsed > orb.targetTime + OK_MS + 100) {
          orb.expired = true;
          if (!orb.scored) lateCount++;
          continue;
        }
        const x = getOrbX(orb, now);
        if (x < 0 || x > W + 20) continue;
        const y = H * 0.52;
        const r = 14;
        // Glow more as approaching hit zone
        const distToZone = Math.abs(x - HIT_ZONE_X);
        const glow = Math.max(0, 1 - distToZone / 120) * 20;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, r);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.4, palette.orb);
        grad.addColorStop(1, palette.orb + "44");
        ctx.fillStyle = grad;
        ctx.shadowBlur = 8 + glow;
        ctx.shadowColor = palette.orb;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Beat index label
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "bold 9px system-ui";
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
        ctx.shadowBlur = 8;
        ctx.shadowColor = rp.color;
        ctx.stroke();
        ctx.shadowBlur = 0;
        rp.r += 2.5;
        rp.life -= 0.06;
        if (rp.life <= 0) ripples.splice(i, 1);
      }
    }

    function drawHUD(now) {
      const elapsed = now - startTime;
      const beat = Math.floor((elapsed - LEAD_IN_MS) / intervalMs);
      const progress = (orbs.filter(o => o.scored || o.expired).length) / ORB_COUNT;

      // BPM label
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "11px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`${bpm} BPM`, 18, 22);

      ctx.textAlign = "right";
      ctx.fillText(`Beat ${Math.max(1, Math.min(beat + 1, ORB_COUNT))} / ${ORB_COUNT}`, W - 18, 22);

      // Progress bar
      const barY = H - 14;
      const barW = W - 40;
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.roundRect(20, barY, barW, 5, 2);
      ctx.fill();
      const g = ctx.createLinearGradient(20, 0, 20 + barW, 0);
      g.addColorStop(0, palette.orb);
      g.addColorStop(1, palette.zone);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(20, barY, barW * progress, 5, 2);
      ctx.fill();

      // Score
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${totalPts} pts`, W / 2, 22);

      // Tap hint
      if (elapsed < LEAD_IN_MS) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "12px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Tap SPACE or click when orbs reach the line", W / 2, H / 2);
      }
    }

    function frame(now) {
      drawBg(now);
      drawHitZone();
      drawOrbs(now);
      drawRipples();
      drawHUD(now);

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
