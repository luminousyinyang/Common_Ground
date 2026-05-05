import React from "react";
import TopNav from "../navigation/TopNav.jsx";

function ViewSlider({ activeIndex, children }) {
  return (
    <div className="view-slider-viewport">
      <div
        className="view-slider-track"
        style={{ transform: `translateX(${activeIndex * -100}%)` }}
      >
        {children}
      </div>
    </div>
  );
}

function AppShell({ view, setView, children, onNavigate, onLogin, darkMode, onToggleDarkMode }) {
  return (
    <div className="app-frame-v2">
      <TopNav
        page="app"
        view={view}
        onViewChange={(nextView) => setView(nextView)}
        onNavigate={onNavigate}
        onLogin={onLogin}
        darkMode={darkMode}
        onToggleDarkMode={onToggleDarkMode}
      />
      <div className="workspace-v2">
        <main>{children}</main>
      </div>
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div>
            <strong className="landing-footer-brand">Common Ground</strong>
            <p>Geography-powered fan discovery</p>
          </div>
          <nav className="landing-footer-nav" aria-label="Footer">
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("app", "explorer")}>Map</button>
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("app", "collection")}>Collection</button>
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("app", "methodology")}>Methodology</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export { ViewSlider };
export default AppShell;
