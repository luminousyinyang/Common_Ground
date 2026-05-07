import React from "react";
import { Outlet } from "react-router-dom";
import TopNav from "../navigation/TopNav.jsx";

function AppShell({ onNavigate, onLogin, onLogout, darkMode, onToggleDarkMode, onOpenHelp, authLoading, isLoggedIn, user }) {
  return (
    <div className="app-frame-v2">
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
      <div className="workspace-v2">
        <main>
          <Outlet />
        </main>
      </div>
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div>
            <strong className="landing-footer-brand">Common Ground</strong>
            <p>Team USA hometown discovery tool</p>
          </div>
          <nav className="landing-footer-nav" aria-label="Footer">
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("/map")}>Map</button>
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("/collection")}>Collection</button>
            <button className="landing-footer-link" type="button" onClick={isLoggedIn ? onLogout : () => onNavigate("/login")}>{isLoggedIn ? "Log out" : "Login"}</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default AppShell;
