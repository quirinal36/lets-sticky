import { useState, type FormEvent } from "react";
import type { Answer, Answers, Question, Survey } from "../../shared/types";
import { api } from "../api";
import { useApp } from "../app-context";
import { Modal } from "./Modal";

function isAnswered(answer: Answer | undefined): boolean {
  if (answer === undefined) return false;
  if (typeof answer === "string") return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return true;
}

export function SurveyForm({ survey, onClose, onDone }: { survey: Survey; onClose: () => void; onDone: () => void }) {
  const { requireName, toast } = useApp();
  const [answers, setAnswers] = useState<Answers>(survey.myAnswers ?? {});
  const [busy, setBusy] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  const set = (id: string, value: Answer) => setAnswers((prev) => ({ ...prev, [id]: value }));
  const missing = survey.questions.filter((q) => q.required && !isAnswered(answers[q.id]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing.length > 0) {
      setShowMissing(true);
      document.getElementById(`q-${missing[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const name = await requireName();
    if (!name) return;
    setBusy(true);
    try {
      await api(`/api/surveys/${survey.id}/responses`, { method: "POST", body: { name, answers } });
      onDone();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={survey.title}
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block" form="survey-form" disabled={busy}>
          {survey.myAnswers ? "응답 수정" : "제출"}
        </button>
      }
    >
      <form id="survey-form" className="survey-form" onSubmit={submit}>
        {survey.description && <p className="survey-form-desc">{survey.description}</p>}
        {survey.questions.map((q, index) => (
          <fieldset key={q.id} id={`q-${q.id}`} className={showMissing && missing.includes(q) ? "question question-missing" : "question"}>
            <legend>
              {index + 1}. {q.label}
              {!q.required && <span className="optional">선택</span>}
            </legend>
            <QuestionInput question={q} value={answers[q.id]} onChange={(value) => set(q.id, value)} />
            {showMissing && missing.includes(q) && <p className="error">응답이 필요한 문항입니다.</p>}
          </fieldset>
        ))}
      </form>
    </Modal>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: Answer | undefined;
  onChange: (value: Answer) => void;
}) {
  if (question.type === "text") {
    return (
      <textarea
        className="input"
        rows={3}
        maxLength={2000}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (question.type === "scale") {
    return (
      <div className="scale" role="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={value === n}
            className={value === n ? "selected" : undefined}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }
  const picked = Array.isArray(value) ? value : [];
  return (
    <div className="options">
      {question.options.map((option) => {
        const checked = question.type === "single" ? value === option : picked.includes(option);
        return (
          <label key={option} className={checked ? "option option-checked" : "option"}>
            <input
              type={question.type === "single" ? "radio" : "checkbox"}
              name={question.id}
              checked={checked}
              onChange={() => {
                if (question.type === "single") onChange(option);
                else onChange(checked ? picked.filter((o) => o !== option) : [...picked, option]);
              }}
            />
            <span>{option}</span>
          </label>
        );
      })}
    </div>
  );
}
