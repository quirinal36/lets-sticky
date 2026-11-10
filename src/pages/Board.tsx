import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardDetail, Post, Survey } from "../../shared/types";
import { api, ApiError } from "../api";
import { useApp } from "../app-context";
import { Composer } from "../components/Composer";
import { Header } from "../components/Header";
import { ListIcon, PlusIcon, ShareIcon } from "../components/Icons";
import { Lightbox, PostCard } from "../components/PostCard";
import { ShareDialog } from "../components/ShareDialog";
import { SurveyCard } from "../components/SurveyCard";
import { Wall } from "../components/Wall";
import { SurveyEditor } from "../components/SurveyEditor";
import { SurveyForm } from "../components/SurveyForm";
import { SurveyResults } from "../components/SurveyResults";
import type { FileInfo } from "../../shared/types";

const POLL_INTERVAL = 4000;

type Dialog =
  | { type: "compose"; files?: File[]; post?: Post }
  | { type: "share" }
  | { type: "survey-edit"; survey?: Survey }
  | { type: "survey-form"; surveyId: string }
  | { type: "survey-results"; surveyId: string }
  | { type: "image"; file: FileInfo };

export function Board({ slug }: { slug: string }) {
  const { admin, toast, confirm } = useApp();
  const [data, setData] = useState<BoardDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dragging, setDragging] = useState(false);
  const snapshot = useRef("");
  const dragDepth = useRef(0);

  const load = useCallback(async () => {
    try {
      const next = await api<BoardDetail>(`/api/boards/${slug}`);
      const serialized = JSON.stringify(next);
      if (serialized !== snapshot.current) {
        snapshot.current = serialized;
        setData(next);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
    }
  }, [slug]);

  // 관리자 여부가 바뀌면 설문 결과 노출 범위가 달라지므로 다시 불러온다
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, admin]);

  useEffect(() => {
    if (data) document.title = `${data.board.title} · Sticky`;
    return () => {
      document.title = "Sticky";
    };
  }, [data?.board.title]);

  // 보드 어디에든 파일을 끌어다 놓으면 작성 창이 열린다
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      setDialog((current) => (current === null ? { type: "compose", files } : current));
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const deletePost = async (post: Post) => {
    const ok = await confirm({ title: "게시물을 삭제할까요?", confirmLabel: "삭제", danger: true });
    if (ok) await run(() => api(`/api/posts/${post.id}`, { method: "DELETE" }));
  };

  const deleteSurvey = async (survey: Survey) => {
    const ok = await confirm({
      title: `"${survey.title}" 설문을 삭제할까요?`,
      message: survey.responseCount > 0 ? `응답 ${survey.responseCount}건도 함께 삭제됩니다.` : undefined,
      confirmLabel: "삭제",
      danger: true,
    });
    if (ok) await run(() => api(`/api/surveys/${survey.id}`, { method: "DELETE" }));
  };

  if (missing) {
    return (
      <>
        <Header />
        <main className="page">
          <p className="empty">보드를 찾을 수 없습니다.</p>
        </main>
      </>
    );
  }

  const close = () => setDialog(null);
  const findSurvey = (id: string) => data?.surveys.find((s) => s.id === id);
  const isEmpty = data !== null && data.posts.length === 0 && data.surveys.length === 0;

  return (
    <>
      <Header
        title={data?.board.title ?? ""}
        actions={
          <>
            {admin && (
              <button className="btn btn-quiet" onClick={() => setDialog({ type: "survey-edit" })}>
                <ListIcon size={16} />
                <span className="hide-sm">설문 만들기</span>
              </button>
            )}
            <button className="btn btn-quiet" onClick={() => setDialog({ type: "share" })}>
              <ShareIcon size={16} />
              <span className="hide-sm">공유</span>
            </button>
          </>
        }
      />

      <main className="board">
        {isEmpty ? (
          <div className="board-empty">
            <p>아직 게시물이 없습니다.</p>
            <button className="btn btn-primary" onClick={() => setDialog({ type: "compose" })}>
              <PlusIcon size={16} />첫 게시물 올리기
            </button>
          </div>
        ) : (
          <Wall>
            {[
              ...(data?.surveys ?? []).map((survey) => (
                <SurveyCard
                  key={survey.id}
                  survey={survey}
                  onRespond={() => setDialog({ type: "survey-form", surveyId: survey.id })}
                  onResults={() => setDialog({ type: "survey-results", surveyId: survey.id })}
                  onEdit={() => setDialog({ type: "survey-edit", survey })}
                  onToggleOpen={() => run(() => api(`/api/surveys/${survey.id}`, { method: "PATCH", body: { isOpen: !survey.isOpen } }))}
                  onToggleResults={() =>
                    run(() => api(`/api/surveys/${survey.id}`, { method: "PATCH", body: { showResults: !survey.showResults } }))
                  }
                  onDelete={() => void deleteSurvey(survey)}
                />
              )),
              ...(data?.posts ?? []).map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onOpenImage={(file) => setDialog({ type: "image", file })}
                  onEdit={() => setDialog({ type: "compose", post })}
                  onDelete={() => void deletePost(post)}
                  onTogglePin={() => run(() => api(`/api/posts/${post.id}`, { method: "PATCH", body: { pinned: !post.pinned } }))}
                />
              )),
            ]}
          </Wall>
        )}
      </main>

      {data && !isEmpty && (
        <button className="fab" onClick={() => setDialog({ type: "compose" })}>
          <PlusIcon size={20} />
          <span>글쓰기</span>
        </button>
      )}

      {dragging && dialog === null && (
        <div className="drop-overlay">
          <div>파일을 놓으면 게시물로 올립니다</div>
        </div>
      )}

      {dialog?.type === "compose" && (
        <Composer
          slug={slug}
          initialFiles={dialog.files}
          post={dialog.post}
          onClose={close}
          onDone={() => {
            close();
            void load();
          }}
        />
      )}
      {dialog?.type === "share" && data && <ShareDialog title={data.board.title} onClose={close} />}
      {dialog?.type === "survey-edit" && (
        <SurveyEditor
          slug={slug}
          survey={dialog.survey}
          onClose={close}
          onDone={() => {
            close();
            void load();
          }}
        />
      )}
      {dialog?.type === "survey-form" &&
        (() => {
          const survey = findSurvey(dialog.surveyId);
          return survey ? (
            <SurveyForm
              survey={survey}
              onClose={close}
              onDone={() => {
                close();
                toast("응답을 제출했습니다.");
                void load();
              }}
            />
          ) : null;
        })()}
      {dialog?.type === "survey-results" &&
        (() => {
          const survey = findSurvey(dialog.surveyId);
          return survey?.responses ? <SurveyResults survey={survey} onClose={close} /> : null;
        })()}
      {dialog?.type === "image" && <Lightbox file={dialog.file} onClose={close} />}
    </>
  );
}
