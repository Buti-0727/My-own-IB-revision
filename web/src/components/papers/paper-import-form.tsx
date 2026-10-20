"use client";

import { useState, type FormEvent } from "react";
import { SUBJECTS } from "../../lib/domain/subjects";
import { getSyllabusVersions } from "../../lib/domain/topic-catalog";
import type { PaperBundle, PaperRecord, SubjectId, StoredDocument } from "../../lib/domain/types";
import { extractPdfPages, type ExtractedPage } from "../../lib/pdf/extract";
import { validatePdfFile } from "../../lib/papers/import-validation";
import { revisionDb } from "../../lib/storage/db";
import { createRepositories } from "../../lib/storage/repositories";

export interface PaperImportResult extends PaperBundle {
  questionPages: ExtractedPage[];
  markschemePages: ExtractedPage[];
}

interface PaperImportFormProps {
  onPaperSaved: (result: PaperImportResult) => void;
}

function createDocument(id: string, paperId: string, kind: StoredDocument["kind"], file: File): StoredDocument {
  return {
    id,
    paperId,
    kind,
    fileName: file.name,
    mimeType: "application/pdf",
    blob: file,
    size: file.size,
  };
}

export function PaperImportForm({ onPaperSaved }: PaperImportFormProps) {
  const [subjectId, setSubjectId] = useState<SubjectId>(SUBJECTS[0].id);
  const [syllabusVersion, setSyllabusVersion] = useState(getSyllabusVersions(SUBJECTS[0].id)[0].id);
  const [examSession, setExamSession] = useState("");
  const [component, setComponent] = useState("");
  const [questionPaperFile, setQuestionPaperFile] = useState<File | null>(null);
  const [markschemeFile, setMarkschemeFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);

    if (!examSession.trim() || !component.trim()) {
      setError("Add the exam session and paper component.");
      return;
    }
    if (!questionPaperFile || !markschemeFile) {
      setError("Choose both the question paper and its matching markscheme PDF.");
      return;
    }

    setBusy(true);
    try {
      await Promise.all([validatePdfFile(questionPaperFile), validatePdfFile(markschemeFile)]);
      const [questionPages, markschemePages] = await Promise.all([
        extractPdfPages(questionPaperFile),
        extractPdfPages(markschemeFile),
      ]);
      if (questionPages.length === 0 || markschemePages.length === 0) {
        throw new Error("The PDFs need at least one readable page.");
      }

      const paperId = crypto.randomUUID();
      const questionDocumentId = crypto.randomUUID();
      const markschemeDocumentId = crypto.randomUUID();
      const paper: PaperRecord = {
        id: paperId,
        subjectId,
        examSession: examSession.trim(),
        component: component.trim(),
        syllabusVersion,
        questionDocumentId,
        markschemeDocumentId,
        createdAt: new Date().toISOString(),
      };
      const questionPaper = createDocument(questionDocumentId, paperId, "question-paper", questionPaperFile);
      const markscheme = createDocument(markschemeDocumentId, paperId, "markscheme", markschemeFile);
      const bundle = { paper, questionPaper, markscheme };

      await createRepositories(revisionDb).savePaperBundle(bundle);
      onPaperSaved({ ...bundle, questionPages, markschemePages });
      setQuestionPaperFile(null);
      setMarkschemeFile(null);
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The paper could not be added.");
    } finally {
      setBusy(false);
    }
  }

  const syllabusVersions = getSyllabusVersions(subjectId);

  return (
    <form className="paper-import-form" onSubmit={handleSubmit}>
      <div className="paper-form-heading">
        <div>
          <p className="eyebrow">Add your own PDFs</p>
          <h2>Build your paper library</h2>
        </div>
        <span className="local-badge">Saved on this device</span>
      </div>

      <div className="paper-form-grid">
        <label className="field-group">
          <span>Subject</span>
          <select
            value={subjectId}
            onChange={(event) => {
              const nextSubject = event.currentTarget.value as SubjectId;
              setSubjectId(nextSubject);
              setSyllabusVersion(getSyllabusVersions(nextSubject)[0]?.id ?? "");
            }}
          >
            {SUBJECTS.map((subject) => (
              <option value={subject.id} key={subject.id}>{subject.label}</option>
            ))}
          </select>
        </label>

        <label className="field-group">
          <span>Syllabus version</span>
          <select value={syllabusVersion} onChange={(event) => setSyllabusVersion(event.currentTarget.value)}>
            {syllabusVersions.map((version) => (
              <option value={version.id} key={version.id}>{version.label}</option>
            ))}
          </select>
        </label>

        <label className="field-group">
          <span>Exam session</span>
          <input
            required
            value={examSession}
            onChange={(event) => setExamSession(event.currentTarget.value)}
            placeholder="For example, May 2026"
          />
        </label>

        <label className="field-group">
          <span>Paper or component</span>
          <input
            required
            value={component}
            onChange={(event) => setComponent(event.currentTarget.value)}
            placeholder="For example, Paper 1"
          />
        </label>

        <label className="field-group file-field">
          <span>Question paper PDF</span>
          <input
            required
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setQuestionPaperFile(event.currentTarget.files?.[0] ?? null)}
          />
          <small>{questionPaperFile?.name ?? "Full paper, kept available to view"}</small>
        </label>

        <label className="field-group file-field">
          <span>Official markscheme PDF</span>
          <input
            required
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setMarkschemeFile(event.currentTarget.files?.[0] ?? null)}
          />
          <small>{markschemeFile?.name ?? "The matching markscheme is required"}</small>
        </label>
      </div>

      <div className="import-form-footer">
        <p>PDFs are read in this browser. They are not sent to an online service.</p>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Reading PDFs…" : "Add and review questions"}
        </button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </form>
  );
}
