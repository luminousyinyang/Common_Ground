import React, { useEffect, useRef, useState } from "react";
import { ACTIVE_CARD_EXPERIENCE } from "../../lib/constants.js";
import UnifiedStateCard from "./UnifiedStateCard.jsx";

function CardModal({
  card,
  sourceRefs,
  briefing,
  briefingLoading,
  onRefreshBriefing,
  onOpenChallenge,
  onClose,
  onCollect,
  isUnlocked,
  defaultFlipped = false,
  defaultIsBackExpanded = false,
}) {
  const [isBackExpanded, setIsBackExpanded] = useState(defaultIsBackExpanded);
  const { openAnimation, interaction, cardLayout } = ACTIVE_CARD_EXPERIENCE;

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prevModalCodeRef = useRef(null);
  useEffect(() => {
    if (prevModalCodeRef.current === null) {
      prevModalCodeRef.current = card.stateCode;
      return;
    }
    if (prevModalCodeRef.current === card.stateCode) return;
    prevModalCodeRef.current = card.stateCode;
    setIsBackExpanded(false);
  }, [card.stateCode]);

  return (
    <div className="card-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${card.stateName} state insight card`}>
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
          onCollect={onCollect}
          isUnlocked={isUnlocked}
          initialFlipped={defaultFlipped}
        />
      </div>
    </div>
  );
}

export default CardModal;
