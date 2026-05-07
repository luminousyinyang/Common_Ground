import React from "react";

function AppFooter({ onNavigate, isLoggedIn, onLogout }) {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div>
          <strong className="landing-footer-brand">Common Ground</strong>
          <p>Team USA hometown discovery tool</p>
        </div>
        <nav className="landing-footer-nav" aria-label="Footer">
          <button className="landing-footer-link" type="button" onClick={() => onNavigate("/map")}>Map</button>
          <button className="landing-footer-link" type="button" onClick={() => onNavigate("/collection")}>Collection</button>
          <button
            className="landing-footer-link"
            type="button"
            onClick={isLoggedIn ? () => onNavigate("/settings") : () => onNavigate("/login")}
          >
            {isLoggedIn ? "Settings" : "Login"}
          </button>
        </nav>
      </div>
    </footer>
  );
}

export default AppFooter;
