import React, { useEffect, useState } from "react";
import { CARD_ART, EMPTY_CARD_PANEL_MANIFEST } from "../../lib/constants.js";
import { getCardTheme, getCardThemeName, getPanelArtUrl, getPanelVisualCue, shortProgramName } from "../../lib/stateCard.js";

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

function CardArt({ card, compact = false, panelManifest = EMPTY_CARD_PANEL_MANIFEST }) {
  const theme = getCardTheme(card);
  const fallback = CARD_ART[theme] || CARD_ART.neutral;
  const olympicSrc = getPanelArtUrl(card, "olympic", panelManifest);
  const paralympicSrc = getPanelArtUrl(card, "paralympic", panelManifest);
  const themeName = getCardThemeName(card);

  return (
    <div className={`card-art card-art-${theme} ${compact ? "is-compact" : ""}`}>
      <div className="card-art-stack">
        <div className="card-art-panel olympic-art-panel">
          <PanelArtImage src={olympicSrc} fallback={fallback} />
          <div className="art-vignette" />
          <span className="art-panel-label">{shortProgramName(card.olympicPanel.program)}</span>
          {!compact && <strong className="art-panel-sport">{getPanelVisualCue(card.olympicPanel)}</strong>}
        </div>
        <div className="card-art-panel paralympic-art-panel">
          <PanelArtImage src={paralympicSrc} fallback={fallback} />
          <div className="art-vignette" />
          <span className="art-panel-label">{shortProgramName(card.paralympicPanel.program)}</span>
          {!compact && <strong className="art-panel-sport">{getPanelVisualCue(card.paralympicPanel)}</strong>}
        </div>
      </div>
      <div className="art-state-lockup">
        <strong>{card.stateName}</strong>
        <span>{compact ? themeName : "State Sync Challenge"}</span>
        {!compact && <em>{themeName} · {card.sharedTrait.name}</em>}
      </div>
    </div>
  );
}

export default CardArt;
