import React, { useCallback, useEffect, useState } from "react";
import { GAME_TYPE_LABELS } from "../../lib/constants.js";
import {
  fallbackGameReflection,
  getGameExperience,
  getJson,
  plainTraitDescription,
  plainTraitHeadline
} from "../../lib/stateCard.js";
import CardArt from "../cards/CardArt.jsx";
import TargetBurst from "./games/TargetBurst.jsx";
import WaveRider from "./games/WaveRider.jsx";
import StarPath from "./games/StarPath.jsx";
import SpaceDodge from "./games/SpaceDodge.jsx";
import GridMemory from "./games/GridMemory.jsx";

function ChallengeGame({ challengeType, card, onResult, gameExperience }) {
  if (challengeType === "cadence_keeper") return <WaveRider card={card} onResult={onResult} gameExperience={gameExperience} />;
  if (challengeType === "precision_trace") return <StarPath card={card} onResult={onResult} gameExperience={gameExperience} />;
  if (challengeType === "focus_hold") return <SpaceDodge card={card} onResult={onResult} gameExperience={gameExperience} />;
  if (challengeType === "pattern_scout") return <GridMemory card={card} onResult={onResult} gameExperience={gameExperience} />;
  return <TargetBurst card={card} onResult={onResult} gameExperience={gameExperience} />;
}

function ChallengeView({ card, briefing, onReturn, panelManifest, onGameComplete }) {
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState(null);
  const [reflection, setReflection] = useState(null);
  const gameExperience = getGameExperience(card);
  const challengeType = gameExperience.challengeType || "reaction_grid";
  const connectionHeadline = gameExperience.sharedTraitName || plainTraitHeadline(card);
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
                      {condition.label}: {condition.displayValue || (Number.isFinite(condition.averageErrorMs) ? `${condition.averageErrorMs}ms drift` : `${condition.hits}/${condition.count} clear`)}
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
