import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { BoardSummary } from "../../shared/types";
import { api } from "../api";
import { useApp } from "../app-context";
import { Header } from "../components/Header";
import { ChevronIcon, PlusIcon } from "../components/Icons";
import { Menu } from "../components/Menu";
import { Modal } from "../components/Modal";
import { Link, navigate } from "../router";

type Editing = { mode: "create" } | { mode: "rename"; board: BoardSummary };

export function Home() {
  const { admin, toast, confirm } = useApp();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = useCallback(() => {
    api<{ boards: BoardSummary[] }>("/api/boards")
      .then((data) => setBoards(data.boards))
      .catch((err: Error) => toast(err.message));
  }, [toast]);

  useEffect(load, [load]);

  const remove = async (board: BoardSummary) => {
    const ok = await confirm({
      title: `"${board.title}" 보드를 삭제할까요?`,
      message: "게시물, 첨부 파일, 설문 응답이 모두 삭제되며 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/boards/${board.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      toast((err as Error).message);
    }
  };

  return (
    <>
      <Header />
      <main className="page">
        <div className="page-head">
          <h1 className="page-title">보드</h1>
          {admin && (
            <button className="btn btn-primary" onClick={() => setEditing({ mode: "create" })}>
              <PlusIcon size={16} />새 보드
            </button>
          )}
        </div>

        {boards === null ? null : boards.length === 0 ? (
          <p className="empty">아직 보드가 없습니다.</p>
        ) : (
          <ul className="board-list">
            {boards.map((board) => (
              <li key={board.id}>
                <Link href={`/b/${board.slug}`} className="board-row">
                  <span className="board-row-title">{board.title}</span>
                  <span className="board-row-meta">
                    게시물 {board.postCount}
                    {board.surveyCount > 0 && ` · 설문 ${board.surveyCount}`}
                  </span>
                  <span className="board-row-arrow">
                    <ChevronIcon size={16} />
                  </span>
                </Link>
                {admin && (
                  <Menu
                    items={[
                      { label: "이름 변경", onSelect: () => setEditing({ mode: "rename", board }) },
                      { label: "삭제", danger: true, onSelect: () => void remove(board) },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {!admin && (
          <Link href="/admin" className="admin-link">
            관리자
          </Link>
        )}
      </main>

      {editing && (
        <BoardDialog
          editing={editing}
          onClose={() => setEditing(null)}
          onDone={(slug) => {
            setEditing(null);
            if (slug) navigate(`/b/${slug}`);
            else load();
          }}
        />
      )}
    </>
  );
}

function BoardDialog({ editing, onClose, onDone }: { editing: Editing; onClose: () => void; onDone: (createdSlug?: string) => void }) {
  const { toast } = useApp();
  const [title, setTitle] = useState(editing.mode === "rename" ? editing.board.title : "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      if (editing.mode === "create") {
        const { board } = await api<{ board: { slug: string } }>("/api/boards", { method: "POST", body: { title } });
        onDone(board.slug);
      } else {
        await api(`/api/boards/${editing.board.id}`, { method: "PATCH", body: { title } });
        onDone();
      }
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={editing.mode === "create" ? "새 보드" : "보드 이름 변경"} size="sm" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 11월 12일 수업"
          maxLength={80}
          autoFocus
        />
        <button className="btn btn-primary btn-block" disabled={!title.trim() || busy}>
          {editing.mode === "create" ? "만들기" : "저장"}
        </button>
      </form>
    </Modal>
  );
}
