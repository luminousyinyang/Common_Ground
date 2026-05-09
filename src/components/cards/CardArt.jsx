import React, { useEffect, useState } from "react";
import { CARD_ART } from "../../lib/constants.js";
import { featuredPanelsForCard, getCardTheme, getCardThemeName, getPanelArtUrl, getPanelVisualCue, shortProgramName } from "../../lib/stateCard.js";

function PanelArtImage({ src, fallback }) {
  const [didError, setDidError] = useState(false);

  useEffect(() => {
    setDidError(false);
  }, [src]);

  return (
    <img
      src={didError ? fallback : src}
      alt=""
      aria-hidden="true"
      onError={() => setDidError(true)}
    />
  );
}

function CommonGroundSeal() {
  return (
    <span className="art-center-seal" aria-hidden="true">
      <span />
    </span>
  );
}

function CardArt({ card, compact = false }) {
  const theme = getCardTheme(card);
  const fallback = CARD_ART[theme] || CARD_ART.neutral;
  const themeName = getCardThemeName(card);
  const featuredPanels = featuredPanelsForCard(card);
  const displayPanels = featuredPanels.length ? featuredPanels : [card.olympicPanel, card.paralympicPanel].filter(Boolean);
  const isSinglePanel = displayPanels.length === 1;

  return (
    <div className={`card-art card-art-${theme} ${compact ? "is-compact" : ""}`}>
      <div className={`card-art-stack ${isSinglePanel ? "is-single-panel" : ""}`}>
        {displayPanels.map((panel) => (
          <div className={`card-art-panel ${panel.program}-art-panel`} key={panel.program}>
            <PanelArtImage src={getPanelArtUrl(card, panel.program)} fallback={fallback} />
            <div className="art-vignette" />
            <span className="art-panel-label">{shortProgramName(panel.program)}</span>
            {!compact && <strong className="art-panel-sport">{getPanelVisualCue(panel)}</strong>}
          </div>
        ))}
      </div>
      <div className={`art-state-lockup ${compact ? "" : "is-simple"}`}>
        <strong>{card.stateName}</strong>
        {compact && <span>{themeName}</span>}
      </div>
    </div>
  );
}

export default CardArt;
