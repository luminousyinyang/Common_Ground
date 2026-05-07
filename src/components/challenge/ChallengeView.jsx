import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GAME_TYPE_LABELS } from "../../lib/constants.js";
import {
  fallbackGameReflection,
  gameBoardClass,
  gameBoardStyle,
  getGameExperience,
  getJson,
  plainTraitDescription,
  plainTraitHeadline
} from "../../lib/stateCard.js";
import CardArt from "../cards/CardArt.jsx";

const FOCUS_WINDOW_CONDITIONS = [
  { key: "read", label: "Read", condition: "Wide window", durationMs: 1900, windowWidth: 24, centers: [50, 50, 50] },
  { key: "narrow", label: "Narrow", condition: "Smaller window", durationMs: 1600, windowWidth: 17, centers: [48, 52, 50] },
  { key: "shift", label: "Shift", condition: "Offset window", durationMs: 1400, windowWidth: 18, centers: [42, 58, 46] }
];

const FOCUS_WINDOW_TRIALS = FOCUS_WINDOW_CONDITIONS.flatMap((condition) =>
  condition.centers.map((center) => ({ ...condition, center }))
);

function focusWindowStats(results) {
  const hits = results.filter((result) => result.hit);
  const misses = results.length - hits.length;
  const averageTimingErrorMs = hits.length ? average(hits.map((result) => result.timingErrorMs)) : 0;
  const hitRate = results.length ? hits.length / results.length : 0;
  const precisionScore = clampScore(hitRate * 100 - averageTimingErrorMs / 8 - misses * 4);
  const focusLabel = precisionScore >= 86
    ? "clean"
    : precisionScore >= 70
      ? "controlled"
      : precisionScore >= 52
        ? "developing"
        : "hard to settle";
  const conditionBreakdown = FOCUS_WINDOW_CONDITIONS.map((condition) => {
    const conditionResults = results.filter((result) => result.conditionKey === condition.key);
    const conditionHits = conditionResults.filter((result) => result.hit);
    return {
      label: condition.condition,
      count: conditionResults.length,
      hits: conditionHits.length,
      averageErrorMs: conditionHits.length ? Math.round(average(conditionHits.map((result) => result.timingErrorMs))) : null
    };
  }).filter((condition) => condition.count > 0);

  return {
    focusLabel,
    precisionScore,
    hits: hits.length,
    misses,
    averageTimingErrorMs: Math.round(averageTimingErrorMs),
    conditionBreakdown
  };
}

function FocusWindow({ card, onResult, gameExperience }) {
  const [trialIndex, setTrialIndex] = useState(0);
  const [position, setPosition] = useState(4);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [feedback, setFeedback] = useState("Tap or press space when the signal is inside the focus window.");
  const trialIndexRef = useRef(0);
  const positionRef = useRef(4);
  const startedAtRef = useRef(performance.now());
  const lockedRef = useRef(false);
  const finishedRef = useRef(false);
  const resultsRef = useRef([]);

  const finish = useCallback((nextResults) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const stats = focusWindowStats(nextResults);
    onResult({
      type: "reaction_grid",
      summary: `Your focus window was ${stats.focusLabel}: ${stats.hits}/${FOCUS_WINDOW_TRIALS.length} timed taps with about ${stats.averageTimingErrorMs}ms average timing offset.`,
      focusLabel: stats.focusLabel,
      precisionScore: stats.precisionScore,
      hits: stats.hits,
      misses: stats.misses,
      averageTimingErrorMs: stats.averageTimingErrorMs,
      metrics: [
        { label: "Precision", value: `${stats.precisionScore}%` },
        { label: "Timed taps", value: `${stats.hits}/${FOCUS_WINDOW_TRIALS.length}` },
        { label: "Avg offset", value: `${stats.averageTimingErrorMs}ms` }
      ],
      conditionBreakdown: stats.conditionBreakdown
    });
  }, [onResult]);

  const completeTrial = useCallback((result) => {
    if (finishedRef.current) return;
    const nextResults = [...resultsRef.current, result];
    resultsRef.current = nextResults;
    setHits(nextResults.filter((item) => item.hit).length);
    setMisses(nextResults.filter((item) => !item.hit).length);
    setFeedback(result.feedback);

    if (nextResults.length >= FOCUS_WINDOW_TRIALS.length) {
      window.setTimeout(() => finish(nextResults), 260);
      return;
    }

    window.setTimeout(() => {
      const nextIndex = nextResults.length;
      trialIndexRef.current = nextIndex;
      setTrialIndex(nextIndex);
      startedAtRef.current = performance.now();
      positionRef.current = 4;
      setPosition(4);
      lockedRef.current = false;
      const nextTrial = FOCUS_WINDOW_TRIALS[nextIndex];
      setFeedback(`${nextTrial.condition}: wait for the signal to enter the window.`);
    }, 360);
  }, [finish]);

  const evaluateTap = useCallback(() => {
    if (lockedRef.current || finishedRef.current) return;
    const trial = FOCUS_WINDOW_TRIALS[trialIndexRef.current];
    const currentPosition = positionRef.current;
    const windowStart = trial.center - trial.windowWidth / 2;
    const windowEnd = trial.center + trial.windowWidth / 2;
    const hit = currentPosition >= windowStart && currentPosition <= windowEnd;
    const timingErrorMs = Math.round((Math.abs(currentPosition - trial.center) / 92) * trial.durationMs);
    const direction = currentPosition < windowStart ? "early" : currentPosition > windowEnd ? "late" : "inside";
    const feedbackText = hit
      ? timingErrorMs <= 70
        ? "Clean timing."
        : `Inside window, ${timingErrorMs}ms from center.`
      : direction === "early"
        ? "Early tap. Wait for the window."
        : "Late tap. Reset your timing.";

    lockedRef.current = true;
    completeTrial({
      conditionKey: trial.key,
      conditionLabel: trial.condition,
      hit,
      timingErrorMs,
      direction,
      feedback: feedbackText
    });
  }, [completeTrial]);

  useEffect(() => {
    let animationFrame = 0;

    function tick(now) {
      if (finishedRef.current) return;
      const trial = FOCUS_WINDOW_TRIALS[trialIndexRef.current];
      const elapsed = now - startedAtRef.current;
      const progress = Math.min(elapsed / trial.durationMs, 1);
      const nextPosition = 4 + progress * 92;
      positionRef.current = nextPosition;
      setPosition(nextPosition);

      if (progress >= 1 && !lockedRef.current) {
        lockedRef.current = true;
        completeTrial({
          conditionKey: trial.key,
          conditionLabel: trial.condition,
          hit: false,
          timingErrorMs: Math.round(trial.durationMs * 0.18),
          direction: "late",
          feedback: "Signal passed the window. Reset your timing."
        });
      }

      animationFrame = window.requestAnimationFrame(tick);
    }

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [completeTrial]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === " ") {
        event.preventDefault();
        evaluateTap();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [evaluateTap]);

  const trial = FOCUS_WINDOW_TRIALS[Math.min(trialIndex, FOCUS_WINDOW_TRIALS.length - 1)];
  const windowStart = trial.center - trial.windowWidth / 2;
  const progress = (trialIndex / FOCUS_WINDOW_TRIALS.length) * 100;

  return (
    <>
      <div className="game-status">Focus Window: trial {Math.min(trialIndex + 1, FOCUS_WINDOW_TRIALS.length)} of {FOCUS_WINDOW_TRIALS.length}. Timed taps: {hits}. Early/late: {misses}.</div>
      <div
        className={gameBoardClass("focus-window-board", gameExperience)}
        style={gameBoardStyle(gameExperience)}
        tabIndex="0"
        aria-label={`${card.stateName} focus window`}
        onPointerDown={evaluateTap}
      >
        <div className="focus-window-condition-row" aria-label="Focus window conditions">
          {FOCUS_WINDOW_CONDITIONS.map((condition) => {
            const startIndex = FOCUS_WINDOW_CONDITIONS
              .slice(0, FOCUS_WINDOW_CONDITIONS.indexOf(condition))
              .reduce((sum, item) => sum + item.centers.length, 0);
            const endIndex = startIndex + condition.centers.length;
            return (
              <div
                key={condition.key}
                className={`focus-window-condition ${trialIndex >= startIndex && trialIndex < endIndex ? "is-active" : ""} ${trialIndex >= endIndex ? "is-complete" : ""}`}
              >
                <span>{condition.label}</span>
                <strong>{condition.condition}</strong>
              </div>
            );
          })}
        </div>
        <div className="focus-window-track" aria-hidden="true">
          <span className="focus-window-track-label is-early">Early</span>
          <span className="focus-window-track-label is-late">Late</span>
          <div className="focus-window-rail" />
          <div className="focus-window-zone" style={{ left: `${windowStart}%`, width: `${trial.windowWidth}%` }}>
            Focus window
          </div>
          <div className="focus-window-signal" style={{ left: `${position}%` }} />
        </div>
        <div className="focus-window-feedback">{feedback}</div>
        <div className="focus-window-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      </div>
    </>
  );
}

const RHYTHM_CONDITIONS = [
  { key: "one", label: "1s", condition: "Every 1s", targetMs: 1000, intervals: 3 },
  { key: "one-half", label: "1.5s", condition: "Every 1.5s", targetMs: 1500, intervals: 3 },
  { key: "two", label: "2s", condition: "Every 2s", targetMs: 2000, intervals: 3 }
];

const RHYTHM_TARGETS = RHYTHM_CONDITIONS.flatMap((condition) =>
  Array.from({ length: condition.intervals }, () => condition)
);
const RHYTHM_REQUIRED_TAPS = RHYTHM_TARGETS.length + 1;

function rhythmConditionForInterval(index) {
  const bounded = Math.max(0, Math.min(index, RHYTHM_TARGETS.length - 1));
  return RHYTHM_TARGETS[bounded] || RHYTHM_CONDITIONS[0];
}

function rhythmConditionProgress(completedIntervals) {
  let cursor = 0;
  return RHYTHM_CONDITIONS.map((condition) => {
    const start = cursor;
    const end = start + condition.intervals;
    cursor = end;
    return {
      ...condition,
      start,
      end,
      isActive: completedIntervals >= start && completedIntervals < end,
      isComplete: completedIntervals >= end
    };
  });
}

function millisecondsLabel(value) {
  const seconds = value / 1000;
  return `${seconds.toFixed(2).replace(/\.?0+$/, "")}s`;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rhythmStatsForTaps(nextTaps) {
  const intervals = nextTaps.slice(1).map((tap, index) => tap - nextTaps[index]);
  const intervalResults = intervals.map((interval, index) => {
    const condition = rhythmConditionForInterval(index);
    return {
      condition,
      interval,
      error: Math.abs(interval - condition.targetMs)
    };
  });
  const averageError = average(intervalResults.map((result) => result.error));

  const conditionBreakdown = RHYTHM_CONDITIONS.map((condition) => {
    const results = intervalResults.filter((result) => result.condition.key === condition.key);
    const values = results.map((result) => result.interval);
    const mean = average(values);
    const variance = average(values.map((value) => (value - mean) ** 2));
    return {
      label: condition.condition,
      targetMs: condition.targetMs,
      count: results.length,
      averageErrorMs: Math.round(average(results.map((result) => result.error))),
      varianceMs: Math.round(Math.sqrt(variance))
    };
  }).filter((condition) => condition.count > 0);

  const averageVariance = average(conditionBreakdown.map((condition) => condition.varianceMs));
  const adaptationErrors = [];
  let phaseStart = 0;
  RHYTHM_CONDITIONS.forEach((condition, index) => {
    if (index > 0 && intervalResults[phaseStart]) {
      adaptationErrors.push(intervalResults[phaseStart].error);
    }
    phaseStart += condition.intervals;
  });
  const adaptationError = average(adaptationErrors);
  const stabilityScore = clampScore(100 - averageVariance / 7.5);
  const accuracyScore = clampScore(100 - averageError / 12);
  const adaptationScore = adaptationErrors.length ? clampScore(100 - adaptationError / 12) : 100;
  const overallScore = clampScore(stabilityScore * 0.5 + accuracyScore * 0.35 + adaptationScore * 0.15);
  const rhythmLabel = overallScore >= 85
    ? "steady"
    : overallScore >= 70
      ? "mostly steady"
      : overallScore >= 50
        ? "variable"
        : "hard to settle";

  return {
    rhythmLabel,
    overallScore,
    stabilityScore,
    accuracyScore,
    adaptationScore,
    averageErrorMs: Math.round(averageError),
    averageVarianceMs: Math.round(averageVariance),
    conditionBreakdown
  };
}

function CadenceKeeper({ card, onResult, gameExperience }) {
  const [taps, setTaps] = useState([]);
  const [feedback, setFeedback] = useState("First tap starts the rhythm.");
  const tapsRef = useRef([]);
  const finishedRef = useRef(false);

  const finish = useCallback((nextTaps) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const stats = rhythmStatsForTaps(nextTaps);
    onResult({
      type: "cadence_keeper",
      summary: `Your rhythm was ${stats.rhythmLabel}: ${stats.overallScore}% rhythm stability with about ${stats.averageErrorMs}ms average timing drift as the tempo shifted.`,
      rhythmLabel: stats.rhythmLabel,
      stabilityScore: stats.overallScore,
      averageErrorMs: stats.averageErrorMs,
      adaptationScore: stats.adaptationScore,
      metrics: [
        { label: "Stability", value: `${stats.overallScore}%` },
        { label: "Avg drift", value: `${stats.averageErrorMs}ms` },
        { label: "Shift response", value: `${stats.adaptationScore}%` }
      ],
      conditionBreakdown: stats.conditionBreakdown
    });
  }, [onResult]);

  const recordTap = useCallback(() => {
    if (finishedRef.current) return;
    const now = performance.now();
    const previousTap = tapsRef.current.at(-1);
    const nextTaps = [...tapsRef.current, now];
    if (previousTap) {
      const intervalIndex = nextTaps.length - 2;
      const condition = rhythmConditionForInterval(intervalIndex);
      const drift = Math.round(now - previousTap - condition.targetMs);
      const absoluteDrift = Math.abs(drift);
      const timingLabel = absoluteDrift <= 140
        ? "on the count"
        : drift < 0
          ? `${absoluteDrift}ms early`
          : `${absoluteDrift}ms late`;
      setFeedback(`${condition.condition}: ${timingLabel}.`);
    } else {
      setFeedback("Rhythm started. Match the current condition.");
    }
    tapsRef.current = nextTaps;
    setTaps(nextTaps);
    if (nextTaps.length >= RHYTHM_REQUIRED_TAPS) finish(nextTaps);
  }, [finish]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === " ") {
        event.preventDefault();
        recordTap();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recordTap]);

  const completedIntervals = Math.max(taps.length - 1, 0);
  const currentCondition = rhythmConditionForInterval(completedIntervals);
  const conditions = rhythmConditionProgress(completedIntervals);
  const progress = Math.min(completedIntervals / RHYTHM_TARGETS.length, 1) * 100;
  const tapsLeft = Math.max(RHYTHM_REQUIRED_TAPS - taps.length, 0);

  return (
    <>
      <div className="game-status">Rhythm Shift: {tapsLeft} taps left. Match the {millisecondsLabel(currentCondition.targetMs)} count as conditions change.</div>
      <div className={gameBoardClass("cadence-board", gameExperience)} style={gameBoardStyle(gameExperience)} tabIndex="0" aria-label={`${card.stateName} rhythm shift`}>
        <div className="rhythm-condition-row" aria-label="Rhythm conditions">
          {conditions.map((condition) => (
            <div
              key={condition.key}
              className={`rhythm-condition ${condition.isActive ? "is-active" : ""} ${condition.isComplete ? "is-complete" : ""}`}
            >
              <span>{condition.label}</span>
              <strong>{condition.condition}</strong>
              <em>{millisecondsLabel(condition.targetMs)}</em>
            </div>
          ))}
        </div>
        <button className={`cadence-pad rhythm-pad rhythm-pad-${currentCondition.key}`} type="button" onClick={recordTap}>
          <span>{taps.length ? "Tap with the condition" : "Tap to start"}</span>
          <strong>{millisecondsLabel(currentCondition.targetMs)} rhythm</strong>
          <em>{feedback}</em>
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
  return <FocusWindow card={card} onResult={onResult} gameExperience={gameExperience} />;
}

function ChallengeView({ card, briefing, onReturn, panelManifest, onGameComplete }) {
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState(null);
  const [reflection, setReflection] = useState(null);
  const gameExperience = getGameExperience(card);
  const challengeType = gameExperience.challengeType || "reaction_grid";
  const connectionHeadline = plainTraitHeadline(card);
  const connectionDescription = gameExperience.sharedTraitDescription || plainTraitDescription(card);

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
    <section className={`challenge-view page-panel ${started ? "is-playing" : ""}`}>
      <div className="challenge-header">
        <div>
          <p className="eyebrow">Fan skill challenge</p>
          <h2>{gameExperience.gameName || `${card.stateName} Fan Challenge`}</h2>
          <p>{connectionDescription}</p>
        </div>
        <button className="ghost-button" type="button" onClick={onReturn}>Return to State Insight Card</button>
      </div>
      <div className="challenge-grid">
        <section className="challenge-copy">
          <CardArt card={card} compact panelManifest={panelManifest} />
          <p className="state-pill">{card.stateName} - {GAME_TYPE_LABELS[challengeType] || challengeType.replaceAll("_", " ")}</p>
          <h3>{connectionHeadline}</h3>
          <p className="challenge-intro">{gameExperience.gameIntro || briefing?.briefing?.gameIntro || `Try a short fan challenge inspired by ${connectionHeadline.toLowerCase()}.`}</p>
          <p className="safe-note">Personal fan result only. This is for appreciation, not measurement or comparison.</p>
          {!started && <button className="primary-button wide" type="button" onClick={start}>{result ? "Try Again" : "Start Challenge"}</button>}
        </section>
        <section className="game-surface">
          {!started && !result && <div className="game-status">Press start when you are ready.</div>}
          {started && <ChallengeGame challengeType={challengeType} card={card} onResult={onResult} gameExperience={gameExperience} />}
          {result && (
            <div className="game-result">
              <p><strong>Personal result:</strong> {result.summary}</p>
              {result.metrics?.length ? (
                <dl className="game-result-metrics">
                  {result.metrics.map((metric) => (
                    <div key={metric.label}>
                      <dt>{metric.label}</dt>
                      <dd>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {result.conditionBreakdown?.length ? (
                <div className="game-result-breakdown" aria-label="Condition breakdown">
                  {result.conditionBreakdown.map((condition) => (
                    <span key={condition.label}>
                      {condition.label}: {condition.averageErrorMs}ms drift
                    </span>
                  ))}
                </div>
              ) : null}
              <p>{reflection ? reflection.reflection : "Generating safe game reflection..."}</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export default ChallengeView;
