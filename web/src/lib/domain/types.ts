export type SubjectId =
  | "english-b-sl"
  | "chinese-a-lang-lit-sl"
  | "chemistry-hl"
  | "math-aa-hl"
  | "biology-sl"
  | "psychology-hl";

export type SubjectLevel = "SL" | "HL";
export type PaperDocumentKind = "question-paper" | "markscheme";
export type QuestionStatus = "draft" | "confirmed";
export type SelfRating = "again" | "hard" | "good";
export type AnswerMode = "typed" | "images" | "manual";

export interface SubjectDefinition {
  id: SubjectId;
  label: string;
  level: SubjectLevel;
}

export interface SyllabusVersion {
  id: string;
  label: string;
  firstAssessment: number;
  sourceUrl: string;
}

export interface TopicDefinition {
  id: string;
  subjectId: SubjectId;
  syllabusVersion: string;
  title: string;
  sortOrder: number;
  sourceUrl: string;
  groupTitle?: string;
  custom: boolean;
}

export interface StoredDocument {
  id: string;
  paperId: string;
  kind: PaperDocumentKind;
  fileName: string;
  mimeType: "application/pdf";
  blob: Blob;
  size: number;
}

export interface PaperRecord {
  id: string;
  subjectId: SubjectId;
  examSession: string;
  component: string;
  syllabusVersion: string;
  questionDocumentId: string;
  markschemeDocumentId: string;
  createdAt: string;
}

export interface QuestionRecord {
  id: string;
  paperId: string;
  number: string;
  exactText: string;
  questionPages: number[];
  markschemeText: string;
  markschemePages: number[];
  topicIds: string[];
  verified: boolean;
  status: QuestionStatus;
}

export interface QuestionConfirmation {
  exactText: string;
  questionPages: number[];
  markschemeText: string;
  markschemePages: number[];
  topicIds: string[];
}

export interface AttemptRecord {
  id: string;
  questionId: string;
  attemptedAt: string;
  answerMode: AnswerMode;
  selfRating: SelfRating;
}

export interface AppSettingsRecord {
  id: "app";
  examSession: string;
  syllabusVersions: Partial<Record<SubjectId, string>>;
  selectedModelId?: string;
  lmStudioBaseUrl?: string;
}

export interface FeedbackResult {
  creditedPoints: string[];
  missingPoints: string[];
  explanation: string;
  uncertainty: string[];
}

export interface PaperBundle {
  paper: PaperRecord;
  questionPaper: StoredDocument;
  markscheme: StoredDocument;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  usagePercent: number | null;
}
