import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useApp } from "../app-context";
import { Header } from "../components/Header";
import { navigate } from "../router";

export function Admin() {
  const { admin, setAdmin, toast } = useApp();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/login", { method: "POST", body: { password } });
      setAdmin(true);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    setAdmin(false);
    toast("로그아웃했습니다.");
    navigate("/");
  };

  return (
    <>
      <Header />
      <main className="page page-narrow">
        <h1 className="page-title">관리자</h1>
        {admin ? (
          <div className="stack">
            <p className="muted">이 브라우저는 관리자로 로그인되어 있습니다.</p>
            <button className="btn" onClick={logout}>
              로그아웃
            </button>
          </div>
        ) : (
          <form onSubmit={login} className="stack">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoFocus
              autoComplete="current-password"
            />
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={!password || busy}>
              로그인
            </button>
          </form>
        )}
      </main>
    </>
  );
}
