import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GAME_TYPE_LABELS } from "../../lib/constants.js";
import {
  fallbackGameReflection,
  gameBoardClass,
  gameBoardStyle,
  getGameExperience,
  getJson
} from "../../lib/stateCard.js";
import CardArt from "../cards/CardArt.jsx";

function ReactionGrid({ card, onResult, gameExperience }) {
  const [target, setTarget] = useState(() => Math.floor(Math.random() * 16));
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [remaining, setRemaining] = useState(15);
  const finishedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setRemaining((value) => value - 1), 1000);
    const targetTimer = setInterval(() => setTarget(Math.floor(Math.random() * 16)), 950);
    return () => {
      clearInterval(timer);
      clearInterval(targetTimer);
    };
  }, []);

  useEffect(() => {
    if (remaining <= 0 && !finishedRef.current) {
      finishedRef.current = true;
      onResult({
        type: "reaction_grid",
        summary: `You found ${hits} targets with ${misses} missed taps in this personal game.`,
        hits,
        misses
      });
    }
  }, [remaining, hits, misses, onResult]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === " ") {
        event.preventDefault();
        setHits((value) => value + 1);
        setTarget(Math.floor(Math.random() * 16));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function hitCell(index) {
    if (index === target) {
      setHits((value) => value + 1);
      setTarget(Math.floor(Math.random() * 16));
    } else {
      setMisses((value) => value + 1);
    }
  }

  return (
    <>
      <div className="game-status">Reaction Grid: {Math.max(remaining, 0)} seconds left. Hits: {hits}. Misses: {misses}.</div>
      <div className={gameBoardClass("reaction-board", gameExperience)} style={gameBoardStyle(gameExperience)} tabIndex="0" aria-label={`${card.stateName} reaction grid`}>
        <div className="reaction-grid">
          {Array.from({ length: 16 }, (_, index) => (
            <button
              key={index}
              className={`reaction-cell ${index === target ? "is-target" : ""}`}
              type="button"
              aria-label={`Grid cell ${index + 1}`}
              onClick={() => hitCell(index)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function CadenceKeeper({ card, onResult, gameExperience }) {
  const [taps, setTaps] = useState([]);
  const targetMs = 700;
  const requiredTaps = 14;
  const tapsRef = useRef([]);
  const finishedRef = useRef(false);

  function finish(nextTaps) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const intervals = nextTaps.slice(1).map((tap, index) => tap - nextTaps[index]);
    const averageError = intervals.length
      ? intervals.reduce((sum, interval) => sum + Math.abs(interval - targetMs), 0) / intervals.length
      : 0;
    const consistency = Math.max(0, Math.round(100 - averageError / 7));
    const rhythmLabel = consistency >= 82 ? "steady" : consistency >= 58 ? "developing" : "variable";
    onResult({
      type: "cadence_keeper",
      summary: `Your cadence stayed ${rhythmLabel} across ${requiredTaps} taps in this personal game.`,
      rhythmLabel
    });
  }

  function recordTap() {
    if (finishedRef.current) return;
    const nextTaps = [...tapsRef.current, performance.now()];
    tapsRef.current = nextTaps;
    setTaps(nextTaps);
    if (nextTaps.length >= requiredTaps) finish(nextTaps);
  }

  useEffect(() => {
    function onKey(event) {
      if (event.key === " ") {
        event.preventDefault();
        recordTap();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const progress = Math.min(taps.length / requiredTaps, 1) * 100;
  return (
    <>
      <div className="game-status">Cadence Keeper: {Math.max(requiredTaps - taps.length, 0)} taps left. Keep each tap close to the same tempo.</div>
      <div className={gameBoardClass("cadence-board", gameExperience)} style={gameBoardStyle(gameExperience)} tabIndex="0" aria-label={`${card.stateName} cadence keeper`}>
        <button className="cadence-pad" type="button" onClick={recordTap}>
          <span>Tap here or press space</span>
          <strong>Keep a steady rhythm</strong>
        </button>
        <div className="cadence-meter" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      </div>
    </>
  );
}

function PrecisionTrace({ card, onResult, gameExperience }) {
  const checkpoints = [
    { x: 9, y: 78 },
    { x: 22, y: 61 },
    { x: 38, y: 68 },
    { x: 52, y: 42 },
    { x: 68, y: 50 },
    { x: 83, y: 24 },
    { x: 92, y: 37 }
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const [detours, setDetours] = useState(0);
  const finishedRef = useRef(false);

  function finish(nextIndex, nextDetours) {
    if (finishedRef.current || nextIndex < checkpoints.length) return;
    finishedRef.current = true;
    const traceLabel = nextDetours <= 1 ? "clean" : nextDetours <= 4 ? "steady" : "exploratory";
    onResult({
      type: "precision_trace",
      summary: `Your trace stayed ${traceLabel} across ${checkpoints.length} checkpoints in this personal game.`,
      traceLabel,
      detours: nextDetours
    });
  }

  function chooseCheckpoint(index) {
    if (finishedRef.current) return;
    if (index === activeIndex) {
      const nextIndex = activeIndex + 1;
      setActiveIndex(nextIndex);
      finish(nextIndex, detours);
    } else {
      setDetours((value) => value + 1);
    }
  }

  return (
    <>
      <div className="game-status">Precision Trace: follow the line from marker to marker. Next marker: {Math.min(activeIndex + 1, checkpoints.length)} of {checkpoints.length}.</div>
      <div className={gameBoardClass("trace-board", gameExperience)} style={gameBoardStyle(gameExperience)} tabIndex="0" aria-label={`${card.stateName} precision trace`}>
        <svg className="trace-path" viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
          <polyline points={checkpoints.map((point) => `${point.x},${point.y}`).join(" ")} />
        </svg>
        {checkpoints.map((point, index) => (
          <button
            key={`${point.x}-${point.y}`}
            className={`trace-point ${index < activeIndex ? "is-complete" : ""} ${index === activeIndex ? "is-active" : ""}`}
            type="button"
            aria-label={`Trace checkpoint ${index + 1}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            onPointerEnter={() => chooseCheckpoint(index)}
            onClick={() => chooseCheckpoint(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </>
  );
}

function FocusHold({ card, onResult, gameExperience }) {
  const boardRef = useRef(null);
  const markerRef = useRef({ x: 50, y: 50 });
  const zoneRef = useRef({ x: 50, y: 50 });
  const finishedRef = useRef(false);
  const tickRef = useRef(0);
  const stableTicksRef = useRef(0);
  const [marker, setMarker] = useState(markerRef.current);
  const [zone, setZone] = useState(zoneRef.current);
  const [remaining, setRemaining] = useState(12);
  const [stableTicks, setStableTicks] = useState(0);

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function updateMarker(nextMarker) {
    const bounded = {
      x: Math.max(4, Math.min(96, nextMarker.x)),
      y: Math.max(4, Math.min(96, nextMarker.y))
    };
    markerRef.current = bounded;
    setMarker(bounded);
  }

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const ratio = stableTicksRef.current / Math.max(tickRef.current, 1);
    const holdLabel = ratio >= 0.7 ? "steady" : ratio >= 0.42 ? "developing" : "wandering";
    onResult({
      type: "focus_hold",
      summary: `Your focus hold felt ${holdLabel} while the target zone moved in this personal game.`,
      holdLabel
    });
  }

  useEffect(() => {
    const timer = setInterval(() => {
      tickRef.current += 1;
      const tick = tickRef.current;
      const nextZone = {
        x: 50 + Math.sin(tick / 4) * 27,
        y: 50 + Math.cos(tick / 5) * 21
      };
      zoneRef.current = nextZone;
      setZone(nextZone);
      if (distance(markerRef.current, nextZone) <= 16) {
        stableTicksRef.current += 1;
        setStableTicks(stableTicksRef.current);
      }
      setRemaining(Math.max(0, 12 - Math.floor(tick / 4)));
      if (tick >= 48) finish();
    }, 250);
    return () => clearInterval(timer);
  }, []);

  function handlePointerMove(event) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    updateMarker({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100
    });
  }

  function handleKeyDown(event) {
    const step = event.shiftKey ? 8 : 4;
    const keyMoves = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step }
    };
    const move = keyMoves[event.key];
    if (!move) return;
    event.preventDefault();
    updateMarker({ x: markerRef.current.x + move.x, y: markerRef.current.y + move.y });
  }

  const isInside = distance(marker, zone) <= 16;

  return (
    <>
      <div className="game-status">Focus Hold: {remaining} seconds left. Keep your marker inside the moving zone.</div>
      <div
        className={gameBoardClass("focus-board", gameExperience)}
        style={gameBoardStyle(gameExperience)}
        tabIndex="0"
        ref={boardRef}
        aria-label={`${card.stateName} focus hold`}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKeyDown}
      >
        <div className="focus-zone" style={{ left: `${zone.x}%`, top: `${zone.y}%` }} />
        <div className={`focus-marker ${isInside ? "is-inside" : ""}`} style={{ left: `${marker.x}%`, top: `${marker.y}%` }} />
        <div className="focus-readout">Stable moments: {stableTicks}</div>
      </div>
    </>
  );
}

function PatternScout({ card, onResult, gameExperience }) {
  const sequence = useMemo(() => {
    const seed = card.stateCode.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const nextSequence = [];
    let current = seed % 4;
    for (let index = 0; index < 6; index += 1) {
      current = (current + 1 + ((seed + index * 2) % 3)) % 4;
      nextSequence.push(current);
    }
    return nextSequence;
  }, [card.stateCode]);
  const labels = ["Coast", "Road", "Court", "Peak"];
  const [previewing, setPreviewing] = useState(true);
  const [highlight, setHighlight] = useState(null);
  const [userIndex, setUserIndex] = useState(0);
  const [misses, setMisses] = useState(0);
  const [feedback, setFeedback] = useState("Watch the route.");
  const [previewRound, setPreviewRound] = useState(0);
  const finishedRef = useRef(false);
  const previewTimersRef = useRef([]);
  const flashTimerRef = useRef(null);

  function finish(nextIndex, nextMisses) {
    if (finishedRef.current || nextIndex < sequence.length) return;
    finishedRef.current = true;
    const patternLabel = nextMisses === 0 ? "cleanly" : nextMisses <= 2 ? "with a few resets" : "with extra scouting";
    onResult({
      type: "pattern_scout",
      summary: `You repeated the state pattern ${patternLabel} in this personal game.`,
      patternLabel,
      misses: nextMisses
    });
  }

  useEffect(() => {
    setPreviewing(true);
    setHighlight(null);
    setUserIndex(0);
    setFeedback("Watch the route.");
    previewTimersRef.current.forEach(clearTimeout);
    previewTimersRef.current = [];
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);

    sequence.forEach((tile, index) => {
      previewTimersRef.current.push(setTimeout(() => {
        setFeedback(`Watch step ${index + 1} of ${sequence.length}.`);
        setHighlight(tile);
      }, index * 720));
      previewTimersRef.current.push(setTimeout(() => {
        setHighlight(null);
      }, index * 720 + 390));
    });

    previewTimersRef.current.push(setTimeout(() => {
      setPreviewing(false);
      setFeedback("Your turn: repeat the route.");
    }, sequence.length * 720 + 160));

    return () => {
      previewTimersRef.current.forEach(clearTimeout);
      previewTimersRef.current = [];
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [sequence, previewRound]);

  useEffect(() => {
    function onKey(event) {
      if (!/^[1-4]$/.test(event.key)) return;
      event.preventDefault();
      choosePattern(Number(event.key) - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function choosePattern(index) {
    if (previewing || finishedRef.current) return;
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setHighlight(index);
    flashTimerRef.current = setTimeout(() => setHighlight(null), 180);

    if (sequence[userIndex] === index) {
      const nextIndex = userIndex + 1;
      setUserIndex(nextIndex);
      setFeedback(nextIndex >= sequence.length ? "Pattern complete." : `Good. Step ${nextIndex + 1} of ${sequence.length} next.`);
      finish(nextIndex, misses);
    } else {
      setMisses((value) => value + 1);
      setUserIndex(0);
      setFeedback("Pattern reset. Start again from the first tile.");
    }
  }

  function replayPattern() {
    if (finishedRef.current) return;
    setMisses((value) => value + 1);
    setPreviewRound((value) => value + 1);
  }

  return (
    <>
      <div className="game-status">{previewing ? "Pattern Scout: watch the route." : `Pattern Scout: repeat the route. Step ${Math.min(userIndex + 1, sequence.length)} of ${sequence.length}.`} {feedback}</div>
      <div className={gameBoardClass("pattern-board", gameExperience)} style={gameBoardStyle(gameExperience)} tabIndex="0" aria-label={`${card.stateName} pattern scout`}>
        <div className="pattern-grid">
          {labels.map((label, index) => (
            <button
              key={label}
              className={`pattern-cell ${highlight === index ? "is-highlighted" : ""}`}
              type="button"
              onClick={() => choosePattern(index)}
              aria-label={`${label} pattern tile ${index + 1}`}
            >
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
        <div className="pattern-progress" aria-label={`${userIndex} of ${sequence.length} pattern steps completed`}>
          {sequence.map((_, index) => (
            <span key={index} className={index < userIndex ? "is-complete" : ""} />
          ))}
        </div>
        <div className="pattern-actions">
          <p className="pattern-hint">Use buttons or keys 1-4. A wrong tile resets the route.</p>
          <button className="ghost-button small" type="button" onClick={replayPattern} disabled={previewing}>Show pattern again</button>
        </div>
      </div>
    </>
  );
}

function ChallengeGame({ challengeType, card, onResult, gameExperience }) {
  if (challengeType === "cadence_keeper") return <CadenceKeeper card={card} onResult={onResult} gameExperience={gameExperience} />;
  if (challengeType === "precision_trace") return <PrecisionTrace card={card} onResult={onResult} gameExperience={gameExperience} />;
  if (challengeType === "focus_hold") return <FocusHold card={card} onResult={onResult} gameExperience={gameExperience} />;
  if (challengeType === "pattern_scout") return <PatternScout card={card} onResult={onResult} gameExperience={gameExperience} />;
  return <ReactionGrid card={card} onResult={onResult} gameExperience={gameExperience} />;
}

function ChallengeView({ card, briefing, onReturn, panelManifest, onGameComplete }) {
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState(null);
  const [reflection, setReflection] = useState(null);
  const gameExperience = getGameExperience(card);
  const challengeType = gameExperience.challengeType || "reaction_grid";

  const onResult = useCallback(async (nextResult) => {
    setResult(nextResult);
    setStarted(false);
    onGameComplete?.();
    try {
      const payload = await getJson("/api/gemini/game-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateSyncCardJson: card, result: nextResult })
      });
      setReflection(payload);
    } catch (error) {
      setReflection(fallbackGameReflection(card, nextResult, error.message));
    }
  }, [card]);

  useEffect(() => {
    setStarted(false);
    setResult(null);
    setReflection(null);
  }, [card.stateCode]);

  function start() {
    setResult(null);
    setReflection(null);
    setStarted(true);
  }

  return (
    <section className="challenge-view page-panel">
      <div className="challenge-header">
        <div>
          <p className="eyebrow">Fan skill challenge</p>
          <h2>{gameExperience.gameName || `${card.stateName} State Sync Challenge`}</h2>
          <p>{gameExperience.sharedTraitName}: {gameExperience.sharedTraitDescription}</p>
        </div>
        <button className="ghost-button" type="button" onClick={onReturn}>Return to State Card</button>
      </div>
      <div className="challenge-grid">
        <section className="challenge-copy">
          <CardArt card={card} compact panelManifest={panelManifest} />
          <p className="state-pill">{card.stateName} - {GAME_TYPE_LABELS[challengeType] || challengeType.replaceAll("_", " ")}</p>
          <h3>{gameExperience.sharedTraitName}</h3>
          <p>{gameExperience.gameIntro || briefing?.briefing?.gameIntro || `Try a short fan challenge inspired by ${String(gameExperience.sharedTraitName || "state sync").toLowerCase()}.`}</p>
          <p className="safe-note">Personal fan result only. This is for appreciation, not measurement or comparison.</p>
          <button className="primary-button wide" type="button" onClick={start}>Start Challenge</button>
        </section>
        <section className="game-surface">
          {!started && !result && <div className="game-status">Press start when you are ready.</div>}
          {started && <ChallengeGame challengeType={challengeType} card={card} onResult={onResult} gameExperience={gameExperience} />}
          {result && (
            <div className="game-result">
              <p><strong>Personal result:</strong> {result.summary}</p>
              <p>{reflection ? reflection.reflection : "Generating safe game reflection..."}</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export default ChallengeView;
