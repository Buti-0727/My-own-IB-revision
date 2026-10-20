import Dexie, { type Table } from "dexie";
import type {
  AppSettingsRecord,
  AttemptRecord,
  PaperRecord,
  QuestionRecord,
  StoredDocument,
  TopicDefinition,
} from "../domain/types";

export class RevisionDatabase extends Dexie {
  papers!: Table<PaperRecord, string>;
  documents!: Table<StoredDocument, string>;
  questions!: Table<QuestionRecord, string>;
  topics!: Table<TopicDefinition, string>;
  settings!: Table<AppSettingsRecord, string>;
  attempts!: Table<AttemptRecord, string>;

  constructor(name = "ib-revision-studio") {
    super(name);

    this.version(1).stores({
      papers: "id, subjectId, examSession, syllabusVersion",
      documents: "id, paperId, kind",
      questions: "id, paperId, status, verified, *topicIds",
      topics: "id, subjectId, syllabusVersion, [subjectId+syllabusVersion], custom",
      settings: "id",
      attempts: "id, questionId, attemptedAt, selfRating",
    });
  }
}

export const revisionDb = new RevisionDatabase();
