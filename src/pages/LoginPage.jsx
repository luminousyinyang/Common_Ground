import React, { useLayoutEffect, useRef, useState } from "react";
import TopNav from "../components/navigation/TopNav.jsx";

function LoginPage({ onNavigate, onLogin, darkMode, onToggleDarkMode }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const loginTabRef = useRef(null);
  const createTabRef = useRef(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const el = (tab === "login" ? loginTabRef : createTabRef).current;
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);

  function handleSubmit(e) {
    e.preventDefault();
    onLogin();
  }

  return (
    <div className="login-page">
      <TopNav onNavigate={onNavigate} onLogin={onLogin} darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />

      <div className="login-layout">
        <div className="login-left">
          <img className="login-left-graphic" src="/assets/graphics/Login Graphic.png" alt="" aria-hidden="true" />
          <div className="login-left-overlay">
            <h2 className="login-left-title">Common Ground</h2>
            <p className="login-left-tagline">Discover. Collect. Connect.</p>
            <p className="login-left-body">Track your state-card discoveries and save your collection across sessions. Build your complete 50-state card set.</p>
          </div>
        </div>

        <div className="login-right">
          <div className="login-form-wrap">
            <div className="login-tabs" role="tablist">
              <button ref={loginTabRef} className={`login-tab ${tab === "login" ? "is-active" : ""}`} type="button" role="tab" aria-selected={tab === "login"} onClick={() => setTab("login")}>Login</button>
              <button ref={createTabRef} className={`login-tab ${tab === "create" ? "is-active" : ""}`} type="button" role="tab" aria-selected={tab === "create"} onClick={() => setTab("create")}>Create Account</button>
              {indicator.width > 0 && (
                <div className="login-tab-indicator" style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }} aria-hidden="true" />
              )}
            </div>

            {tab === "login" && (
              <form className="login-form" onSubmit={handleSubmit}>
                <div className="login-form-header">
                  <h3>Welcome back</h3>
                  <p>Sign in to save your collection</p>
                </div>
                <label className="login-field">
                  <span>Email</span>
                  <input className="login-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                </label>
                <label className="login-field">
                  <span>Password</span>
                  <div className="login-password-wrap">
                    <input className="login-input" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                    <button className="login-pw-toggle" type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? "hide" : "show"}
                    </button>
                  </div>
                </label>
                <button className="login-forgot" type="button">Forgot password?</button>
                <button className="primary-button login-submit" type="submit">Log In</button>
                <div className="login-or"><span>or</span></div>
                <button className="ghost-button login-google" type="button">Continue with Google</button>
                <p className="login-terms">By continuing you agree to our <button className="login-terms-link" type="button">Terms of Service</button></p>
              </form>
            )}

            {tab === "create" && (
              <form className="login-form" onSubmit={handleSubmit}>
                <div className="login-form-header">
                  <h3>Create your account</h3>
                  <p>Start tracking your discoveries</p>
                </div>
                <label className="login-field">
                  <span>Name</span>
                  <input className="login-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
                </label>
                <label className="login-field">
                  <span>Email</span>
                  <input className="login-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                </label>
                <label className="login-field">
                  <span>Password</span>
                  <div className="login-password-wrap">
                    <input className="login-input" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" autoComplete="new-password" />
                    <button className="login-pw-toggle" type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? "hide" : "show"}
                    </button>
                  </div>
                </label>
                <button className="primary-button login-submit" type="submit">Create Account</button>
                <div className="login-or"><span>or</span></div>
                <button className="ghost-button login-google" type="button">Continue with Google</button>
                <p className="login-terms">By creating an account you agree to our <button className="login-terms-link" type="button">Terms of Service</button></p>
              </form>
            )}
          </div>
        </div>
      </div>

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

export default LoginPage;
