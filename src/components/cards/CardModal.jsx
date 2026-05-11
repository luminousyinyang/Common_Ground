import React, { useEffect, useRef, useState } from "react";
import { ACTIVE_CARD_EXPERIENCE } from "../../lib/constants.js";
import UnifiedStateCard from "./UnifiedStateCard.jsx";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef(null);
  const returnFocusRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  // Move focus into modal on open; restore on unmount
  useEffect(() => {
    const returnTo = returnFocusRef.current;
    const firstFocusable = panelRef.current?.querySelector(FOCUSABLE);
    (firstFocusable || panelRef.current)?.focus();
    return () => { returnTo?.focus?.(); };
  }, []);

  // Focus trap
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) { event.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
      <div className={`card-modal-panel card-open-${openAnimation.id} card-interaction-${interaction.id} card-layout-${cardLayout.id} ${isBackExpanded ? "is-back-expanded" : ""}`} ref={panelRef} tabIndex={-1}>
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
