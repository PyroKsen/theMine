import React, { useMemo, useState } from "react";
import GameView from "./game/GameView.jsx";

const AUTH_STORAGE_KEY = "theMine.auth";

export default function App() {
  const [auth, setAuth] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return { token: "", username: "" };
  });
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const serverHttp =
    import.meta.env.VITE_SERVER_HTTP_URL || "http://localhost:8080";

  const isAuthed = Boolean(auth?.token);

  const subtitle = useMemo(() => {
    if (isAuthed && auth?.username) {
      return `Signed in as ${auth.username}`;
    }
    return "Online 2D prototype";
  }, [auth, isAuthed]);

  async function submitAuth(event) {
    event.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError("");
    try {
      const response = await fetch(`${serverHttp}/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "auth_failed");
      }
      const nextAuth = { token: data.token, username: data.username };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
      setAuth(nextAuth);
      setForm({ username: "", password: "" });
    } catch (err) {
      setError(err?.message || "auth_failed");
    } finally {
      setStatus("idle");
    }
  }

  function logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuth({ token: "", username: "" });
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">theMine</div>
        <div className="app-subtitle">{subtitle}</div>
        {isAuthed ? (
          <button className="ghost-btn" onClick={logout} type="button">
            Sign out
          </button>
        ) : null}
      </header>
      <div className="app-content">
        {isAuthed ? (
          <GameView token={auth.token} onAuthExpired={logout} />
        ) : (
          <div className="auth-wrap">
            <div className="auth-card">
              <div className="auth-title">
                {mode === "login" ? "Login" : "Register"}
              </div>
              <div className="auth-hint">
                {mode === "login"
                  ? "Enter your nickname and password."
                  : "Create a nickname and password."}
              </div>
              <form onSubmit={submitAuth} className="auth-form">
                <label className="auth-label">
                  Nickname
                  <input
                    className="auth-input"
                    value={form.username}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        username: event.target.value
                      }))
                    }
                    autoComplete="username"
                    minLength={3}
                    maxLength={20}
                    required
                  />
                </label>
                <label className="auth-label">
                  Password
                  <input
                    className="auth-input"
                    value={form.password}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        password: event.target.value
                      }))
                    }
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={4}
                    maxLength={64}
                    required
                  />
                </label>
                {error ? <div className="auth-error">{error}</div> : null}
                <button
                  className="primary-btn"
                  type="submit"
                  disabled={status === "loading"}
                >
                  {status === "loading"
                    ? "Please wait..."
                    : mode === "login"
                    ? "Enter the Mine"
                    : "Create account"}
                </button>
              </form>
              <button
                className="link-btn"
                type="button"
                onClick={() =>
                  setMode((prev) => (prev === "login" ? "register" : "login"))
                }
              >
                {mode === "login"
                  ? "Need an account? Register"
                  : "Already have an account? Login"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
