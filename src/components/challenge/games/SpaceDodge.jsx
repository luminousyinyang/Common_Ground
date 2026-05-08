import React, { useEffect, useRef } from "react";

const W = 480;
const H = 360;
const GAME_DURATION_MS = 20000;
const PLAYER_R = 14;
const MAX_LIVES = 3;
const INVINCIBLE_MS = 500;
const TRAIL_LENGTH = 8;
const OBSTACLE_SPAWN_MS = 1400;
const OBSTACLE_SPAWN_FAST_MS = 1100;
const FAST_AFTER_MS = 10000;

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

const OBS_COLOR_KEYS = ["secondary", "accent", "hit"];
const OBS_EXTRA = "#C47840";

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

function clampScore(v) { return Math.round(Math.min(100, Math.max(0, v))); }

export default function SpaceDodge({ card, onResult }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const grain = buildGrain(W, H);

    const seed = makeSeed(card);
    const rng = makeRng(seed);
    const pal = PALETTES[Math.floor(rng() * PALETTES.length)];

    // Build obstacle color pool from palette
    const obsColors = [pal.secondary, pal.accent, pal.hit, OBS_EXTRA];

    const doneRef = { current: false };
    let rafId = 0;
    const startTime = performance.now();

    // Player state
    const player = { x: W / 2, y: H / 2, targetX: W / 2, targetY: H / 2, r: PLAYER_R };
    const trail = [];
    let lives = MAX_LIVES;
    let invincibleUntil = 0;
    let invincibleFlash = false;

    // Obstacles
    const obstacles = [];
    let lastSpawn = startTime;

    function spawnObstacle(now) {
      const side = Math.floor(rng() * 4);
      let x, y, vx, vy;
      const speed = 1.8 + rng() * 1.4;
      const targetX = W * 0.3 + rng() * W * 0.4;
      const targetY = H * 0.3 + rng() * H * 0.4;
      if (side === 0) { x = -20; y = rng() * H; }
      else if (side === 1) { x = W + 20; y = rng() * H; }
      else if (side === 2) { x = rng() * W; y = -20; }
      else { x = rng() * W; y = H + 20; }
      const dx = targetX - x;
      const dy = targetY - y;
      const dist = Math.hypot(dx, dy);
      vx = (dx / dist) * speed;
      vy = (dy / dist) * speed;
      const r = 14 + rng() * 8;
      const color = obsColors[Math.floor(rng() * obsColors.length)];
      obstacles.push({ x, y, vx, vy, r, color, spawnTime: now });
    }

    function mouseMoveHandler(e) {
      const rect = canvas.getBoundingClientRect();
      const sx = W / rect.width;
      player.targetX = (e.clientX - rect.left) * sx;
      player.targetY = (e.clientY - rect.top) * sx;
    }

    function touchMoveHandler(e) {
      e.preventDefault();
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const sx = W / rect.width;
        player.x = (e.touches[0].clientX - rect.left) * sx;
        player.y = (e.touches[0].clientY - rect.top) * sx;
        player.targetX = player.x;
        player.targetY = player.y;
      }
    }

    canvas.addEventListener("mousemove", mouseMoveHandler);
    canvas.addEventListener("touchmove", touchMoveHandler, { passive: false });

    function drawTrail() {
      for (let i = 0; i < trail.length; i++) {
        const a = (i / trail.length) * 0.35;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, PLAYER_R * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = pal.primary;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawPlayer(now) {
      const inv = invincibleUntil > now;
      if (inv) {
        invincibleFlash = Math.floor((now - (invincibleUntil - INVINCIBLE_MS)) / 80) % 2 === 0;
        if (!invincibleFlash) return;
      }
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_R, 0, Math.PI * 2);
      ctx.fillStyle = pal.primary;
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function drawObstacles() {
      for (const obs of obstacles) {
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
        ctx.fillStyle = obs.color + "CC";
        ctx.fill();
        ctx.strokeStyle = obs.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    function drawHearts() {
      ctx.font = "18px system-ui";
      ctx.textAlign = "left";
      for (let i = 0; i < MAX_LIVES; i++) {
        ctx.globalAlpha = i < lives ? 1 : 0.2;
        ctx.fillStyle = "#C8543C";
        ctx.fillText("♥", 18 + i * 26, 26);
      }
      ctx.globalAlpha = 1;
    }

    function drawTimer(now) {
      const elapsed = now - startTime;
      const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
      const progress = remaining / GAME_DURATION_MS;
      const cx = W - 32;
      const cy = 32;
      const r = 20;
      ctx.strokeStyle = pal.muted + "44";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI * 2 - Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = progress > 0.3 ? pal.primary : "#B84030";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = pal.text;
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(Math.ceil(remaining / 1000), cx, cy + 4);
    }

    function finish(survivedMs) {
      if (doneRef.current) return;
      doneRef.current = true;
      const score = clampScore((survivedMs / GAME_DURATION_MS) * 100 + lives * 8);
      const label = score >= 82 ? "clear" : score >= 64 ? "steady" : score >= 44 ? "developing" : "crowded";
      setTimeout(() => onResult({
        type: "focus_hold",
        summary: `Your space felt ${label}: you survived ${Math.round(survivedMs / 1000)}s with ${lives} ${lives === 1 ? "life" : "lives"} remaining.`,
        holdLabel: label,
        readScore: score,
        correctCount: Math.round(survivedMs / 1000),
        averageDecisionMs: 0,
        metrics: [
          { label: "Survived", value: `${Math.round(survivedMs / 1000)}s / 20s` },
          { label: "Lives left", value: `${lives}/3` },
          { label: "Score", value: `${score}%` },
        ],
        conditionBreakdown: [],
      }), 400);
    }

    function frame(now) {
      const elapsed = now - startTime;

      // Lerp player toward target
      player.x += (player.targetX - player.x) * 0.18;
      player.y += (player.targetY - player.y) * 0.18;

      // Trail
      trail.push({ x: player.x, y: player.y });
      if (trail.length > TRAIL_LENGTH) trail.shift();

      // Spawn obstacles
      const spawnInterval = elapsed > FAST_AFTER_MS ? OBSTACLE_SPAWN_FAST_MS : OBSTACLE_SPAWN_MS;
      if (now - lastSpawn > spawnInterval) {
        spawnObstacle(now);
        lastSpawn = now;
      }

      // Update obstacles
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.x += obs.vx;
        obs.y += obs.vy;
        if (obs.x < -60 || obs.x > W + 60 || obs.y < -60 || obs.y > H + 60) {
          obstacles.splice(i, 1);
          continue;
        }
        // Collision
        if (now > invincibleUntil) {
          const dist = Math.hypot(player.x - obs.x, player.y - obs.y);
          if (dist < PLAYER_R + obs.r) {
            lives--;
            invincibleUntil = now + INVINCIBLE_MS;
            obstacles.splice(i, 1);
            if (lives <= 0) {
              finish(elapsed);
              return;
            }
          }
        }
      }

      // Check time
      if (elapsed >= GAME_DURATION_MS) {
        finish(GAME_DURATION_MS);
        return;
      }

      // Draw
      drawBg(ctx, W, H, pal);
      drawTrail();
      drawObstacles();
      drawPlayer(now);
      drawHearts();
      drawTimer(now);

      // Grain overlay
      ctx.globalAlpha = 0.07;
      ctx.drawImage(grain, 0, 0);
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("mousemove", mouseMoveHandler);
      canvas.removeEventListener("touchmove", touchMoveHandler);
    };
  }, [card, onResult]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", cursor: "none" }}
    />
  );
}
