"use client";

import { useCallback, useEffect, useState } from "react";
import { SUBJECTS } from "../../lib/domain/subjects";
import type { PaperRecord, QuestionRecord } from "../../lib/domain/types";
import { extractPdfPages } from "../../lib/pdf/extract";
import { revisionDb } from "../../lib/storage/db";
import { createRepositories } from "../../lib/storage/repositories";
import { PaperImportForm, type PaperImportResult } from "./paper-import-form";
import { QuestionReviewWorkbench } from "./question-review-workbench";

interface PaperSummary extends PaperRecord {
  confirmedQuestionCount: number;
}

interface ReviewState extends PaperImportResult {
  existingQuestions: QuestionRecord[];
}

export function PaperLibrary() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [loadingPaperId, setLoadingPaperId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshPapers = useCallback(async () => {
    const repositories = createRepositories(revisionDb);
    const records = await repositories.listPapers();
    const summaries = await Promise.all(records.map(async (paper) => {
      const questions = await revisionDb.questions.where("paperId").equals(paper.id).toArray();
      return {
        ...paper,
        confirmedQuestionCount: questions.filter((question) => question.verified).length,
      };
    }));
    setPapers(summaries.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }, []);

  useEffect(() => {
    let active = true;
    const repositories = createRepositories(revisionDb);
    void repositories.listPapers()
      .then(async (records) => {
        const summaries = await Promise.all(records.map(async (paper) => {
          const questions = await revisionDb.questions.where("paperId").equals(paper.id).toArray();
          return {
            ...paper,
            confirmedQuestionCount: questions.filter((question) => question.verified).length,
          };
        }));
        if (active) {
          setPapers(summaries.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
        }
      })
      .catch(() => {
        if (active) setError("Your browser library could not be opened.");
      });
    return () => { active = false; };
  }, []);

  async function openPaper(paper: PaperSummary) {
    setError(null);
    setLoadingPaperId(paper.id);
    try {
      const repositories = createRepositories(revisionDb);
      const [questionDocument, markschemeDocument, existingQuestions] = await Promise.all([
        repositories.getDocument(paper.questionDocumentId),
        repositories.getDocument(paper.markschemeDocumentId),
        revisionDb.questions.where("paperId").equals(paper.id).toArray(),
      ]);
      if (!questionDocument || !markschemeDocument) {
        throw new Error("This paper is missing its original PDF or matching markscheme.");
      }
      const [questionPages, markschemePages] = await Promise.all([
        extractPdfPages(new File([questionDocument.blob], questionDocument.fileName, { type: "application/pdf" })),
        extractPdfPages(new File([markschemeDocument.blob], markschemeDocument.fileName, { type: "application/pdf" })),
      ]);
      setReview({
        paper,
        questionPaper: questionDocument,
        markscheme: markschemeDocument,
        questionPages,
        markschemePages,
        existingQuestions,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This paper could not be opened.");
    } finally {
      setLoadingPaperId(null);
    }
  }

  async function handleImported(result: PaperImportResult) {
    setReview({ ...result, existingQuestions: [] });
    await refreshPapers();
  }

  async function handleQuestionConfirmed(question: QuestionRecord) {
    setReview((current) => current
      ? { ...current, existingQuestions: [...current.existingQuestions, question] }
      : current);
    await refreshPapers();
  }

  const subjectLabel = (subjectId: PaperRecord["subjectId"]) =>
    SUBJECTS.find((subject) => subject.id === subjectId)?.label ?? subjectId;

  return (
    <div className="paper-library-page">
      <div className="library-page-heading">
        <div>
          <p className="eyebrow">Paper library</p>
          <h1>Papers</h1>
          <p className="intro-copy">
            Keep each complete paper with its official markscheme. Review every question before it enters practice.
          </p>
        </div>
        <a
          className="secondary-button"
          href="https://ibdocs.re/past-papers-by-subject"
          target="_blank"
          rel="noreferrer"
        >
          Browse IB Docs <span aria-hidden="true">↗</span>
        </a>
      </div>

      <PaperImportForm onPaperSaved={handleImported} />
      {error && <p className="inline-error" role="alert">{error}</p>}

      <section className="saved-papers-section" aria-labelledby="saved-papers-title">
        <div className="saved-papers-heading">
          <h2 id="saved-papers-title">Your papers</h2>
          <span>{papers.length} {papers.length === 1 ? "paper" : "papers"}</span>
        </div>
        {papers.length === 0 ? (
          <p className="library-empty-hint">Your PDFs stay on this device. Add a question paper and matching markscheme to begin.</p>
        ) : (
          <ul className="saved-paper-list">
            {papers.map((paper) => (
              <li className="saved-paper-row" key={paper.id}>
                <div className="saved-paper-info">
                  <strong>{subjectLabel(paper.subjectId)}</strong>
                  <span>{paper.examSession} / {paper.component}</span>
                </div>
                <div className="saved-paper-status">
                  <span>{paper.confirmedQuestionCount} confirmed</span>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void openPaper(paper)}
                    disabled={loadingPaperId === paper.id}
                  >
                    {loadingPaperId === paper.id ? "Opening…" : "Review questions"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {review && (
        <QuestionReviewWorkbench
          key={review.paper.id}
          paper={review.paper}
          questionDocument={review.questionPaper.blob}
          markschemeDocument={review.markscheme.blob}
          questionPages={review.questionPages}
          markschemePages={review.markschemePages}
          existingQuestions={review.existingQuestions}
          onQuestionConfirmed={(question) => void handleQuestionConfirmed(question)}
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}
