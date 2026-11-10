import { useEffect, useRef, useState } from "react";
import { COLORS, MAX_FILE_SIZE, MAX_FILES_PER_POST, type FileInfo, type NoteColor, type Post } from "../../shared/types";
import { api, uploadFile } from "../api";
import { useApp } from "../app-context";
import { formatSize } from "../utils";
import { ClipIcon, CloseIcon } from "./Icons";
import { Modal } from "./Modal";

const COLOR_KEY = "sticky.color";
const COLOR_NAMES: Record<NoteColor, string> = {
  white: "흰색",
  yellow: "노랑",
  peach: "살구",
  pink: "분홍",
  blue: "파랑",
  green: "초록",
};

interface Upload {
  key: number;
  file: File;
  progress: number;
  info?: FileInfo;
  error?: string;
  abort?: () => void;
}

function lastColor(): NoteColor {
  try {
    const saved = localStorage.getItem(COLOR_KEY) as NoteColor | null;
    if (saved && COLORS.includes(saved)) return saved;
  } catch {
    // 저장된 값이 없으면 기본색
  }
  return "yellow";
}

interface ComposerProps {
  slug: string;
  initialFiles?: File[];
  post?: Post;
  onClose: () => void;
  onDone: () => void;
}

export function Composer({ slug, initialFiles, post, onClose, onDone }: ComposerProps) {
  const { requireName, toast, confirm } = useApp();
  const [body, setBody] = useState(post?.body ?? "");
  const [color, setColor] = useState<NoteColor>(post?.color ?? lastColor());
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const nextKey = useRef(1);
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const editing = !!post;

  const addFiles = (files: File[]) => {
    const room = MAX_FILES_PER_POST - uploadsRef.current.length;
    if (files.length > room) toast(`파일은 한 번에 ${MAX_FILES_PER_POST}개까지 올릴 수 있습니다.`);
    const added: Upload[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const key = nextKey.current++;
      if (file.size > MAX_FILE_SIZE) {
        added.push({ key, file, progress: 0, error: "95MB를 넘는 파일입니다" });
        continue;
      }
      if (file.size === 0) {
        added.push({ key, file, progress: 0, error: "빈 파일입니다" });
        continue;
      }
      const patch = (changes: Partial<Upload>) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...changes } : u)));
      const { promise, abort } = uploadFile(file, (progress) => patch({ progress }));
      promise.then(
        (info) => patch({ info, progress: 1 }),
        (err: Error) => patch({ error: err.message }),
      );
      added.push({ key, file, progress: 0, abort });
    }
    setUploads((list) => [...list, ...added]);
  };

  useEffect(() => {
    if (initialFiles?.length) addFiles(initialFiles);
    // 처음 열릴 때 한 번만 넘겨받은 파일을 올린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeUpload = (upload: Upload) => {
    if (!upload.info && !upload.error) upload.abort?.();
    setUploads((list) => list.filter((u) => u.key !== upload.key));
  };

  const uploading = uploads.some((u) => !u.info && !u.error);
  const ready = uploads.filter((u) => u.info);
  const canSubmit = !busy && !uploading && (body.trim().length > 0 || ready.length > 0 || (editing && post.files.length > 0));
  const dirty = editing ? body !== post.body : body.trim().length > 0 || uploads.length > 0;

  const requestClose = async () => {
    if (!dirty || (await confirm({ title: "작성 중인 내용을 버릴까요?", confirmLabel: "버리기", danger: true }))) {
      uploadsRef.current.forEach((u) => !u.info && !u.error && u.abort?.());
      onClose();
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      if (editing) {
        setBusy(true);
        await api(`/api/posts/${post.id}`, { method: "PATCH", body: { body, color } });
      } else {
        const author = await requireName();
        if (!author) return;
        setBusy(true);
        await api(`/api/boards/${slug}/posts`, {
          method: "POST",
          body: { body, color, author, fileIds: ready.map((u) => u.info!.id) },
        });
        try {
          localStorage.setItem(COLOR_KEY, color);
        } catch {
          // 색 기억은 실패해도 무방하다
        }
      }
      onDone();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={() => void requestClose()} size="md">
      <div
        className={`composer note-${color}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length && !editing) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          placeholder="내용을 쓰거나 링크를 붙여넣으세요"
          maxLength={5000}
          autoFocus
        />

        {uploads.length > 0 && (
          <ul className="upload-list">
            {uploads.map((u) => (
              <li key={u.key} className={u.error ? "upload upload-error" : "upload"}>
                <span className="upload-name">{u.file.name}</span>
                <span className="upload-state">{u.error ?? (u.info ? formatSize(u.file.size) : `${Math.round(u.progress * 100)}%`)}</span>
                <button className="icon-btn" onClick={() => removeUpload(u)} aria-label={`${u.file.name} 제거`}>
                  <CloseIcon size={15} />
                </button>
                {!u.info && !u.error && <span className="upload-bar" style={{ width: `${u.progress * 100}%` }} />}
              </li>
            ))}
          </ul>
        )}

        <div className="composer-bar">
          <div className="swatches" role="radiogroup" aria-label="메모 색">
            {COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={c === color}
                aria-label={COLOR_NAMES[c]}
                title={COLOR_NAMES[c]}
                className={`swatch swatch-${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="composer-actions">
            {!editing && (
              <>
                <input
                  ref={picker}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                <button className="btn btn-quiet" onClick={() => picker.current?.click()}>
                  <ClipIcon size={16} />
                  파일
                </button>
              </>
            )}
            <button className="btn btn-primary" onClick={() => void submit()} disabled={!canSubmit}>
              {uploading ? "올리는 중" : editing ? "저장" : "게시"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
