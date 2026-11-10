import { useEffect, type ReactNode } from "react";
import type { FileInfo, Post } from "../../shared/types";
import { useApp } from "../app-context";
import { downloadUrl, extension, fileUrl, formatSize, hostname, isAudio, isImage, isVideo, timeAgo } from "../utils";
import { CloseIcon, DownloadIcon, PinIcon } from "./Icons";
import { Menu, type MenuItem } from "./Menu";

const URL_SPLIT = /(https?:\/\/[^\s<>"']+)/g;

function linkify(text: string): ReactNode[] {
  return text.split(URL_SPLIT).map((part, i) => {
    if (i % 2 === 0) return part;
    const trailing = part.match(/[.,!?)\]]+$/)?.[0] ?? "";
    const url = trailing ? part.slice(0, -trailing.length) : part;
    return (
      <span key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
        {trailing}
      </span>
    );
  });
}

interface PostCardProps {
  post: Post;
  onOpenImage: (file: FileInfo) => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

export function PostCard({ post, onOpenImage, onEdit, onDelete, onTogglePin }: PostCardProps) {
  const { admin } = useApp();
  const images = post.files.filter((f) => isImage(f.type));
  const media = post.files.filter((f) => isVideo(f.type) || isAudio(f.type));
  const others = post.files.filter((f) => !isImage(f.type) && !isVideo(f.type) && !isAudio(f.type));
  // 링크만 붙여넣은 글은 주소를 반복해서 보여주지 않는다
  const bodyIsOnlyLink = !!post.link && post.body.trim().replace(/\/$/, "") === post.link.url.replace(/\/$/, "");

  const items: MenuItem[] = [];
  if (admin) items.push({ label: post.pinned ? "고정 해제" : "상단 고정", onSelect: onTogglePin });
  if (post.mine || admin) {
    items.push({ label: "수정", onSelect: onEdit });
    items.push({ label: "삭제", danger: true, onSelect: onDelete });
  }

  return (
    <article className={`note note-${post.color}`}>
      {images.length > 0 && (
        <div className={images.length === 1 ? "note-images" : "note-images note-images-grid"}>
          {images.map((file) => (
            <button key={file.id} onClick={() => onOpenImage(file)} aria-label={`${file.name} 크게 보기`}>
              <img src={fileUrl(file.id)} alt={file.name} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="note-content">
        {post.body && !bodyIsOnlyLink && <p className="note-body">{linkify(post.body)}</p>}

        {post.link && (
          <a className="link-card" href={post.link.url} target="_blank" rel="noopener noreferrer">
            {post.link.image && (
              <img
                src={post.link.image}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <span className="link-card-text">
              <strong>{post.link.title ?? post.link.url}</strong>
              <small>{hostname(post.link.url)}</small>
            </span>
          </a>
        )}

        {media.map((file) =>
          isVideo(file.type) ? (
            <video key={file.id} className="note-media" src={fileUrl(file.id)} controls preload="metadata" playsInline />
          ) : (
            <audio key={file.id} className="note-media" src={fileUrl(file.id)} controls preload="none" />
          ),
        )}

        {[...media, ...others].length > 0 && (
          <ul className="file-list">
            {[...media, ...others].map((file) => (
              <li key={file.id}>
                <a href={downloadUrl(file.id)} download={file.name} className="file-row">
                  <span className="file-ext">{extension(file.name)}</span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatSize(file.size)}</span>
                  <DownloadIcon size={16} />
                </a>
              </li>
            ))}
          </ul>
        )}

        <footer className="note-foot">
          <span className="note-meta">
            {post.pinned && (
              <span className="note-pin" title="상단 고정">
                <PinIcon size={13} />
              </span>
            )}
            <span className="note-author">{post.author}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={new Date(post.createdAt).toISOString()}>{timeAgo(post.createdAt)}</time>
          </span>
          <Menu items={items} />
        </footer>
      </div>
    </article>
  );
}

export function Lightbox({ file, onClose }: { file: FileInfo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose}>
      <img src={fileUrl(file.id)} alt={file.name} onClick={(e) => e.stopPropagation()} />
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span>{file.name}</span>
        <a className="icon-btn" href={downloadUrl(file.id)} download={file.name} aria-label="내려받기">
          <DownloadIcon />
        </a>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
