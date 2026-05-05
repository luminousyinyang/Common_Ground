import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EMPTY_CARD_PANEL_MANIFEST, PANEL_QA_ROWS } from "../../lib/constants.js";
import {
  briefingSections,
  compactPanelCopy,
  compactStateConnection,
  featuredSportsIntro,
  getCardThemeName,
  getGeographySignals,
  getPanelBackCopyForDisplay,
  getPanelVisualCue,
  getRosterCounts,
  normalizeHometownAreaRows,
  panelProgramLabel,
  titleBucket
} from "../../lib/stateCard.js";
import Icon from "../common/Icon.jsx";
import CardArt from "./CardArt.jsx";

function SourceList({ refs }) {
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

function SourceMethodPanel({ refs }) {
  return (
    <section className="source-method-panel" aria-label="Sources and method">
      <span className="footer-panel-kicker">Sources & Method</span>
      <SourceList refs={refs} />
      <p>Public Team USA roster records are grouped by hometown state and city. Gemini turns aggregate state, sport, and geography inputs into the state briefing and sport-lens notes.</p>
    </section>
  );
}

function StateChallengePanel({ stateName, isUnlocked, onOpenChallenge }) {
  return (
    <section className="state-challenge-panel" aria-label={`${stateName} state challenge`}>
      <div className="state-challenge-copy">
        <span className="footer-panel-kicker">State Sync Challenge</span>
        <p>
          {isUnlocked
            ? `${stateName} state card unlocked. Replay the mini-game anytime.`
            : `Play the mini-game to unlock the ${stateName} state card.`}
        </p>
      </div>
      <button className="primary-button state-challenge-button" type="button" onClick={onOpenChallenge}>
        {isUnlocked ? "Replay Challenge" : "Play Challenge"}
      </button>
    </section>
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

function FeaturedSportsIntro({ card }) {
  return (
    <section className="featured-sports-intro">
      <span>Featured sport lenses</span>
      <p>{featuredSportsIntro(card)}</p>
    </section>
  );
}

function BriefingPanel({ payload, loading, onRefresh, compact = false }) {
  if (loading || !payload) {
    return (
      <section className={`briefing-panel ${compact ? "is-compact" : ""}`}>
        <div className="panel-heading-row">
          <div className="briefing-heading-copy">
            <h3>Gemini State Briefing</h3>
            <p>Generated from aggregate public roster + geography inputs.</p>
          </div>
          <button className="ghost-button small" type="button" onClick={onRefresh}>Refresh</button>
        </div>
        <p>Generating a safe, conditional briefing...</p>
      </section>
    );
  }
  const sections = briefingSections(payload.briefing);

  return (
    <section className={`briefing-panel ${compact ? "is-compact" : ""}`}>
      <div className="panel-heading-row">
        <div className="briefing-heading-copy">
          <h3>Gemini State Briefing</h3>
          <p>Generated from aggregate public roster + geography inputs.</p>
        </div>
        <button className="ghost-button small" type="button" onClick={onRefresh}>Refresh</button>
      </div>
      <div className="briefing-section-grid">
        {sections.map(([label, value]) => (
          <article className="briefing-section" key={label}>
            <span>{label}</span>
            {Array.isArray(value) ? (
              <div className="briefing-list">
                {value.map((item) => (
                  typeof item === "object" && item !== null
                    ? <p key={`${item.theme || item.area}-${item.detail}`}><strong>{item.theme || item.area}:</strong> {item.detail}</p>
                    : <p key={item}>{item}</p>
                ))}
              </div>
            ) : (
              <p>{value}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function HometownAreaRow({ area }) {
  return (
    <article className="hometown-area-row">
      <span className="hometown-area-rank">{area.rank}</span>
      <div className="hometown-area-copy">
        <strong>{area.label}</strong>
        <p>{area.detail}</p>
      </div>
    </article>
  );
}

function HometownAreasDialog({ stateName, areas, onClose }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="hometown-area-dialog-backdrop" role="dialog" aria-modal="true" aria-label={`${stateName} hometown areas`}>
      <button className="hometown-area-dialog-scrim" type="button" aria-label="Close hometown areas" onClick={onClose} />
      <section className="hometown-area-dialog-panel">
        <div className="hometown-area-dialog-heading">
          <div>
            <p className="eyebrow">Team USA roster view</p>
            <h3>{stateName} Athlete Hometowns</h3>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Close hometown areas" />
        </div>
        <div className="hometown-area-dialog-list">
          {areas.map((area) => (
            <HometownAreaRow key={`${area.rank}-${area.label}`} area={area} />
          ))}
        </div>
        <p className="hometown-area-note">Only aggregate city labels and public Team USA athlete records by hometown are shown.</p>
      </section>
    </div>,
    document.body
  );
}

function HometownAreasCard({ card, payload, compact = false }) {
  const [showAll, setShowAll] = useState(false);
  const rows = normalizeHometownAreaRows(card, payload?.briefing);
  const previewRows = rows.slice(0, 3);

  useEffect(() => {
    setShowAll(false);
  }, [card?.stateCode]);

  if (!previewRows.length) return null;

  return (
    <section className={`hometown-areas-card ${compact ? "is-compact" : ""}`}>
      <div className="panel-heading-row hometown-areas-heading">
        <div>
          <p className="eyebrow">Team USA roster view</p>
          <h3>Top Athlete Hometowns</h3>
        </div>
        <button className="ghost-button small hometown-see-all-button" type="button" onClick={() => setShowAll(true)}>
          <Icon name="list" size={14} strokeWidth={2} />
          <span>See all</span>
        </button>
      </div>
      <div className="hometown-area-list">
        {previewRows.map((area) => (
          <HometownAreaRow key={`${area.rank}-${area.label}`} area={area} />
        ))}
      </div>
      <p className="hometown-area-note">City-level aggregate public Team USA athlete records by hometown, not a complete athlete census.</p>
      {showAll && (
        <HometownAreasDialog
          stateName={card.stateName}
          areas={rows}
          onClose={() => setShowAll(false)}
        />
      )}
    </section>
  );
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
  const scrollRef = useRef(null);
  const [hasMoreToScroll, setHasMoreToScroll] = useState(false);
  const themeName = getCardThemeName(card);
  const olympicCue = getPanelVisualCue(card.olympicPanel);
  const paralympicCue = getPanelVisualCue(card.paralympicPanel);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setHasMoreToScroll(el.scrollHeight - el.clientHeight > 3);
  }, [card.stateCode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    let frame = 0;
    const updateScrollCue = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const remainingScroll = el.scrollHeight - el.clientHeight - el.scrollTop;
        setHasMoreToScroll(remainingScroll > 3);
      });
    };

    updateScrollCue();
    el.addEventListener("scroll", updateScrollCue, { passive: true });
    window.addEventListener("resize", updateScrollCue);

    let resizeObserver;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(updateScrollCue);
      resizeObserver.observe(el);
      Array.from(el.children).forEach((child) => resizeObserver.observe(child));
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      el.removeEventListener("scroll", updateScrollCue);
      window.removeEventListener("resize", updateScrollCue);
      resizeObserver?.disconnect();
    };
  }, [card.stateCode, briefing]);

  function scrollCompactBack() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: Math.max(120, el.clientHeight * 0.56), behavior: "smooth" });
  }

  return (
    <div className={`compact-back-shell ${hasMoreToScroll ? "has-more-scroll" : ""}`}>
      <div className="compact-card-back" ref={scrollRef}>
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

      {hasMoreToScroll && (
        <button className="compact-back-scroll-cue" type="button" aria-label="Scroll card details" onClick={scrollCompactBack}>
          <Icon name="arrow-down" size={17} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function StateSummary({ card }) {
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

function UnifiedStateCard({
  card,
  sourceRefs,
  briefing,
  briefingLoading,
  onRefreshBriefing,
  onOpenChallenge,
  isBackExpanded,
  onBackExpandedChange,
  panelManifest = EMPTY_CARD_PANEL_MANIFEST,
  isUnlocked = false
}) {
  const [flipped, setFlipped] = useState(false);
  const [displayBack, setDisplayBack] = useState(false);
  const [flipPhase, setFlipPhase] = useState(null); // null | "out" | "in"
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 50, y: 50, angle: 120 });
  const [isHovered, setIsHovered] = useState(false);
  const tiltRef = useRef(null);
  const flipTimers = useRef([]);
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
    !isUnlocked ? "is-locked" : "",
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
              {!isUnlocked && (
                <div className="card-locked-overlay">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span>Play State Sync Challenge to unlock</span>
                </div>
              )}
            </article>

            <article className={backClass} aria-label={`${card.stateName} state card data`}>
              {isBackExpanded ? (
                <div className="card-back-scroll">
                  <div className="card-header">
                    <p className="eyebrow">Shared geography view</p>
                    <h3>{card.stateName}</h3>
                    <p>{card.geographySnapshot}</p>
                    <div className="metric-row compact-metrics">
                      <span className="metric">State athlete records <strong>{counts.total}</strong></span>
                      <span className="metric">Olympic athlete records <strong>{counts.olympic}</strong></span>
                      <span className="metric">Paralympic athlete records <strong>{counts.paralympic}</strong></span>
                    </div>
                    <p className="metric-row-note">Public Team USA roster records by hometown state, not a complete athlete census.</p>
                  </div>
                  <HometownAreasCard card={card} payload={briefing} compact />
                  <FeaturedSportsIntro card={card} />
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
                  <SourceMethodPanel refs={sourceRefs} />
                  <StateChallengePanel stateName={card.stateName} isUnlocked={isUnlocked} onOpenChallenge={onOpenChallenge} />
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
        {isUnlocked ? (
          <button className="primary-button" type="button" onClick={onOpenChallenge}>Replay State Sync Challenge</button>
        ) : (
          <button className="primary-button card-unlock-btn" type="button" onClick={onOpenChallenge}>
            Unlock State Card
          </button>
        )}
      </div>
    </section>
  );
}

export { StateSummary, SportPanel, BriefingPanel, SourceList, SourceMethodPanel, StateChallengePanel, HometownAreasCard, HometownAreaRow, HometownAreasDialog, CompactCardBack, CompactSportLens };
export default UnifiedStateCard;
