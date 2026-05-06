import React from "react";
import TopNav from "../components/navigation/TopNav.jsx";
import Icon from "../components/common/Icon.jsx";

function LandingPage({ onNavigate, onLogin, darkMode, onToggleDarkMode }) {
  return (
    <div className="landing-page">
      <TopNav onNavigate={onNavigate} onLogin={onLogin} darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />

      <section className="landing-hero">
        <div className="landing-section-inner">
          <div className="landing-hero-container">
            <img className="landing-hero-graphic" src="/assets/graphics/Hero Graphic.png" alt="" aria-hidden="true" />
            <div className="landing-hero-content">
              <p className="eyebrow landing-eyebrow">Team USA Discovery</p>
              <h1 className="landing-hero-title">Explore Team USA by State</h1>
              <p className="landing-hero-body">Click a state to discover the number of athletes, minigames, and collect cards.</p>
              <div className="landing-cta-row">
                <button className="primary-button" type="button" onClick={() => onNavigate("/map")}>Explore the Map</button>
                <button className="ghost-button hero-features-btn" type="button" onClick={() => document.getElementById("landing-features")?.scrollIntoView({ behavior: "smooth" })}>
                  View Features <Icon name="arrow-down" size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-features" id="landing-features">
        <div className="landing-section-inner">
          <h2 className="landing-features-heading">How it works</h2>
          <div className="landing-features-grid">
            <div className="landing-feature-card">
              <div className="landing-feature-img">
                <img src="/assets/graphics/Interactive Map.png" alt="Interactive Map" />
              </div>
              <h3>Interactive Map</h3>
              <p>Click any state to explore public aggregate counts and sport families across the US. Discovered states are highlighted as you build your collection.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-img">
                <img src="/assets/graphics/State Cards.png" alt="State Cards" />
              </div>
              <h3>State Cards</h3>
              <p>Collect digital cards for each state. Each card features Olympic and Paralympic programs with equal visual weight and a holographic shine on hover.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-img">
                <img src="/assets/graphics/Fan Challenges.png" alt="Fan Challenges" />
              </div>
              <h3>Fan Challenges</h3>
              <p>Try short fan challenges tied to the shared sport trait connecting each state's Olympic and Paralympic panels.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta2">
        <div className="landing-section-inner landing-cta2-inner">
          <h2 className="landing-cta2-title">Start Your Collection Today</h2>
          <p className="landing-cta2-body">No account required to explore. Select states on the map to unlock cards and track your journey across all 50 states.</p>
          <button className="primary-button" type="button" onClick={() => onNavigate("/map")}>Begin Exploring</button>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div>
            <strong className="landing-footer-brand">Common Ground</strong>
            <p>Geography-powered fan discovery</p>
          </div>
          <nav className="landing-footer-nav" aria-label="Footer">
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("/map")}>Map</button>
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("/collection")}>Collection</button>
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("/methodology")}>Methodology</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
