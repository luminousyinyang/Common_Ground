import React, { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

function HelpModal({ open, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="help-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div
        className="help-panel"
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="help-header">
          <h2 className="help-title" id="help-title">How to use Common Ground</h2>
          <button className="help-close-btn" type="button" onClick={onClose} aria-label="Close help">
            <Icon name="close" size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="help-body">
          <ol className="help-steps">
            <li className="help-step">
              <div className="help-step-icon"><Icon name="map" size={20} strokeWidth={1.6} /></div>
              <div className="help-step-text">
                <p className="help-step-title">Explore the map</p>
                <p className="help-step-desc">Click any Athlete Hub to open its card and add it to your collection. Hover to preview the hub name.</p>
              </div>
            </li>
            <li className="help-step">
              <div className="help-step-icon"><Icon name="locate" size={20} strokeWidth={1.6} /></div>
              <div className="help-step-text">
                <p className="help-step-title">Zoom & pan</p>
                <p className="help-step-desc">Scroll or pinch to zoom in and out. Click and drag to pan around the map. On mobile, use one finger to drag.</p>
              </div>
            </li>
            <li className="help-step">
              <div className="help-step-icon"><Icon name="cards" size={20} strokeWidth={1.6} /></div>
              <div className="help-step-text">
                <p className="help-step-title">Your collection</p>
                <p className="help-step-desc">Head to the <strong>Collection</strong> tab to browse all the sports cards you've discovered. Click a card to flip it and read the back.</p>
              </div>
            </li>
            <li className="help-step">
              <div className="help-step-icon"><Icon name="game" size={20} strokeWidth={1.6} /></div>
              <div className="help-step-text">
                <p className="help-step-title">Fan skill challenges</p>
                <p className="help-step-desc">Open any Athlete Hub card and tap <strong>Play Challenge</strong> or <strong>Fan Challenge</strong> on the back. Each challenge is a short mini-game inspired by that hub's featured sport trait.</p>
              </div>
            </li>
            <li className="help-step">
              <div className="help-step-icon"><Icon name="settings" size={20} strokeWidth={1.6} /></div>
              <div className="help-step-text">
                <p className="help-step-title">Settings & accessibility</p>
                <p className="help-step-desc">Open <strong>Settings</strong> to toggle dark mode, reduce motion, larger text, high contrast, and more.</p>
              </div>
            </li>
          </ol>
        </div>

        <div className="help-footer">
          <span className="help-footer-tip">Press <kbd className="help-kbd">Shift</kbd> + <kbd className="help-kbd">/</kbd> to open this anytime</span>
          <button className="help-footer-close-btn" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default HelpModal;
