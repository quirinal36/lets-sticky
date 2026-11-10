export const COLORS = ["white", "yellow", "peach", "pink", "blue", "green"] as const;
export type NoteColor = (typeof COLORS)[number];

export const MAX_FILE_SIZE = 95 * 1024 * 1024;
export const MAX_FILES_PER_POST = 10;

export interface FileInfo {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface LinkInfo {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
}

export interface Post {
  id: string;
  body: string;
  color: NoteColor;
  author: string;
  pinned: boolean;
  createdAt: number;
  mine: boolean;
  link: LinkInfo | null;
  files: FileInfo[];
}

export type QuestionType = "single" | "multi" | "text" | "scale";

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  options: string[];
  required: boolean;
}

export type Answer = string | string[] | number;
export type Answers = Record<string, Answer>;

export interface SurveyResponse {
  // 이름은 관리자에게만 내려간다
  name?: string;
  answers: Answers;
  createdAt: number;
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  isOpen: boolean;
  showResults: boolean;
  createdAt: number;
  responseCount: number;
  myAnswers: Answers | null;
  // 관리자이거나, 결과가 공개된 설문에 응답한 참여자에게만 내려간다
  responses: SurveyResponse[] | null;
}

export interface BoardSummary {
  id: string;
  slug: string;
  title: string;
  createdAt: number;
  postCount: number;
  surveyCount: number;
}

export interface BoardDetail {
  board: { id: string; slug: string; title: string };
  posts: Post[];
  surveys: Survey[];
}
