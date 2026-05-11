import React from "react";
import { Outlet } from "react-router-dom";
import TopNav from "../navigation/TopNav.jsx";
import AppFooter from "../common/AppFooter.jsx";

function AppShell({ onNavigate, onLogin, onLogout, darkMode, onToggleDarkMode, onOpenHelp, authLoading, isLoggedIn, user }) {
  return (
    <div className="app-frame-v2">
      <a href="#main-content" className="skip-link">Skip to main content</a>
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
        <main id="main-content" aria-label="Main content">
          <Outlet />
        </main>
      </div>
      <AppFooter onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} />
    </div>
  );
}

export default AppShell;
