import { useEffect, useState } from 'react';
import { ACTIVE_CARD_EXPERIENCE } from '../../lib/constants.js';
import UnifiedStateCard from './UnifiedStateCard.jsx';

export default function CardModal({
  card,
  sourceRefs,
  briefing,
  briefingLoading,
  onRefreshBriefing,
  onOpenChallenge,
  onClose,
  panelManifest
}) {
  const [isBackExpanded, setIsBackExpanded] = useState(false);
  const { openAnimation, interaction, cardLayout } = ACTIVE_CARD_EXPERIENCE;

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setIsBackExpanded(false);
  }, [card.stateCode]);

  return (
    <div className="card-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${card.stateName} sports card`}>
      <button className="modal-scrim" type="button" aria-label="Close state card" onClick={onClose} />
      <div className={`card-modal-panel card-open-${openAnimation.id} card-interaction-${interaction.id} card-layout-${cardLayout.id} ${isBackExpanded ? "is-back-expanded" : ""}`}>
        <div className="modal-close-row">
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Close state card" />
        </div>
        <UnifiedStateCard
          card={card}
          sourceRefs={sourceRefs}
          briefing={briefing}
          briefingLoading={briefingLoading}
          onRefreshBriefing={onRefreshBriefing}
          onOpenChallenge={onOpenChallenge}
          isBackExpanded={isBackExpanded}
          onBackExpandedChange={setIsBackExpanded}
          panelManifest={panelManifest}
        />
      </div>
    </div>
  );
}
