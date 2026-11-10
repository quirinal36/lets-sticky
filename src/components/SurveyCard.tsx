import type { Survey } from "../../shared/types";
import { useApp } from "../app-context";
import { CheckIcon } from "./Icons";
import { Menu, type MenuItem } from "./Menu";

interface SurveyCardProps {
  survey: Survey;
  onRespond: () => void;
  onResults: () => void;
  onEdit: () => void;
  onToggleOpen: () => void;
  onToggleResults: () => void;
  onDelete: () => void;
}

export function SurveyCard({ survey, onRespond, onResults, onEdit, onToggleOpen, onToggleResults, onDelete }: SurveyCardProps) {
  const { admin } = useApp();
  const responded = survey.myAnswers !== null;

  const items: MenuItem[] = admin
    ? [
        ...(survey.isOpen ? [{ label: responded ? "내 응답 수정" : "직접 응답해 보기", onSelect: onRespond }] : []),
        { label: survey.isOpen ? "응답 마감" : "응답 다시 받기", onSelect: onToggleOpen },
        { label: survey.showResults ? "참여자에게 결과 숨기기" : "참여자에게 결과 공개", onSelect: onToggleResults },
        ...(survey.responseCount === 0 ? [{ label: "수정", onSelect: onEdit }] : []),
        { label: "삭제", danger: true, onSelect: onDelete },
      ]
    : [];

  return (
    <article className="note survey">
      <div className="note-content">
        <div className="survey-head">
          <h3>{survey.title}</h3>
          <Menu items={items} />
        </div>
        {survey.description && <p className="survey-desc">{survey.description}</p>}
        <p className="survey-meta">
          문항 {survey.questions.length}개 · 응답 {survey.responseCount}명{!survey.isOpen && " · 마감"}
        </p>

        <div className="survey-actions">
          {admin ? (
            <button className="btn btn-primary" onClick={onResults}>
              결과 보기
            </button>
          ) : (
            <>
              {survey.isOpen && !responded && (
                <button className="btn btn-primary" onClick={onRespond}>
                  응답하기
                </button>
              )}
              {responded && (
                <span className="survey-done">
                  <CheckIcon size={15} />
                  응답 완료
                </span>
              )}
              {survey.isOpen && responded && (
                <button className="btn" onClick={onRespond}>
                  수정
                </button>
              )}
              {survey.responses && (
                <button className="btn" onClick={onResults}>
                  결과 보기
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
