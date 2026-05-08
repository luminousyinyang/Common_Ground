import React, { useEffect, useRef } from "react";

const WAYPOINT_COUNT = 8;
const MARGIN = 70;
const STAR_R = 22;

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

function drawStarPath(ctx, cx, cy, r, points = 5) {
  const innerR = r * 0.42;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : innerR;
    if (i === 0) ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    else ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  ctx.closePath();
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

export default function StarPath({ card, onResult }) {
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

    const doneRef = { current: false };
    let rafId = 0;
    let redFlashTimer = 0;
    let detours = 0;
    let currentStep = 0;
    const startTime = performance.now();

    // Generate waypoint positions (no overlap)
    const waypoints = [];
    const minDist = 80;
    let attempts = 0;
    while (waypoints.length < WAYPOINT_COUNT && attempts < 2000) {
      attempts++;
      const x = MARGIN + rng() * (W - MARGIN * 2);
      const y = MARGIN + rng() * (H - 80 - MARGIN * 2);
      let ok = true;
      for (const w of waypoints) {
        if (Math.hypot(x - w.x, y - w.y) < minDist) { ok = false; break; }
      }
      if (ok) {
        waypoints.push({ x, y, visited: false });
      }
    }

    const bursts = [];

    function spawnBurst(x, y, color) {
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 * i) / 10 + rng() * 0.3;
        const speed = 1.5 + rng() * 3;
        bursts.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.04 + rng() * 0.03,
          r: 2 + rng() * 2,
          color,
        });
      }
    }

    function handleClick(e) {
      if (doneRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      for (let i = 0; i < waypoints.length; i++) {
        const w = waypoints[i];
        const dist = Math.hypot(cx - w.x, cy - w.y);
        if (dist <= STAR_R + 8) {
          if (i === currentStep) {
            // Correct
            w.visited = true;
            spawnBurst(w.x, w.y, pal.accent);
            currentStep++;
            if (currentStep >= WAYPOINT_COUNT && !doneRef.current) {
              doneRef.current = true;
              const label = detours <= 1 ? "clean" : detours <= 4 ? "steady" : "exploratory";
              setTimeout(() => onResult({
                type: "precision_trace",
                summary: `You traced the star path ${label}: ${detours} wrong taps.`,
                traceLabel: label,
                detours,
              }), 500);
            }
          } else {
            // Wrong
            detours++;
            redFlashTimer = 18;
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

    function drawPath() {
      if (waypoints.length < 2) return;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = pal.muted + "80";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(waypoints[0].x, waypoints[0].y);
      for (let i = 1; i < waypoints.length; i++) {
        ctx.lineTo(waypoints[i].x, waypoints[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawWaypoints(now) {
      const t = (now - startTime) / 600;
      for (let i = 0; i < waypoints.length; i++) {
        const w = waypoints[i];
        const isActive = i === currentStep;
        const isVisited = w.visited;

        let scale = 1;
        let alpha = 0.55;
        let fillColor = pal.secondary;

        if (isVisited) {
          alpha = 0.5;
          fillColor = pal.muted;
        } else if (isActive) {
          scale = 1 + Math.sin(t * 3) * 0.12;
          alpha = 1;
          fillColor = pal.primary;
        }

        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;

        drawStarPath(ctx, 0, 0, STAR_R);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = pal.text + "55";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Number label
        ctx.globalAlpha = isVisited ? 0.5 : 0.9;
        ctx.fillStyle = pal.text;
        ctx.font = `bold ${isActive ? "13px" : "11px"} ${labelFont}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i + 1, 0, 1);
        ctx.textBaseline = "alphabetic";

        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    function drawBursts() {
      for (let i = bursts.length - 1; i >= 0; i--) {
        const p = bursts[i];
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= p.decay;
        if (p.life <= 0) bursts.splice(i, 1);
      }
      ctx.globalAlpha = 1;
    }

    function drawHUD() {
      ctx.fillStyle = pal.text;
      ctx.font = `bold 12px ${labelFont}`;
      ctx.textAlign = "left";
      ctx.fillText(`Step ${Math.min(currentStep + 1, WAYPOINT_COUNT)} of ${WAYPOINT_COUNT}`, 18, 22);

      ctx.textAlign = "right";
      ctx.fillText(`Wrong taps: ${detours}`, W - 18, 22);

      // Progress dots at bottom
      const dotSpacing = 22;
      const totalDotW = WAYPOINT_COUNT * dotSpacing;
      const startX = W / 2 - totalDotW / 2 + dotSpacing / 2;
      for (let i = 0; i < WAYPOINT_COUNT; i++) {
        const x = startX + i * dotSpacing;
        const y = H - 16;
        const filled = i < currentStep;
        const active = i === currentStep;
        ctx.beginPath();
        ctx.arc(x, y, active ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = filled
          ? pal.primary
          : active
          ? pal.accent
          : pal.muted + "66";
        ctx.fill();
      }
    }

    function frame(now) {
      drawBg(ctx, W, H, pal);

      if (redFlashTimer > 0) {
        ctx.fillStyle = `rgba(180,60,40,${(redFlashTimer / 18) * 0.3})`;
        ctx.fillRect(0, 0, W, H);
        redFlashTimer--;
      }

      drawPath();
      drawWaypoints(now);
      drawBursts();
      drawHUD();

      // Grain overlay
      ctx.globalAlpha = 0.07;
      ctx.drawImage(grain, 0, 0, W, H);
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(frame);
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
