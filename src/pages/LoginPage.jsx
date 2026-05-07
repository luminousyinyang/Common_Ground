import React, { useLayoutEffect, useRef, useState } from "react";
import TopNav from "../components/navigation/TopNav.jsx";
import {
  authErrorMessage,
  loginWithEmail,
  loginWithGoogle,
  sendLoginReset,
  signupWithEmail
} from "../lib/authClient.js";

function LoginPage({
  onNavigate,
  onLogin,
  onLogout,
  onAuthSuccess,
  darkMode,
  onToggleDarkMode,
  onOpenHelp,
  authLoading,
  authError,
  isLoggedIn,
  sessionError,
  user
}) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const loginTabRef = useRef(null);
  const createTabRef = useRef(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const el = (tab === "login" ? loginTabRef : createTabRef).current;
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);

  function clearMessages() {
    setFormError("");
    setNotice("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearMessages();
    if (authError) {
      setFormError(authError);
      return;
    }

    setSubmitting(true);
    try {
      if (tab === "login") {
        await loginWithEmail(email, password);
      } else {
        await signupWithEmail({ email, password, firstName, lastName });
      }
      onAuthSuccess();
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    clearMessages();
    if (authError) {
      setFormError(authError);
      return;
    }

    setSubmitting(true);
    try {
      await loginWithGoogle();
      onAuthSuccess();
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    clearMessages();
    if (authError) {
      setFormError(authError);
      return;
    }
    if (!email.trim()) {
      setFormError("Enter your email first, then request a reset link.");
      return;
    }

    setSubmitting(true);
    try {
      await sendLoginReset(email);
      setNotice("Password reset email sent.");
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || authLoading;
  const activeError = formError || authError || sessionError;

  return (
    <div className="login-page">
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
                {activeError && <p className="login-message is-error">{activeError}</p>}
                {notice && <p className="login-message is-success">{notice}</p>}
                <label className="login-field">
                  <span>Email</span>
                  <input className="login-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
                </label>
                <label className="login-field">
                  <span>Password</span>
                  <div className="login-password-wrap">
                    <input className="login-input" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
                    <button className="login-pw-toggle" type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? "hide" : "show"}
                    </button>
                  </div>
                </label>
                <button className="login-forgot" type="button" onClick={handlePasswordReset} disabled={busy}>Forgot password?</button>
                <button className="primary-button login-submit" type="submit" disabled={busy}>{submitting ? "Logging in..." : "Log In"}</button>
                <div className="login-or"><span>or</span></div>
                <button className="ghost-button login-google" type="button" onClick={handleGoogleLogin} disabled={busy}>Continue with Google</button>
                <p className="login-terms">By continuing you agree to our <button className="login-terms-link" type="button">Terms of Service</button></p>
              </form>
            )}

            {tab === "create" && (
              <form className="login-form" onSubmit={handleSubmit}>
                <div className="login-form-header">
                  <h3>Create your account</h3>
                  <p>Start tracking your discoveries</p>
                </div>
                {activeError && <p className="login-message is-error">{activeError}</p>}
                {notice && <p className="login-message is-success">{notice}</p>}
                <div className="login-name-row">
                  <label className="login-field">
                    <span>First name</span>
                    <input className="login-input" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" autoComplete="given-name" required />
                  </label>
                  <label className="login-field">
                    <span>Last name</span>
                    <input className="login-input" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" autoComplete="family-name" required />
                  </label>
                </div>
                <label className="login-field">
                  <span>Email</span>
                  <input className="login-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
                </label>
                <label className="login-field">
                  <span>Password</span>
                  <div className="login-password-wrap">
                    <input className="login-input" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" autoComplete="new-password" required minLength={6} />
                    <button className="login-pw-toggle" type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? "hide" : "show"}
                    </button>
                  </div>
                </label>
                <button className="primary-button login-submit" type="submit" disabled={busy}>{submitting ? "Creating..." : "Create Account"}</button>
                <div className="login-or"><span>or</span></div>
                <button className="ghost-button login-google" type="button" onClick={handleGoogleLogin} disabled={busy}>Continue with Google</button>
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
