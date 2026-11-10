import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import { AppContext, type AppContextValue, type ConfirmOptions } from "./app-context";
import { Modal } from "./components/Modal";
import { usePath } from "./router";
import { Home } from "./pages/Home";
import { Board } from "./pages/Board";
import { Admin } from "./pages/Admin";

const NAME_KEY = "sticky.name";

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

interface NamePrompt {
  resolve: (name: string | null) => void;
}

interface ConfirmPrompt extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export function App() {
  const path = usePath();
  const [admin, setAdmin] = useState(false);
  const [name, setName] = useState(readName);
  const [namePrompt, setNamePrompt] = useState<NamePrompt | null>(null);
  const [confirmPrompt, setConfirmPrompt] = useState<ConfirmPrompt | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    api<{ admin: boolean }>("/api/me")
      .then((me) => setAdmin(me.admin))
      .catch(() => {});
  }, []);

  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3200);
  }, []);

  const askName = useCallback(() => new Promise<string | null>((resolve) => setNamePrompt({ resolve })), []);

  const context = useMemo<AppContextValue>(
    () => ({
      admin,
      setAdmin,
      name,
      editName: () => void askName(),
      requireName: () => (nameRef.current ? Promise.resolve(nameRef.current) : askName()),
      toast,
      confirm: (options) => new Promise<boolean>((resolve) => setConfirmPrompt({ ...options, resolve })),
    }),
    [admin, name, askName, toast],
  );

  const saveName = (value: string) => {
    setName(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      // 저장소를 쓸 수 없으면 이번 방문 동안만 유지한다
    }
    namePrompt?.resolve(value);
    setNamePrompt(null);
  };

  const boardSlug = path.match(/^\/b\/([^/]+)\/?$/)?.[1];

  return (
    <AppContext.Provider value={context}>
      {boardSlug ? <Board key={boardSlug} slug={boardSlug} /> : path === "/admin" ? <Admin /> : <Home />}

      {namePrompt && (
        <NameDialog
          initial={name}
          onSave={saveName}
          onClose={() => {
            namePrompt.resolve(null);
            setNamePrompt(null);
          }}
        />
      )}

      {confirmPrompt && (
        <Modal
          size="sm"
          onClose={() => {
            confirmPrompt.resolve(false);
            setConfirmPrompt(null);
          }}
        >
          <div className="confirm">
            <h2>{confirmPrompt.title}</h2>
            {confirmPrompt.message && <p>{confirmPrompt.message}</p>}
            <div className="confirm-actions">
              <button
                className="btn"
                onClick={() => {
                  confirmPrompt.resolve(false);
                  setConfirmPrompt(null);
                }}
              >
                취소
              </button>
              <button
                className={confirmPrompt.danger ? "btn btn-danger" : "btn btn-primary"}
                autoFocus
                onClick={() => {
                  confirmPrompt.resolve(true);
                  setConfirmPrompt(null);
                }}
              >
                {confirmPrompt.confirmLabel ?? "확인"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

function NameDialog({ initial, onSave, onClose }: { initial: string; onSave: (name: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSave(trimmed);
  };
  return (
    <Modal title="이름" size="sm" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="게시물에 표시될 이름"
          maxLength={30}
          autoFocus
          autoComplete="off"
        />
        <button className="btn btn-primary btn-block" disabled={!value.trim()}>
          저장
        </button>
      </form>
    </Modal>
  );
}
