import { useEffect, useRef, useState } from 'react';
import { EMPTY_CARD_PANEL_MANIFEST } from '../../lib/constants.js';
import {
  getCardStory,
  getCardThemeName,
  getGeographySignals,
  getPanelBackCopyForDisplay,
  getPanelVisualCue,
  getRosterCounts,
  panelProgramLabel,
  titleBucket
} from '../../lib/stateCard.js';
import { CardArt } from './CardArt.jsx';
import { BriefingPanel } from './BriefingPanel.jsx';

export function StateSummary({ card }) {
  const geographySignals = getGeographySignals(card);
  return (
    <section className="state-summary">
      <div>
        <p className="eyebrow">Selected state</p>
        <h2>{card.stateName}</h2>
      </div>
      <p>{card.geographySnapshot}</p>
      <div className="metric-row">
        <span className="metric">Card theme <strong>{getCardThemeName(card)}</strong></span>
        <span className="metric">Olympic <strong>{titleBucket(card.olympicPanel.aggregateSignal)}</strong></span>
        <span className="metric">Paralympic <strong>{titleBucket(card.paralympicPanel.aggregateSignal)}</strong></span>
      </div>
      <div className="chip-row">
        {geographySignals.map((item) => <span className="chip" key={item}>{item}</span>)}
      </div>
    </section>
  );
}

const PANEL_QA_ROWS = [
  ["howItWorks", "How it works"],
  ["watchValue", "Why it's fun to watch"],
  ["stateConnection", "State connection"],
  ["cardTrait", "Card trait"]
];

function compactSentences(value, maxSentences = 2) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) || [text];
  return sentences.slice(0, maxSentences).join(" ");
}

function compactSnippet(value, maxLength = 205) {
  const text = compactSentences(value, 1);
  if (text.length <= maxLength) return text;
  const trimmed = text.slice(0, maxLength).replace(/\s+\S*$/, "").replace(/[,:;]+$/, "");
  return `${trimmed}.`;
}

function compactPanelCopy(panel) {
  const copy = getPanelBackCopyForDisplay(panel);
  const visualCue = copy.featuredCue || getPanelVisualCue(panel);
  const factChips = Array.isArray(copy.factChips) ? copy.factChips.filter(Boolean).slice(0, 2) : [];
  return {
    visualCue,
    summary: compactSnippet(copy.qaFacts?.howItWorks || copy.qaFacts?.watchValue || panel.geographyConnection),
    chips: factChips
  };
}

function compactStateConnection(card, briefing) {
  const generatedLens = briefing?.briefing?.geographyLens;
  if (String(generatedLens || "").trim()) return compactSnippet(generatedLens, 132);
  return compactSnippet(`${card.geographySnapshot} could help fans understand why this state card connects these sport environments.`, 132);
}

function CompactSportLens({ panel }) {
  const copy = compactPanelCopy(panel);
  return (
    <section className={`compact-sport-lens ${panel.program}`}>
      <span className="compact-lens-label">{panel.program === "paralympic" ? "Paralympic Lens" : "Olympic Lens"}</span>
      <h4>{copy.visualCue}</h4>
      <p>{copy.summary}</p>
      {copy.chips.length > 0 && (
        <div className="compact-fact-line">
          {copy.chips.map((chip) => <span key={chip}>{chip}</span>)}
        </div>
      )}
    </section>
  );
}

function CompactCardBack({ card, briefing, onReadFullBriefing }) {
  const themeName = getCardThemeName(card);
  const olympicCue = getPanelVisualCue(card.olympicPanel);
  const paralympicCue = getPanelVisualCue(card.paralympicPanel);

  return (
    <div className="compact-card-back">
      <header className="compact-back-header">
        <span>Common Ground State Card</span>
        <h3>{card.stateName}</h3>
        <p>{themeName}</p>
      </header>

      <div className="compact-lens-grid">
        <CompactSportLens panel={card.olympicPanel} />
        <CompactSportLens panel={card.paralympicPanel} />
      </div>

      <section className="compact-shared-block">
        <span>Shared signal</span>
        <strong>{card.sharedTrait.name}</strong>
        <p>Olympic <b>{olympicCue}</b> and Paralympic <b>{paralympicCue}</b> connect through {card.sharedTrait.description.toLowerCase()}</p>
      </section>

      <section className="compact-connection-block">
        <span>{card.stateName} connection</span>
        <p>{compactStateConnection(card, briefing)}</p>
      </section>

      <button className="compact-read-more" type="button" onClick={onReadFullBriefing}>
        Read full state briefing
      </button>
    </div>
  );
}

function SportPanel({ panel }) {
  const copy = getPanelBackCopyForDisplay(panel);
  const visualCue = copy.featuredCue || getPanelVisualCue(panel);
  const factChips = Array.isArray(copy.factChips) ? copy.factChips.filter(Boolean).slice(0, 4) : [];
  const qaRows = PANEL_QA_ROWS
    .map(([key, label]) => [key, label, copy.qaFacts?.[key]])
    .filter(([, , value]) => String(value || "").trim());

  return (
    <section className="panel">
      <div className="panel-label">
        <span className={`program-tag ${panel.program}`}>{panelProgramLabel(panel)}</span>
      </div>
      <div className="panel-body">
        <h4>{visualCue}</h4>

        <div className="panel-qa-list">
          {qaRows.map(([key, label, value]) => (
            <div className="panel-qa-row" key={key}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {factChips.length > 0 && (
          <div className="panel-fact-block">
            <span className="panel-chip-label">Quick facts</span>
            <div className="panel-fact-chips" aria-label={`${visualCue} card facts`}>
              {factChips.map((chip) => <span key={chip}>{chip}</span>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function SourceList({ refs }) {
  return (
    <div className="source-list">
      {refs.map((ref) => (
        <a className="source-chip" href={ref.url} target="_blank" rel="noreferrer" key={`${ref.label}-${ref.url}`}>
          {ref.label}
        </a>
      ))}
    </div>
  );
}


export default function UnifiedStateCard({
  card,
  sourceRefs,
  briefing,
  briefingLoading,
  onRefreshBriefing,
  onOpenChallenge,
  isBackExpanded,
  onBackExpandedChange,
  panelManifest
}) {
  const [flipped, setFlipped] = useState(false);
  const [displayBack, setDisplayBack] = useState(false);
  const [flipPhase, setFlipPhase] = useState(null); // null | "out" | "in"
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 50, y: 50, angle: 120 });
  const [isHovered, setIsHovered] = useState(false);
  const tiltRef = useRef(null);
  const flipTimers = useRef([]);
  const cardStory = getCardStory(card);
  const counts = getRosterCounts(card);
  const olympicCue = getPanelVisualCue(card.olympicPanel);
  const paralympicCue = getPanelVisualCue(card.paralympicPanel);

  useEffect(() => {
    flipTimers.current.forEach(clearTimeout);
    flipTimers.current = [];
    setFlipped(false);
    setDisplayBack(false);
    setFlipPhase(null);
    setTilt({ x: 0, y: 0 });
    onBackExpandedChange?.(false);
  }, [card.stateCode]);

  function toggleFlip() {
    if (flipPhase !== null) return;
    setFlipPhase("out");
    setTilt({ x: 0, y: 0 });

    const t1 = setTimeout(() => {
      const next = !flipped;
      if (!next) onBackExpandedChange?.(false);
      setFlipped(next);
      setDisplayBack(next);
      setFlipPhase("in");
    }, 150);

    const t2 = setTimeout(() => {
      setFlipPhase(null);
    }, 300);

    flipTimers.current = [t1, t2];
  }

  function handleMouseMove(e) {
    if (displayBack || flipPhase !== null) return;
    const el = tiltRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width;
    const dy = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (0.5 - dy) * 18, y: (dx - 0.5) * 26 });
    setMousePos({ x: dx * 100, y: dy * 100, angle: dx * 180 + dy * 90 + 60 });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }

  const frontClass = [
    "sports-card-face sports-card-front",
    displayBack ? "face-hidden" : "",
    !displayBack && flipPhase === "out" ? "flip-out" : "",
    !displayBack && flipPhase === "in" ? "flip-in" : "",
  ].filter(Boolean).join(" ");

  const backClass = [
    "sports-card-face sports-card-back",
    !displayBack ? "face-hidden" : "",
    displayBack && flipPhase === "in" ? "flip-in" : "",
    displayBack && flipPhase === "out" ? "flip-out" : "",
  ].filter(Boolean).join(" ");

  return (
    <section className="sports-card-shell">
      <div className="card-3d-viewport">
        <div
          ref={tiltRef}
          className="card-tilt-layer"
          style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={() => setIsHovered(true)}
        >
          <div
            className={`sports-card ${isHovered && !displayBack ? "is-hovered" : ""}`}
            style={{ "--holo-x": `${mousePos.x}%`, "--holo-y": `${mousePos.y}%`, "--holo-angle": `${mousePos.angle}deg` }}
          >
            <article
              className={frontClass}
              aria-label={`${card.stateName} state card front — click to flip`}
              role="button"
              tabIndex={displayBack ? -1 : 0}
              onClick={toggleFlip}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFlip(); } }}
            >
              <CardArt card={card} panelManifest={panelManifest} />
            </article>

            <article className={backClass} aria-label={`${card.stateName} state card data`}>
              {isBackExpanded ? (
                <div className="card-back-scroll">
                  <div className="card-header">
                    <p className="eyebrow">Shared geography view</p>
                    <h3>{card.stateName}</h3>
                    <p>{card.geographySnapshot}</p>
                    <div className="metric-row compact-metrics">
                      <span className="metric">State total <strong>{counts.total}</strong></span>
                      <span className="metric">Olympic count <strong>{counts.olympic}</strong></span>
                      <span className="metric">Paralympic count <strong>{counts.paralympic}</strong></span>
                    </div>
                  </div>
                  <div className="program-panel-grid">
                    <SportPanel panel={card.olympicPanel} />
                    <SportPanel panel={card.paralympicPanel} />
                  </div>
                  <section className="trait-band">
                    <div className="trait-badge">
                      <span>Shared trait across both featured sports</span>
                      <strong>{card.sharedTrait.name}</strong>
                    </div>
                    <p>This trait connects Olympic <strong>{olympicCue}</strong> and Paralympic <strong>{paralympicCue}</strong>: {card.sharedTrait.description}</p>
                  </section>
                  <BriefingPanel payload={briefing} loading={briefingLoading} onRefresh={onRefreshBriefing} compact />
                  <div className="card-footer">
                    <SourceList refs={sourceRefs} />
                    <button className="primary-button" type="button" onClick={onOpenChallenge}>Try the State Sync Challenge</button>
                  </div>
                </div>
              ) : (
                <CompactCardBack
                  card={card}
                  briefing={briefing}
                  onReadFullBriefing={() => onBackExpandedChange?.(true)}
                />
              )}
            </article>
          </div>
        </div>
      </div>

      <div className="card-action-row">
        <button className="ghost-button" type="button" onClick={toggleFlip}>
          {flipped ? "Flip to art" : "Flip to data"}
        </button>
        <button className="primary-button" type="button" onClick={onOpenChallenge}>Try the State Sync Challenge</button>
      </div>
    </section>
  );
}
