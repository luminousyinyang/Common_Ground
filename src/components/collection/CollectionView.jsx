import React, { useState } from "react";
import Icon from "../common/Icon.jsx";
import CardArt from "../cards/CardArt.jsx";

const REGIONS = [
  { id: "all", label: "All" },
  { id: "northeast", label: "Northeast" },
  { id: "south", label: "South" },
  { id: "midwest", label: "Midwest" },
  { id: "west", label: "West" },
  { id: "territories", label: "Territories" },
];

const REGION_CODES = {
  northeast: new Set(["CT","ME","MA","NH","NJ","NY","PA","RI","VT"]),
  south:     new Set(["AL","AR","DC","DE","FL","GA","KY","LA","MD","MS","NC","OK","SC","TN","TX","VA","WV"]),
  midwest:   new Set(["IL","IN","IA","KS","MI","MN","MO","NE","ND","OH","SD","WI"]),
  west:      new Set(["AK","AZ","CA","CO","HI","ID","MT","NV","NM","OR","UT","WA","WY"]),
  territories: new Set(["VI"]),
};

function filterByRegion(cards, regionId) {
  if (regionId === "all") return cards;
  const codes = REGION_CODES[regionId];
  return cards.filter((card) => codes?.has(card.stateCode));
}

function MiniStateCard({ card, discovered, onSelect, panelManifest }) {
  return (
    <button
      className={`mini-card ${discovered ? "is-discovered" : "is-locked"}`}
      type="button"
      onClick={discovered ? () => onSelect(card.stateCode) : undefined}
      disabled={!discovered}
      aria-label={discovered ? `Open ${card.stateName} state insight card` : `${card.stateName} — not yet discovered`}
    >
      <div className="mini-card-art-wrap">
        <CardArt card={card} compact panelManifest={panelManifest} />
        {!discovered && (
          <div className="mini-card-lock-overlay">
            <Icon name="lock" size={24} strokeWidth={1.8} />
          </div>
        )}
      </div>
    </button>
  );
}

function CollectionView({ states, discoveredCodes, onSelect, panelManifest, isLoggedIn, authLoading, collectionSyncError, onLogin }) {
  const [activeRegion, setActiveRegion] = useState("all");
  const allDiscovered = states.filter((card) => discoveredCodes.has(card.stateCode));
  const allUndiscovered = states.filter((card) => !discoveredCodes.has(card.stateCode));
  const discoveredStates = filterByRegion(allDiscovered, activeRegion);
  const previewStates = filterByRegion(allUndiscovered, activeRegion).slice(0, 12);
  const remaining = allUndiscovered.length;

  return (
    <section className="collection-view">
      {authLoading && !isLoggedIn && (
        <div className="collection-auth-loading">Checking saved session...</div>
      )}
      {!isLoggedIn && !authLoading && (
        <div className="collection-gate">
          <div className="collection-gate-content">
            <span className="collection-gate-icon"><Icon name="cards" size={32} strokeWidth={1.3} /></span>
            <h2 className="collection-gate-title">Save your state insights</h2>
            <p className="collection-gate-body">Create an account to save discovered state cards, track your progress across all 50 states, and return to your collection anytime.</p>
            <button className="primary-button" type="button" onClick={onLogin}>Log in to Save Collection</button>
          </div>
          <div className="collection-gate-blur" aria-hidden="true">
            <div className="collection-header">
              <div>
                <p className="eyebrow">State Insight Cards</p>
                <h2>My State Insight Cards</h2>
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
      {collectionSyncError && isLoggedIn && (
        <p className="collection-sync-warning">{collectionSyncError}</p>
      )}
      {isLoggedIn && <>
      <div className="collection-header">
        <div>
          <p className="eyebrow">Your collection</p>
          <h2>My State Insight Cards</h2>
          <p>Browse every state you've discovered, compare state-level patterns, and complete your 50-state collection.</p>
        </div>
        <div className="collection-progress-stack">
          <span className="collection-count">{allDiscovered.length} / {states.length}</span>
          <div className="collection-progress-track" aria-hidden="true">
            <div className="collection-progress-fill" style={{ width: `${Math.round((allDiscovered.length / states.length) * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="collection-filter-row" role="group" aria-label="Filter by region">
        {REGIONS.map((region) => (
          <button
            key={region.id}
            type="button"
            className={`filter-tag${activeRegion === region.id ? " is-active" : ""}`}
            onClick={() => setActiveRegion(region.id)}
            aria-pressed={activeRegion === region.id}
          >
            {region.label}
          </button>
        ))}
      </div>

      <div className="card-grid">
        {discoveredStates.map((card) => (
          <MiniStateCard key={card.stateCode} card={card} discovered onSelect={onSelect} panelManifest={panelManifest} />
        ))}
      </div>

      {previewStates.length > 0 && (
        <>
          <div className="section-divider" />
          <p className="eyebrow muted-eyebrow">Not yet discovered — explore the map to unlock ({remaining} remaining)</p>
          <div className="card-grid">
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
