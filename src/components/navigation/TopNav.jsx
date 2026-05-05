import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';

export default function TopNav({ page, view, onViewChange, onNavigate, onLogin, darkMode, onToggleDarkMode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const CLOSE_MS = 340;
  const mapTabRef = useRef(null);
  const collTabRef = useRef(null);
  const [pillBase, setPillBase] = useState({ left: 0, width: 0 });
  const [dragDelta, setDragDelta] = useState(0);
  const dragRef = useRef({ active: false, startX: 0, startView: null });

  useLayoutEffect(() => {
    const activeRef = (page === "app" && view === "collection") ? collTabRef : mapTabRef;
    const el = activeRef.current;
    if (!el) return;
    setPillBase({ left: el.offsetLeft, width: el.offsetWidth });
  }, [page, view]);

  function handleNavPointerDown(e) {
    if (page !== "app") return;
    const startView = view === "collection" ? "collection" : "explorer";
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
      onNavigate("app", "collection");
    } else if (startView === "collection" && -delta > span / 2) {
      onNavigate("app", "explorer");
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

  function go(targetPage, targetView) {
    onNavigate(targetPage, targetView);
    closeMenu();
  }

  return (
    <>
      <header className={`top-nav${menuOpen ? " has-menu-open" : ""}`}>
        <div className="top-nav-inner">
          <button className="top-nav-brand" type="button" onClick={() => go("landing")} aria-label="Common Ground home">
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
            {page === "app" && pillBase.width > 0 && (
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
              className={`top-nav-tab ${page === "app" && view === "explorer" ? "is-active" : ""}`}
              type="button"
              onClick={() => onNavigate("app", "explorer")}
            >
              <Icon name="map" size={15} />
              <span className="nav-tab-label">Map</span>
            </button>
            <button
              ref={collTabRef}
              className={`top-nav-tab ${page === "app" && view === "collection" ? "is-active" : ""}`}
              type="button"
              onClick={() => onNavigate("app", "collection")}
            >
              <Icon name="cards" size={15} />
              <span className="nav-tab-label">Collection</span>
            </button>
          </nav>
          <div className="top-nav-actions">
            <button className="top-nav-icon-btn" type="button" onClick={onToggleDarkMode} aria-label="Toggle dark mode">
              <Icon name={darkMode ? "sun" : "moon"} size={16} strokeWidth={1.6} />
            </button>
            <button className="top-nav-login-btn" type="button" onClick={onLogin}>Login</button>
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
            <button className="top-nav-brand" type="button" onClick={() => go("landing")}>
              Common Ground
            </button>
            <button className="mobile-menu-close" type="button" onClick={closeMenu} aria-label="Close menu">
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          </div>

          <nav className="mobile-menu-nav">
            <button
              className={`mobile-menu-link${page === "landing" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("landing")}
              style={{ "--i": 0 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="home" size={26} strokeWidth={1.4} /></span>
              Home
            </button>
            <button
              className={`mobile-menu-link${page === "app" && view === "explorer" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("app", "explorer")}
              style={{ "--i": 1 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="map" size={26} strokeWidth={1.4} /></span>
              Map
            </button>
            <button
              className={`mobile-menu-link${page === "app" && view === "collection" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("app", "collection")}
              style={{ "--i": 2 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="cards" size={26} strokeWidth={1.4} /></span>
              Collection
            </button>
          </nav>
          <div className="mobile-menu-sep" style={{ "--i": 3 }} />
          <div className="mobile-menu-foot">
            <button
              className="mobile-menu-row"
              type="button"
              onClick={onToggleDarkMode}
              style={{ "--i": 4 }}
            >
              <span>{darkMode ? "Light mode" : "Dark mode"}</span>
              <Icon name={darkMode ? "sun" : "moon"} size={20} strokeWidth={1.5} />
            </button>
            <button
              className="primary-button mobile-menu-login"
              type="button"
              onClick={() => { onLogin(); closeMenu(); }}
              style={{ "--i": 5 }}
            >
              Login
            </button>
          </div>
        </div>
      )}
    </>
  );
}
