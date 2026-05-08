import React, { useEffect, useRef } from "react";

const WAYPOINT_COUNT_OPTIONS = [7, 8, 9];
const MARGIN = 70;
const STAR_R = 20;
const START_TOLERANCE = 34;
const TRACE_TOLERANCE = 34;
const FINISH_TOLERANCE = 30;
const MAX_PROGRESS_STEP = 0.25;
const DETOUR_COOLDOWN_MS = 450;

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segmentInfo(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy || 1;
  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
  const t = clamp(rawT, 0, 1);
  const projected = {
    x: start.x + dx * t,
    y: start.y + dy * t
  };
  return {
    t,
    projected,
    distance: distanceBetween(point, projected)
  };
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
    const waypointCount = WAYPOINT_COUNT_OPTIONS[Math.floor(rng() * WAYPOINT_COUNT_OPTIONS.length)];

    const doneRef = { current: false };
    let rafId = 0;
    let redFlashTimer = 0;
    let detours = 0;
    let lineBreaks = 0;
    let currentStep = 0;
    let tracing = false;
    let activePointerId = null;
    let segmentProgress = 0;
    let nextDetourAt = 0;
    const startTime = performance.now();

    // Generate a left-to-right route with enough variation to feel fresh but still traceable.
    const waypoints = [];
    const routeTop = MARGIN + 18;
    const routeBottom = Math.max(routeTop + 90, H - 95);
    const routeWidth = Math.max(160, W - MARGIN * 2);
    const stepX = routeWidth / Math.max(1, waypointCount - 1);
    const direction = rng() > 0.18 ? 1 : -1;
    let previousY = routeTop + rng() * (routeBottom - routeTop);
    for (let i = 0; i < waypointCount; i++) {
      const orderIndex = direction === 1 ? i : waypointCount - 1 - i;
      const jitterX = i === 0 || i === waypointCount - 1 ? 0 : (rng() - 0.5) * stepX * 0.52;
      const x = clamp(MARGIN + orderIndex * stepX + jitterX, MARGIN, W - MARGIN);
      const yTarget = routeTop + rng() * (routeBottom - routeTop);
      const y = clamp(previousY * 0.42 + yTarget * 0.58, routeTop, routeBottom);
      previousY = y;
      waypoints.push({ x, y, visited: false });
    }

    const idealDistance = waypoints.slice(1).reduce((sum, waypoint, index) => sum + distanceBetween(waypoints[index], waypoint), 0);

    const bursts = [];
    const tracePoints = [];

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

    function pointFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    function addDetour(now = performance.now()) {
      if (now < nextDetourAt || doneRef.current) return;
      detours++;
      redFlashTimer = 18;
      nextDetourAt = now + DETOUR_COOLDOWN_MS;
    }

    function completeTrace() {
      if (doneRef.current) return;
      doneRef.current = true;
      const driftPenalty = detours * 8 + lineBreaks * 6;
      const traceScore = Math.round(Math.max(0, Math.min(100, 100 - driftPenalty)));
      const label = traceScore >= 88 ? "cleanly" : traceScore >= 72 ? "steadily" : traceScore >= 52 ? "with some drift" : "with lots of drift";
      setTimeout(() => onResult({
        type: "precision_trace",
        summary: `You traced the line ${label}: ${detours} detours and ${lineBreaks} ${lineBreaks === 1 ? "line break" : "line breaks"}.`,
        traceLabel: label,
        traceScore,
        detours,
        lineBreaks,
        idealDistance: Math.round(idealDistance),
        metrics: [
          { label: "Line control", value: `${traceScore}%` },
          { label: "Detours", value: `${detours}` },
          { label: "Line breaks", value: `${lineBreaks}` },
        ],
        conditionBreakdown: [],
      }), 500);
    }

    function markWaypoint(index) {
      const waypoint = waypoints[index];
      if (!waypoint || waypoint.visited) return;
      waypoint.visited = true;
      spawnBurst(waypoint.x, waypoint.y, pal.accent);
    }

    function handleTracePoint(point, now = performance.now()) {
      if (doneRef.current) return;
      if (currentStep <= 0 || currentStep >= waypoints.length) return;
      tracePoints.push(point);
      if (tracePoints.length > 600) tracePoints.shift();

      // Self-crossing routes are fine: only the segment currently being traced can advance.
      const start = waypoints[currentStep - 1];
      const end = waypoints[currentStep];
      const info = segmentInfo(point, start, end);
      if (info.distance > TRACE_TOLERANCE) {
        addDetour(now);
        return;
      }

      const nextProgress = info.t >= segmentProgress - 0.04
        ? Math.min(info.t, segmentProgress + MAX_PROGRESS_STEP)
        : segmentProgress;
      segmentProgress = Math.max(segmentProgress, nextProgress);

      if (segmentProgress >= 0.9 && distanceBetween(point, end) <= FINISH_TOLERANCE + TRACE_TOLERANCE * 0.25) {
        markWaypoint(currentStep);
        currentStep++;
        segmentProgress = 0;
        if (currentStep >= waypoints.length) completeTrace();
      }
    }

    function beginTrace(point, pointerId, now = performance.now()) {
      if (doneRef.current) return;
      activePointerId = pointerId;
      tracing = true;
      canvas.setPointerCapture?.(pointerId);
      tracePoints.push(point);
      if (currentStep === 0) {
        markWaypoint(0);
        currentStep = 1;
        segmentProgress = 0;
      }
    }

    function handlePointerDown(e) {
      e.preventDefault();
      if (doneRef.current) return;
      const point = pointFromEvent(e);
      const now = performance.now();
      if (currentStep === 0) {
        if (distanceBetween(point, waypoints[0]) <= START_TOLERANCE) beginTrace(point, e.pointerId, now);
        else addDetour(now);
        return;
      }

      if (currentStep >= waypoints.length) return;
      const start = waypoints[currentStep - 1];
      const end = waypoints[currentStep];
      const info = segmentInfo(point, start, end);
      const canResume = distanceBetween(point, start) <= START_TOLERANCE || (info.distance <= TRACE_TOLERANCE && info.t <= segmentProgress + 0.2);
      if (canResume) {
        beginTrace(point, e.pointerId, now);
        handleTracePoint(point, now);
      } else {
        addDetour(now);
      }
    }

    function handlePointerMove(e) {
      if (e.pointerId !== activePointerId || !tracing) return;
      e.preventDefault();
      handleTracePoint(pointFromEvent(e), performance.now());
    }

    function handlePointerUp(e) {
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      canvas.releasePointerCapture?.(e.pointerId);
      activePointerId = null;
      if (tracing && currentStep > 0 && currentStep < waypoints.length && !doneRef.current) {
        lineBreaks++;
        redFlashTimer = 10;
      }
      tracing = false;
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

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

      if (currentStep > 0) {
        ctx.strokeStyle = pal.primary + "CC";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(waypoints[0].x, waypoints[0].y);
        for (let i = 1; i < currentStep; i++) {
          ctx.lineTo(waypoints[i].x, waypoints[i].y);
        }
        if (currentStep < waypoints.length && segmentProgress > 0) {
          const start = waypoints[currentStep - 1];
          const end = waypoints[currentStep];
          ctx.lineTo(
            start.x + (end.x - start.x) * segmentProgress,
            start.y + (end.y - start.y) * segmentProgress
          );
        }
        ctx.stroke();
      }
    }

    function drawTrace() {
      if (tracePoints.length < 2) return;
      ctx.strokeStyle = pal.hit + "AA";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(tracePoints[0].x, tracePoints[0].y);
      for (let i = 1; i < tracePoints.length; i++) {
        ctx.lineTo(tracePoints[i].x, tracePoints[i].y);
      }
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
    }

    function drawWaypoints(now) {
      const t = (now - startTime) / 600;
      for (let i = 0; i < waypoints.length; i++) {
        const w = waypoints[i];
        const isActive = currentStep === 0 ? i === 0 : i === currentStep;
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
      const prompt = currentStep === 0
        ? "Press and hold on 1"
        : currentStep >= waypoints.length
        ? "Trace complete"
        : `Trace to ${currentStep + 1} of ${waypoints.length}`;
      ctx.fillText(prompt, 18, 22);

      ctx.textAlign = "right";
      ctx.fillText(`Detours: ${detours}  Breaks: ${lineBreaks}`, W - 18, 22);

      // Progress dots at bottom
      const dotSpacing = 22;
      const totalDotW = waypoints.length * dotSpacing;
      const startX = W / 2 - totalDotW / 2 + dotSpacing / 2;
      for (let i = 0; i < waypoints.length; i++) {
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
      drawTrace();
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
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [card, onResult]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
    />
  );
}
