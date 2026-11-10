import { useState } from "react";
import type { Answer, Question, Survey, SurveyResponse } from "../../shared/types";
import { useApp } from "../app-context";
import { DownloadIcon } from "./Icons";
import { Modal } from "./Modal";

function formatAnswer(answer: Answer | undefined): string {
  if (answer === undefined) return "";
  return Array.isArray(answer) ? answer.join(", ") : String(answer);
}

function downloadCsv(survey: Survey, responses: SurveyResponse[]) {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [
    ["이름", "응답 시각", ...survey.questions.map((q) => q.label)],
    ...responses.map((r) => [
      r.name ?? "",
      new Date(r.createdAt).toLocaleString("ko-KR"),
      ...survey.questions.map((q) => formatAnswer(r.answers[q.id])),
    ]),
  ];
  // 엑셀이 한글을 바로 읽도록 BOM을 붙인다
  const blob = new Blob(["﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${survey.title}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function SurveyResults({ survey, onClose }: { survey: Survey; onClose: () => void }) {
  const { admin } = useApp();
  const responses = survey.responses ?? [];
  const [view, setView] = useState<"summary" | "people">("summary");

  return (
    <Modal title={survey.title} size="lg" onClose={onClose}>
      <div className="results">
        <div className="results-bar">
          <span className="results-count">응답 {responses.length}명</span>
          {admin && responses.length > 0 && (
            <>
              <div className="segmented" role="tablist">
                <button role="tab" aria-selected={view === "summary"} onClick={() => setView("summary")}>
                  요약
                </button>
                <button role="tab" aria-selected={view === "people"} onClick={() => setView("people")}>
                  응답자별
                </button>
              </div>
              <button className="btn btn-quiet" onClick={() => downloadCsv(survey, responses)}>
                <DownloadIcon size={16} />
                CSV
              </button>
            </>
          )}
        </div>

        {responses.length === 0 ? (
          <p className="empty">아직 응답이 없습니다.</p>
        ) : view === "summary" ? (
          survey.questions.map((q, index) => (
            <section key={q.id} className="result">
              <h3>
                {index + 1}. {q.label}
              </h3>
              <QuestionResult question={q} responses={responses} />
            </section>
          ))
        ) : (
          <div className="people">
            {responses.map((r, i) => (
              <section key={i} className="person">
                <h3>{r.name}</h3>
                <dl>
                  {survey.questions.map((q) => (
                    <div key={q.id}>
                      <dt>{q.label}</dt>
                      <dd>{formatAnswer(r.answers[q.id]) || <span className="muted">응답 없음</span>}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Bars({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  return (
    <ul className="bars">
      {rows.map((row) => {
        const percent = total ? Math.round((row.count / total) * 100) : 0;
        return (
          <li key={row.label}>
            <span className="bar-fill" style={{ width: `${percent}%` }} />
            <span className="bar-label">{row.label}</span>
            <span className="bar-value">
              {row.count}명 · {percent}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function QuestionResult({ question, responses }: { question: Question; responses: SurveyResponse[] }) {
  const answered = responses.filter((r) => r.answers[question.id] !== undefined);

  if (question.type === "text") {
    if (answered.length === 0) return <p className="muted">응답 없음</p>;
    return (
      <ul className="text-answers">
        {answered.map((r, i) => (
          <li key={i}>
            {String(r.answers[question.id])}
            {r.name && <small>{r.name}</small>}
          </li>
        ))}
      </ul>
    );
  }

  if (question.type === "scale") {
    const values = answered.map((r) => Number(r.answers[question.id]));
    const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return (
      <>
        <p className="average">
          평균 <strong>{average.toFixed(1)}</strong>
        </p>
        <Bars
          rows={[5, 4, 3, 2, 1].map((n) => ({ label: `${n}점`, count: values.filter((v) => v === n).length }))}
          total={answered.length}
        />
      </>
    );
  }

  const rows = question.options.map((option) => ({
    label: option,
    count: answered.filter((r) => {
      const answer = r.answers[question.id];
      return Array.isArray(answer) ? answer.includes(option) : answer === option;
    }).length,
  }));
  return <Bars rows={rows} total={answered.length} />;
}
