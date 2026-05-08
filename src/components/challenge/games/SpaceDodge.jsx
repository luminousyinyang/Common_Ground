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
  { player: "#44aaff", bg1: "#060a14", bg2: "#0a1220", trail: "#44aaff44" },
  { player: "#cc44ff", bg1: "#0a0614", bg2: "#100820", trail: "#cc44ff44" },
  { player: "#44ff99", bg1: "#060f08", bg2: "#0a180c", trail: "#44ff9944" },
  { player: "#ff8844", bg1: "#100606", bg2: "#180a06", trail: "#ff884444" },
];

const OBS_COLORS = ["#ff4466", "#ff9944", "#44ffee", "#cc66ff", "#ffee44"];

function clampScore(v) { return Math.round(Math.min(100, Math.max(0, v))); }

export default function SpaceDodge({ card, onResult }) {
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

    // Twinkling stars
    const stars = Array.from({ length: 50 }, () => ({
      x: rng() * W, y: rng() * H,
      r: 0.5 + rng() * 1.5,
      baseAlpha: 0.15 + rng() * 0.5,
      twinkleSpeed: 0.02 + rng() * 0.04,
      twinkleOffset: rng() * Math.PI * 2,
    }));

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
      const color = OBS_COLORS[Math.floor(rng() * OBS_COLORS.length)];
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

    function drawBg(now) {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, palette.bg1);
      grad.addColorStop(1, palette.bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    function drawStars(now) {
      const t = (now - startTime) / 1000;
      for (const s of stars) {
        const a = s.baseAlpha + Math.sin(t * s.twinkleSpeed * 60 + s.twinkleOffset) * 0.2;
        ctx.globalAlpha = Math.max(0.05, a);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawTrail() {
      for (let i = 0; i < trail.length; i++) {
        const a = (i / trail.length) * 0.4;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, PLAYER_R * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = palette.player;
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
      const grad = ctx.createRadialGradient(player.x - 4, player.y - 4, 2, player.x, player.y, PLAYER_R);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, palette.player);
      grad.addColorStop(1, palette.player + "44");
      ctx.fillStyle = grad;
      ctx.shadowBlur = 18;
      ctx.shadowColor = palette.player;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function drawObstacles() {
      for (const obs of obstacles) {
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(obs.x - 3, obs.y - 3, 2, obs.x, obs.y, obs.r);
        grad.addColorStop(0, "#ffffff99");
        grad.addColorStop(0.4, obs.color);
        grad.addColorStop(1, obs.color + "44");
        ctx.fillStyle = grad;
        ctx.shadowBlur = 12;
        ctx.shadowColor = obs.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function drawHearts() {
      ctx.font = "18px system-ui";
      ctx.textAlign = "left";
      for (let i = 0; i < MAX_LIVES; i++) {
        ctx.globalAlpha = i < lives ? 1 : 0.2;
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
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI * 2 - Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = progress > 0.3 ? palette.player : "#ff6644";
      ctx.shadowBlur = 8;
      ctx.shadowColor = palette.player;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
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
        // Remove if off screen for too long
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
      drawBg(now);
      drawStars(now);
      drawTrail();
      drawObstacles();
      drawPlayer(now);
      drawHearts();
      drawTimer(now);

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
