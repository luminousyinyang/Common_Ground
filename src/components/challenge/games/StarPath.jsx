import React, { useEffect, useRef } from "react";

const W = 480;
const H = 340;
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

export default function StarPath({ card, onResult }) {
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
        const hue = (waypoints.length / WAYPOINT_COUNT) * 360;
        waypoints.push({ x, y, hue, visited: false });
      }
    }

    // Static background stars
    const bgStars = Array.from({ length: 40 }, () => ({
      x: rng() * W,
      y: rng() * H,
      r: 0.5 + rng() * 1.5,
      alpha: 0.2 + rng() * 0.5,
    }));

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
      const sx = W / rect.width;
      const cx = (e.clientX - rect.left) * sx;
      const cy = (e.clientY - rect.top) * sx;

      // Check if clicked on the current target (step = currentStep)
      for (let i = 0; i < waypoints.length; i++) {
        const w = waypoints[i];
        const dist = Math.hypot(cx - w.x, cy - w.y);
        if (dist <= STAR_R + 8) {
          if (i === currentStep) {
            // Correct
            w.visited = true;
            spawnBurst(w.x, w.y, `hsl(${w.hue}, 100%, 70%)`);
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
            redFlashTimer = 18; // ~0.3s at 60fps
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

    function drawBg() {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#06080f");
      grad.addColorStop(1, "#0c1220");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    function drawBgStars() {
      for (const s of bgStars) {
        ctx.globalAlpha = s.alpha;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawPath() {
      if (waypoints.length < 2) return;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "rgba(200,210,255,0.3)";
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
        const hsl = `hsl(${w.hue}, 80%, 65%)`;

        let scale = 1;
        let glowSize = 6;
        let alpha = 0.55;

        if (isVisited) {
          alpha = 0.3;
          glowSize = 3;
        } else if (isActive) {
          scale = 1 + Math.sin(t * 3) * 0.12;
          glowSize = 14 + Math.sin(t * 3) * 6;
          alpha = 1;
        }

        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;

        ctx.shadowBlur = glowSize;
        ctx.shadowColor = hsl;
        drawStarPath(ctx, 0, 0, STAR_R);
        ctx.fillStyle = hsl;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Number label
        ctx.globalAlpha = isVisited ? 0.3 : 0.9;
        ctx.fillStyle = isVisited ? "rgba(180,180,180,0.5)" : "#ffffff";
        ctx.font = `bold ${isActive ? "13px" : "11px"} system-ui`;
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
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= p.decay;
        if (p.life <= 0) bursts.splice(i, 1);
      }
      ctx.globalAlpha = 1;
    }

    function drawHUD() {
      // Step indicator
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`Step ${Math.min(currentStep + 1, WAYPOINT_COUNT)} of ${WAYPOINT_COUNT}`, 18, 22);

      ctx.textAlign = "right";
      ctx.fillText(`Wrong taps: ${detours}`, W - 18, 22);

      // Progress dots at bottom
      const dotSpacing = 22;
      const totalW = WAYPOINT_COUNT * dotSpacing;
      const startX = W / 2 - totalW / 2 + dotSpacing / 2;
      for (let i = 0; i < WAYPOINT_COUNT; i++) {
        const x = startX + i * dotSpacing;
        const y = H - 16;
        const filled = i < currentStep;
        const active = i === currentStep;
        ctx.beginPath();
        ctx.arc(x, y, active ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = filled
          ? `hsl(${(i / WAYPOINT_COUNT) * 360}, 80%, 65%)`
          : active
          ? "#ffffff"
          : "rgba(255,255,255,0.25)";
        ctx.shadowBlur = active ? 8 : 0;
        ctx.shadowColor = "#ffffff";
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function frame(now) {
      drawBg();
      drawBgStars();

      if (redFlashTimer > 0) {
        ctx.fillStyle = `rgba(255,60,60,${(redFlashTimer / 18) * 0.28})`;
        ctx.fillRect(0, 0, W, H);
        redFlashTimer--;
      }

      drawPath();
      drawWaypoints(now);
      drawBursts();
      drawHUD();

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
