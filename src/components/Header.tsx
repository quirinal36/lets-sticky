import type { ReactNode } from "react";
import { useApp } from "../app-context";
import { Link } from "../router";
import { BackIcon, UserIcon } from "./Icons";

export function Header({ title, actions }: { title?: string; actions?: ReactNode }) {
  const { name, editName, admin } = useApp();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {title === undefined ? (
          <Link href="/" className="wordmark">
            <span className="wordmark-note" aria-hidden="true" />
            Sticky
          </Link>
        ) : (
          <div className="topbar-title">
            <Link href="/" className="icon-btn" aria-label="보드 목록">
              <BackIcon size={20} />
            </Link>
            <h1>{title}</h1>
          </div>
        )}
        <div className="topbar-actions">
          {actions}
          {admin && (
            <Link href="/admin" className="chip chip-admin">
              관리자
            </Link>
          )}
          <button className="chip" onClick={editName} title="내 이름">
            <UserIcon size={14} />
            <span>{name || "이름 설정"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
