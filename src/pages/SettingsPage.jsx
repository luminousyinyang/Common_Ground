import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/common/Icon.jsx";

function displayName(user) {
  return user?.name || user?.email?.split("@")[0] || "Signed in";
}

function userInitial(user) {
  const src = user?.firstName || displayName(user);
  return src.trim().charAt(0).toUpperCase() || "G";
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="settings-toggle-row">
      <div className="settings-toggle-info">
        <span className="settings-toggle-label">{label}</span>
        {description && <span className="settings-toggle-desc">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`settings-toggle${checked ? " is-on" : ""}`}
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      >
        <span className="settings-toggle-thumb" />
      </button>
    </label>
  );
}

function SettingsPage({ settings, onUpdate, onResetCollection, onResetProgress, onNavigate, user, isLoggedIn }) {
  const [resetConfirm, setResetConfirm] = useState(null);
  const [resetBusy, setResetBusy] = useState(null);
  const [resetError, setResetError] = useState("");
  const headingRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleReset(type) {
    if (resetConfirm === type) {
      setResetBusy(type);
      setResetError("");
      try {
        if (type === "collection") await onResetCollection();
        else await onResetProgress();
        setResetConfirm(null);
      } catch (error) {
        setResetError(error.message || "Could not reset progress.");
      } finally {
        setResetBusy(null);
      }
    } else {
      setResetError("");
      setResetConfirm(type);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button
          className="settings-back-btn"
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back to map"
        >
          <Icon name="arrow-left" size={18} strokeWidth={2} />
        </button>
        <h1
          className="settings-title"
          id="settings-heading"
          tabIndex={-1}
          ref={headingRef}
        >
          Settings
        </h1>
      </div>

      <div className="settings-body">
        {isLoggedIn && (
          <div className="settings-profile">
            <div className="settings-profile-avatar" aria-hidden="true">{userInitial(user)}</div>
            <div className="settings-profile-info">
              <div className="settings-profile-name">{displayName(user)}</div>
              {user?.email && <div className="settings-profile-email">{user.email}</div>}
            </div>
          </div>
        )}

        <section className="settings-section" aria-labelledby="a11y-heading">
          <h2 className="settings-section-title" id="a11y-heading">Accessibility</h2>
          <div className="settings-section-body">
            <ToggleRow
              label="Dark mode"
              description="Switch to a dark color surface"
              checked={settings.darkMode}
              onChange={(v) => onUpdate({ darkMode: v })}
            />
            <ToggleRow
              label="Reduce motion"
              description="Minimize animations and transitions throughout the app"
              checked={settings.reduceMotion}
              onChange={(v) => onUpdate({ reduceMotion: v })}
            />
            <ToggleRow
              label="Larger text"
              description="Increase base text size for better readability"
              checked={settings.largeText}
              onChange={(v) => onUpdate({ largeText: v })}
            />
            <ToggleRow
              label="High contrast"
              description="Enhance text and border contrast"
              checked={settings.highContrast}
              onChange={(v) => onUpdate({ highContrast: v })}
            />
            <ToggleRow
              label="Always show focus rings"
              description="Keep visible focus outlines on all interactive elements"
              checked={settings.alwaysShowFocus}
              onChange={(v) => onUpdate({ alwaysShowFocus: v })}
            />
          </div>
        </section>

        {isLoggedIn && <section className="settings-section" aria-labelledby="data-heading">
          <h2 className="settings-section-title" id="data-heading">Data & Progress</h2>
          <div className="settings-section-body">
            <p className="settings-info-text">
              Collection and challenge progress is saved to your account and mirrored in this browser.
            </p>
            <div className="settings-danger-row">
              <div>
                <div className="settings-danger-label">Reset collection</div>
                <div className="settings-danger-desc">Remove all discovered sports cards</div>
              </div>
              <button
                type="button"
                className={`settings-danger-btn${resetConfirm === "collection" ? " is-confirm" : ""}`}
                onClick={() => handleReset("collection")}
                disabled={Boolean(resetBusy)}
              >
                {resetBusy === "collection" ? "Resetting..." : resetConfirm === "collection" ? "Confirm reset" : "Reset"}
              </button>
            </div>
            <div className="settings-danger-row">
              <div>
                <div className="settings-danger-label">Reset all progress</div>
                <div className="settings-danger-desc">Remove all challenges and collection data</div>
              </div>
              <button
                type="button"
                className={`settings-danger-btn${resetConfirm === "progress" ? " is-confirm" : ""}`}
                onClick={() => handleReset("progress")}
                disabled={Boolean(resetBusy)}
              >
                {resetBusy === "progress" ? "Resetting..." : resetConfirm === "progress" ? "Confirm reset" : "Reset"}
              </button>
            </div>
            {resetError ? <p className="settings-reset-error">{resetError}</p> : null}
            {resetConfirm && (
              <button type="button" className="ghost-button small" onClick={() => setResetConfirm(null)} disabled={Boolean(resetBusy)}>
                Cancel
              </button>
            )}
          </div>
        </section>}

        <div className="settings-about">
          <p>Common Ground · Team USA hometown discovery</p>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
