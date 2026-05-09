import React from "react";
import TopNav from "../components/navigation/TopNav.jsx";
import Icon from "../components/common/Icon.jsx";
import AppFooter from "../components/common/AppFooter.jsx";

function LandingPage({ onNavigate, onLogin, onLogout, darkMode, onToggleDarkMode, onOpenHelp, authLoading, isLoggedIn, user }) {
  return (
    <div className="landing-page">
      <TopNav
        onNavigate={onNavigate}
        onLogin={onLogin}
        onLogout={onLogout}
        darkMode={darkMode}
        onToggleDarkMode={onToggleDarkMode}
        onOpenHelp={onOpenHelp}
        authLoading={authLoading}
        isLoggedIn={isLoggedIn}
        user={user}
      />

      <section className="landing-hero">
        <div className="landing-section-inner">
          <div className="landing-hero-container">
            <img className="landing-hero-graphic" src="/assets/graphics/Hero Graphic.png" alt="" aria-hidden="true" />
            <div className="landing-hero-content">
              <p className="eyebrow landing-eyebrow">Team USA Discovery</p>
              <h1 className="landing-hero-title">Explore Team USA Athlete Hubs</h1>
              <p className="landing-hero-body">Discover how public Team USA athlete hometown data, geography, climate, and community signals could help reveal regional patterns across the USA.</p>
              <div className="landing-cta-row">
                <button className="primary-button" type="button" onClick={() => onNavigate("/map")}>Explore the Map</button>
                <button className="ghost-button hero-features-btn" type="button" onClick={() => document.getElementById("landing-features")?.scrollIntoView({ behavior: "smooth" })}>
                  See How It Works <Icon name="arrow-down" size={16} strokeWidth={2} />
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
                <img src="/assets/graphics/Interactive Map.png" alt="Interactive U.S. map showing Team USA Athlete Hub data" />
              </div>
              <h3>Interactive Map</h3>
              <p>Click any hub to explore aggregate hometown representation, sport presence, and regional geography signals.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-img">
                <img src="/assets/graphics/State Cards.png" alt="Athlete Hub Cards" />
              </div>
              <h3>Athlete Hub Cards</h3>
              <p>Unlock a card for each hub with top cities, sport categories, and key public-data takeaways.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-img">
                <img src="/assets/graphics/Fan Challenges.png" alt="Fan Challenges" />
              </div>
              <h3>Fan Challenges</h3>
              <p>Try short challenges that help fans learn how regional landscapes and communities connect to Team USA sport presence.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta2">
        <div className="landing-section-inner landing-cta2-inner">
          <h2 className="landing-cta2-title">Start Exploring Today</h2>
          <p className="landing-cta2-body">No account required to explore. Select hubs on the map to reveal Athlete Hub cards and learn how regional patterns connect to Team USA sport presence.</p>
          <button className="primary-button" type="button" onClick={() => onNavigate("/map")}>Begin Exploring</button>
        </div>
      </section>

      <AppFooter onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} />
    </div>
  );
}

export default LandingPage;
