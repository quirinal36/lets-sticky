import { useRef, useState } from "react";
import type { QuestionType, Survey } from "../../shared/types";
import { api } from "../api";
import { useApp } from "../app-context";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, PlusIcon } from "./Icons";
import { Modal } from "./Modal";

interface Draft {
  key: number;
  type: QuestionType;
  label: string;
  options: string[];
  required: boolean;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  single: "하나 선택",
  multi: "여러 개 선택",
  text: "주관식",
  scale: "5점 척도",
};

export function SurveyEditor({
  slug,
  survey,
  onClose,
  onDone,
}: {
  slug: string;
  survey?: Survey;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useApp();
  const nextKey = useRef(1);
  const blank = (): Draft => ({ key: nextKey.current++, type: "single", label: "", options: ["", ""], required: true });
  const [title, setTitle] = useState(survey?.title ?? "");
  const [description, setDescription] = useState(survey?.description ?? "");
  const [showResults, setShowResults] = useState(survey?.showResults ?? false);
  const [questions, setQuestions] = useState<Draft[]>(() =>
    survey
      ? survey.questions.map((q) => ({
          key: nextKey.current++,
          type: q.type,
          label: q.label,
          options: q.options.length ? q.options : ["", ""],
          required: q.required,
        }))
      : [blank()],
  );
  const [busy, setBusy] = useState(false);

  const update = (key: number, changes: Partial<Draft>) =>
    setQuestions((list) => list.map((q) => (q.key === key ? { ...q, ...changes } : q)));
  const move = (index: number, delta: number) =>
    setQuestions((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const problem = (() => {
    if (!title.trim()) return "설문 제목을 입력하세요.";
    for (const [i, q] of questions.entries()) {
      if (!q.label.trim()) return `${i + 1}번 문항의 질문을 입력하세요.`;
      if ((q.type === "single" || q.type === "multi") && new Set(q.options.map((o) => o.trim()).filter(Boolean)).size < 2) {
        return `${i + 1}번 문항에 서로 다른 보기를 2개 이상 입력하세요.`;
      }
    }
    return null;
  })();

  const save = async () => {
    if (problem) {
      toast(problem);
      return;
    }
    setBusy(true);
    const body = {
      title,
      description,
      showResults,
      questions: questions.map(({ type, label, options, required }) => ({ type, label, options, required })),
    };
    try {
      if (survey) await api(`/api/surveys/${survey.id}`, { method: "PATCH", body });
      else await api(`/api/boards/${slug}/surveys`, { method: "POST", body });
      onDone();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={survey ? "설문 수정" : "설문 만들기"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <label className="check">
            <input type="checkbox" checked={showResults} onChange={(e) => setShowResults(e.target.checked)} />
            응답한 참여자에게 결과 공개
          </label>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {survey ? "저장" : "올리기"}
          </button>
        </>
      }
    >
      <div className="editor">
        <input
          className="input input-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="설문 제목"
          maxLength={120}
          autoFocus
        />
        <textarea
          className="input"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="안내 문구 (선택)"
          maxLength={1000}
        />

        {questions.map((q, index) => (
          <section key={q.key} className="editor-question">
            <div className="editor-question-head">
              <span className="editor-number">{index + 1}</span>
              <select
                className="input select"
                value={q.type}
                onChange={(e) => update(q.key, { type: e.target.value as QuestionType })}
                aria-label="문항 유형"
              >
                {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <label className="check">
                <input type="checkbox" checked={q.required} onChange={(e) => update(q.key, { required: e.target.checked })} />
                필수
              </label>
              <span className="spacer" />
              <button className="icon-btn" onClick={() => move(index, -1)} disabled={index === 0} aria-label="위로">
                <ArrowUpIcon size={16} />
              </button>
              <button className="icon-btn" onClick={() => move(index, 1)} disabled={index === questions.length - 1} aria-label="아래로">
                <ArrowDownIcon size={16} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setQuestions((list) => list.filter((item) => item.key !== q.key))}
                disabled={questions.length === 1}
                aria-label="문항 삭제"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <input
              className="input"
              value={q.label}
              onChange={(e) => update(q.key, { label: e.target.value })}
              placeholder="질문"
              maxLength={300}
            />

            {(q.type === "single" || q.type === "multi") && (
              <div className="editor-options">
                {q.options.map((option, i) => (
                  <div key={i} className="editor-option">
                    <span className={q.type === "single" ? "mark mark-radio" : "mark"} aria-hidden="true" />
                    <input
                      className="input"
                      value={option}
                      onChange={(e) => update(q.key, { options: q.options.map((o, j) => (j === i ? e.target.value : o)) })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing && i === q.options.length - 1 && option.trim()) {
                          update(q.key, { options: [...q.options, ""] });
                        }
                      }}
                      placeholder={`보기 ${i + 1}`}
                      maxLength={200}
                      autoFocus={i === q.options.length - 1 && i >= 2 && option === ""}
                    />
                    <button
                      className="icon-btn"
                      onClick={() => update(q.key, { options: q.options.filter((_, j) => j !== i) })}
                      disabled={q.options.length <= 2}
                      aria-label="보기 삭제"
                    >
                      <CloseIcon size={15} />
                    </button>
                  </div>
                ))}
                {q.options.length < 20 && (
                  <button className="btn btn-quiet btn-small" onClick={() => update(q.key, { options: [...q.options, ""] })}>
                    <PlusIcon size={14} />
                    보기 추가
                  </button>
                )}
              </div>
            )}
            {q.type === "scale" && <p className="editor-hint">1점부터 5점까지 고르는 문항입니다.</p>}
          </section>
        ))}

        {questions.length < 30 && (
          <button className="btn btn-dashed" onClick={() => setQuestions((list) => [...list, blank()])}>
            <PlusIcon size={16} />
            문항 추가
          </button>
        )}
      </div>
    </Modal>
  );
}
