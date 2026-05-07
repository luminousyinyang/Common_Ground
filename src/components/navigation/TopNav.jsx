import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "../common/Icon.jsx";

function displayNameForUser(user) {
  return user?.name || user?.email || "Signed in";
}

function initialForUser(user) {
  const source = user?.firstName || displayNameForUser(user);
  return source.trim().charAt(0).toUpperCase() || "C";
}

function TopNav({ onNavigate, onLogin, onLogout, darkMode, onToggleDarkMode, onOpenHelp, authLoading, isLoggedIn, user }) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const CLOSE_MS = 360;
  const mapTabRef = useRef(null);
  const collTabRef = useRef(null);
  const [pillBase, setPillBase] = useState({ left: 0, width: 0 });
  const [dragDelta, setDragDelta] = useState(0);
  const dragRef = useRef({ active: false, startX: 0, startView: null });
  const accountMenuRef = useRef(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const isAppPage = pathname === "/map" || pathname === "/collection" || pathname === "/challenge" || pathname === "/methodology" || pathname === "/settings";
  const isTabPage = pathname === "/map" || pathname === "/collection";

  useLayoutEffect(() => {
    if (!isTabPage) return;
    const activeRef = pathname === "/collection" ? collTabRef : mapTabRef;
    const el = activeRef.current;
    if (!el) return;
    setPillBase({ left: el.offsetLeft, width: el.offsetWidth });
  }, [pathname]);

  function handleNavPointerDown(e) {
    if (!isTabPage) return;
    const startView = pathname === "/collection" ? "collection" : "explorer";
    dragRef.current = { active: true, startX: e.clientX, startView, delta: 0 };
    setDragDelta(0);
  }

  function handleNavPointerMove(e) {
    if (!dragRef.current.active) return;
    const raw = e.clientX - dragRef.current.startX;
    const mapEl = mapTabRef.current;
    const collEl = collTabRef.current;
    if (!mapEl || !collEl) return;
    const span = collEl.offsetLeft - mapEl.offsetLeft;
    const clamped = dragRef.current.startView === "explorer"
      ? Math.max(0, Math.min(raw, span))
      : Math.max(-span, Math.min(raw, 0));
    dragRef.current.delta = clamped;
    setDragDelta(clamped);
  }

  function handleNavPointerUp() {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const { delta = 0, startView } = dragRef.current;
    if (Math.abs(delta) < 6) { setDragDelta(0); return; }
    const mapEl = mapTabRef.current;
    const collEl = collTabRef.current;
    if (!mapEl || !collEl) { setDragDelta(0); return; }
    const span = collEl.offsetLeft - mapEl.offsetLeft;
    if (startView === "explorer" && delta > span / 2) {
      onNavigate("/collection");
    } else if (startView === "collection" && -delta > span / 2) {
      onNavigate("/map");
    }
    setDragDelta(0);
  }

  function openMenu() {
    setMenuMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setMenuOpen(true)));
  }

  function closeMenu() {
    setMenuOpen(false);
    setTimeout(() => setMenuMounted(false), CLOSE_MS);
  }

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname, isLoggedIn]);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  function go(path) {
    setMenuOpen(false);
    setAccountMenuOpen(false);
    setTimeout(() => setMenuMounted(false), CLOSE_MS);
    onNavigate(path);
  }

  function handleMenuPlaceholder() {
    setAccountMenuOpen(false);
  }

  function handleAccountLogout() {
    setAccountMenuOpen(false);
    onLogout?.();
  }

  return (
    <>
      <header className={`top-nav${menuOpen ? " has-menu-open" : ""}`}>
        <div className="top-nav-inner">
          <button className="top-nav-brand" type="button" onClick={() => go("/")} aria-label="Common Ground home">
            Common Ground
          </button>
          <nav
            className="top-nav-center"
            aria-label="Primary navigation"
            onPointerDown={handleNavPointerDown}
            onPointerMove={handleNavPointerMove}
            onPointerUp={handleNavPointerUp}
            onPointerCancel={handleNavPointerUp}
            style={{ touchAction: "none" }}
          >
            {isTabPage && pillBase.width > 0 && (
              <div
                className="nav-sliding-pill"
                style={{
                  width: pillBase.width,
                  transform: `translateX(${pillBase.left + dragDelta}px)`,
                  transition: dragRef.current.active ? "none" : undefined,
                }}
                aria-hidden="true"
              />
            )}
            <button
              ref={mapTabRef}
              className={`top-nav-tab ${pathname === "/map" ? "is-active" : ""}`}
              type="button"
              onClick={() => onNavigate("/map")}
            >
              <Icon name="map" size={15} />
              <span className="nav-tab-label">Map</span>
            </button>
            <button
              ref={collTabRef}
              className={`top-nav-tab ${pathname === "/collection" ? "is-active" : ""}`}
              type="button"
              onClick={() => onNavigate("/collection")}
            >
              <Icon name="cards" size={15} />
              <span className="nav-tab-label">Collection</span>
            </button>
          </nav>
          <div className="top-nav-actions">
            {isLoggedIn ? (
              <>
                <button className="top-nav-icon-btn" type="button" onClick={onToggleDarkMode} aria-label="Toggle dark mode" data-tooltip={darkMode ? "Light mode" : "Dark mode"}>
                  <Icon name={darkMode ? "sun" : "moon"} size={16} strokeWidth={1.6} />
                </button>
                <button className="top-nav-icon-btn" type="button" onClick={onOpenHelp} aria-label="Help" data-tooltip="Help">
                  <Icon name="help" size={16} strokeWidth={1.6} />
                </button>
                <div className={`top-nav-user-menu${accountMenuOpen ? " is-open" : ""}`} ref={accountMenuRef}>
                  <button
                    className="top-nav-avatar-btn"
                    type="button"
                    aria-label={`Account menu for ${displayNameForUser(user)}`}
                    aria-haspopup="menu"
                    aria-expanded={accountMenuOpen}
                    aria-controls="top-nav-account-menu"
                    onClick={() => setAccountMenuOpen((open) => !open)}
                  >
                    <span className="top-nav-avatar" aria-hidden="true">{initialForUser(user)}</span>
                  </button>
                  <div id="top-nav-account-menu" className="top-nav-user-popover" role="menu">
                    <button className="top-nav-menu-item" type="button" onClick={() => go("/settings")} role="menuitem">
                      <Icon name="settings" size={16} strokeWidth={1.8} />
                      <span>Settings</span>
                    </button>
                    <button className="top-nav-menu-item" type="button" onClick={handleAccountLogout} role="menuitem">
                      <Icon name="log-out" size={16} strokeWidth={1.8} />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <button className="top-nav-icon-btn" type="button" onClick={onToggleDarkMode} aria-label="Toggle dark mode" data-tooltip={darkMode ? "Light mode" : "Dark mode"}>
                  <Icon name={darkMode ? "sun" : "moon"} size={16} strokeWidth={1.6} />
                </button>
                <button className="top-nav-icon-btn" type="button" onClick={onOpenHelp} aria-label="Help" data-tooltip="Help">
                  <Icon name="help" size={16} strokeWidth={1.6} />
                </button>
                <button className="top-nav-icon-btn" type="button" onClick={() => onNavigate("/settings")} aria-label="Settings" data-tooltip="Settings">
                  <Icon name="settings" size={16} strokeWidth={1.6} />
                </button>
                <button className="top-nav-login-btn" type="button" onClick={onLogin} disabled={authLoading}>
                  {authLoading ? "Checking..." : "Login"}
                </button>
              </>
            )}
          </div>
          <button
            className={`hamburger-btn${menuOpen ? " is-open" : ""}`}
            type="button"
            onClick={menuOpen ? closeMenu : openMenu}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
          </button>
        </div>
      </header>

      {menuMounted && (
        <div
          id="mobile-menu"
          className={`mobile-menu-overlay${menuOpen ? " is-open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="mobile-menu-header">
            <button className="top-nav-brand" type="button" onClick={() => go("/")}>
              Common Ground
            </button>
            <button className="mobile-menu-close" type="button" onClick={closeMenu} aria-label="Close menu">
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          </div>

          <nav className="mobile-menu-nav">
            <button
              className={`mobile-menu-link${pathname === "/" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("/")}
              style={{ "--i": 0 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="home" size={26} strokeWidth={1.4} /></span>
              Home
            </button>
            <button
              className={`mobile-menu-link${pathname === "/map" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("/map")}
              style={{ "--i": 1 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="map" size={26} strokeWidth={1.4} /></span>
              Map
            </button>
            <button
              className={`mobile-menu-link${pathname === "/collection" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("/collection")}
              style={{ "--i": 2 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="cards" size={26} strokeWidth={1.4} /></span>
              Collection
            </button>
            <button
              className={`mobile-menu-link${pathname === "/settings" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("/settings")}
              style={{ "--i": 3 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="settings" size={26} strokeWidth={1.4} /></span>
              Settings
            </button>
          </nav>
          <div className="mobile-menu-sep" style={{ "--i": 4 }} />
          <div className="mobile-menu-foot">
            <div className="mobile-menu-rows">
              <button
                className="mobile-menu-row"
                type="button"
                onClick={onToggleDarkMode}
                style={{ "--i": 5 }}
              >
                <span>{darkMode ? "Light mode" : "Dark mode"}</span>
                <Icon name={darkMode ? "sun" : "moon"} size={20} strokeWidth={1.5} />
              </button>
              <button
                className="mobile-menu-row"
                type="button"
                onClick={() => { onOpenHelp(); closeMenu(); }}
                style={{ "--i": 6 }}
              >
                <span>Help</span>
                <Icon name="help" size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="mobile-menu-login-wrap">
              <button
                className="primary-button mobile-menu-login"
                type="button"
                onClick={() => { isLoggedIn ? onLogout?.() : onLogin(); closeMenu(); }}
                style={{ "--i": 7 }}
              >
                {isLoggedIn ? "Log out" : "Login"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TopNav;
