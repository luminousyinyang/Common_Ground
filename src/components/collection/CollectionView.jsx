import React from "react";
import { getCardThemeLabel, titleBucket } from "../../lib/stateCard.js";
import Icon from "../common/Icon.jsx";
import CardArt from "../cards/CardArt.jsx";

function MiniStateCard({ card, discovered, onSelect, panelManifest }) {
  return (
    <button
      className={`mini-card ${discovered ? "is-discovered" : "is-locked"}`}
      type="button"
      onClick={discovered ? () => onSelect(card.stateCode) : undefined}
      disabled={!discovered}
      aria-label={discovered ? `Open ${card.stateName} card` : `${card.stateName} — locked`}
    >
      <div className="mini-card-art-wrap">
        <CardArt card={card} compact panelManifest={panelManifest} />
        {!discovered && (
          <div className="mini-card-lock-overlay">
            <Icon name="lock" size={24} strokeWidth={1.8} />
          </div>
        )}
      </div>
      <div className="mini-card-body">
        <div>
          <strong>{card.sharedTrait.name}</strong>
          <span>{getCardThemeLabel(card)}</span>
        </div>
        <span className={`discover-pill ${discovered ? "is-discovered" : ""}`}>{discovered ? "Discovered" : "Preview"}</span>
      </div>
      <div className="mini-card-signals">
        <span className="signal-mini olympic">Olympic: {titleBucket(card.olympicPanel.aggregateSignal)}</span>
        <span className="signal-mini paralympic">Paralympic: {titleBucket(card.paralympicPanel.aggregateSignal)}</span>
      </div>
    </button>
  );
}

function CollectionView({ states, discoveredCodes, onSelect, panelManifest, isLoggedIn, onLogin }) {
  const discoveredStates = states.filter((card) => discoveredCodes.has(card.stateCode));
  const previewStates = states.filter((card) => !discoveredCodes.has(card.stateCode)).slice(0, 12);
  const remaining = states.length - discoveredStates.length;

  return (
    <section className="collection-view page-panel">
      {!isLoggedIn && (
        <div className="collection-gate">
          <div className="collection-gate-content">
            <span className="collection-gate-icon"><Icon name="cards" size={32} strokeWidth={1.3} /></span>
            <h2 className="collection-gate-title">Your Collection Awaits</h2>
            <p className="collection-gate-body">Sign in to save your discovered cards, track your progress across all 50 states, and build your fan collection.</p>
            <button className="primary-button" type="button" onClick={onLogin}>Login to View Collection</button>
          </div>
          <div className="collection-gate-blur" aria-hidden="true">
            <div className="collection-header">
              <div>
                <p className="eyebrow">Collection</p>
                <h2>My Sport Cards</h2>
              </div>
            </div>
            <div className="card-grid">
              {states.slice(0, 12).map((card) => (
                <MiniStateCard key={card.stateCode} card={card} discovered={discoveredCodes.has(card.stateCode)} onSelect={() => {}} panelManifest={panelManifest} />
              ))}
            </div>
          </div>
        </div>
      )}
      {isLoggedIn && <>
      <div className="collection-header">
        <div>
          <p className="eyebrow">Your collection</p>
          <h2>My Sport Cards</h2>
          <p>Cards appear here after you select states on the map.</p>
        </div>
        <div className="collection-progress-stack">
          <span className="collection-count">{discoveredStates.length} / {states.length}</span>
          <div className="collection-progress-track" aria-hidden="true">
            <div className="collection-progress-fill" style={{ width: `${Math.round((discoveredStates.length / states.length) * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="card-grid">
        {discoveredStates.map((card) => (
          <MiniStateCard key={card.stateCode} card={card} discovered onSelect={onSelect} panelManifest={panelManifest} />
        ))}
      </div>

      {previewStates.length > 0 && (
        <>
          <div className="section-divider" />
          <p className="eyebrow muted-eyebrow">Locked — explore on the map to unlock ({remaining} remaining)</p>
          <div className="card-grid compact-grid">
            {previewStates.map((card) => (
              <MiniStateCard key={card.stateCode} card={card} discovered={false} onSelect={onSelect} panelManifest={panelManifest} />
            ))}
          </div>
        </>
      )}
      </>}
    </section>
  );
}

export { MiniStateCard };
export default CollectionView;
