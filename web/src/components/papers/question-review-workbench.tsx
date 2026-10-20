"use client";

import { useEffect, useMemo, useState } from "react";
import { getTopicsForSubject } from "../../lib/domain/topic-catalog";
import type { PaperRecord, QuestionRecord, TopicDefinition } from "../../lib/domain/types";
import type { ExtractedPage } from "../../lib/pdf/extract";
import { getQuestionReviewIssues, parsePageNumbers } from "../../lib/papers/import-validation";
import { isExactSourceTextOnPages, suggestQuestionDrafts } from "../../lib/papers/question-drafts";
import { revisionDb } from "../../lib/storage/db";
import { createRepositories } from "../../lib/storage/repositories";
import { PdfPageViewer } from "./pdf-page-viewer";

const MANUAL_ENTRY = "manual-entry";

interface QuestionReviewWorkbenchProps {
  paper: PaperRecord;
  questionDocument: Blob;
  markschemeDocument: Blob;
  questionPages: ExtractedPage[];
  markschemePages: ExtractedPage[];
  existingQuestions: QuestionRecord[];
  onQuestionConfirmed: (question: QuestionRecord) => void;
  onClose: () => void;
}

function pageText(pages: readonly ExtractedPage[], pageNumbers: readonly number[]) {
  const selected = new Set(pageNumbers);
  return pages
    .filter((page) => selected.has(page.pageNumber))
    .map(({ text }) => text)
    .filter(Boolean)
    .join("\n\n");
}

function firstPage(input: string, fallback: number) {
  try {
    return parsePageNumbers(input, Math.max(1, fallback))[0] ?? 1;
  } catch {
    return 1;
  }
}

export function QuestionReviewWorkbench({
  paper,
  questionDocument,
  markschemeDocument,
  questionPages,
  markschemePages,
  existingQuestions,
  onQuestionConfirmed,
  onClose,
}: QuestionReviewWorkbenchProps) {
  const candidates = useMemo(() => suggestQuestionDrafts(questionPages), [questionPages]);
  const [confirmedNumbers, setConfirmedNumbers] = useState(
    () => new Set(existingQuestions.filter((question) => question.verified).map((question) => question.number)),
  );
  const remainingCandidates = candidates.filter(({ number }) => !confirmedNumbers.has(number));
  const [selectedCandidateId, setSelectedCandidateId] = useState(remainingCandidates[0]?.id ?? MANUAL_ENTRY);
  const selectedCandidate = candidates.find(({ id }) => id === selectedCandidateId);
  const [questionNumber, setQuestionNumber] = useState(selectedCandidate?.number ?? "");
  const [questionText, setQuestionText] = useState(selectedCandidate?.exactText ?? "");
  const [questionPagesInput, setQuestionPagesInput] = useState(selectedCandidate?.questionPages.join(", ") ?? "");
  const [markschemePagesInput, setMarkschemePagesInput] = useState("");
  const [editedMarkschemeText, setEditedMarkschemeText] = useState<string | null>(null);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [topics, setTopics] = useState<TopicDefinition[]>([]);
  const [manualSourceConfirmed, setManualSourceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    const defaults = getTopicsForSubject(paper.subjectId, paper.syllabusVersion);
    void createRepositories(revisionDb)
      .listTopics(paper.subjectId, paper.syllabusVersion)
      .then((custom) => setTopics([...defaults, ...custom.filter((topic) => topic.custom)]))
      .catch(() => setTopics(defaults));
  }, [paper.subjectId, paper.syllabusVersion]);


  function selectCandidate(candidateId: string) {
    setSelectedCandidateId(candidateId);
    const candidate = candidates.find(({ id }) => id === candidateId);
    setQuestionNumber(candidate?.number ?? "");
    setQuestionText(candidate?.exactText ?? "");
    setQuestionPagesInput(candidate?.questionPages.join(", ") ?? "");
    setTopicIds([]);
    setManualSourceConfirmed(false);
    setMarkschemePagesInput("");
    setEditedMarkschemeText(null);
    setError(null);
    setSavedMessage(null);
  }

  function toggleTopic(topicId: string) {
    setTopicIds((current) =>
      current.includes(topicId) ? current.filter((id) => id !== topicId) : [...current, topicId],
    );
  }

  let selectedMarkschemePages: number[] = [];
  try {
    selectedMarkschemePages = parsePageNumbers(markschemePagesInput, markschemePages.length);
  } catch {
    selectedMarkschemePages = [];
  }
  const markschemeText = editedMarkschemeText ?? pageText(markschemePages, selectedMarkschemePages);
  const reviewIssues = getQuestionReviewIssues({
    questionText,
    sourcePages: questionPages,
    questionPagesInput,
    paperPageCount: questionPages.length,
    markschemeText,
    markschemePagesInput,
    markschemePageCount: markschemePages.length,
    topicIds,
    manualSourceConfirmed,
  });
  let selectedQuestionPages: number[] = [];
  try {
    selectedQuestionPages = parsePageNumbers(questionPagesInput, questionPages.length);
  } catch {
    selectedQuestionPages = [];
  }
  const sourceTextMatches = questionText.trim().length > 0 && isExactSourceTextOnPages(
    questionText,
    questionPages,
    selectedQuestionPages,
  );
  const questionPreviewPage = firstPage(questionPagesInput, questionPages.length);
  const markschemePreviewPage = firstPage(markschemePagesInput, markschemePages.length);

  async function confirmQuestion() {
    setError(null);
    setSavedMessage(null);
    if (!questionNumber.trim()) {
      setError("Add a question number or label.");
      return;
    }
    if (reviewIssues.length > 0) {
      setError(reviewIssues[0]);
      return;
    }

    setBusy(true);
    try {
      const confirmed = await createRepositories(revisionDb).confirmQuestion(
        await createQuestionDraft(),
        {
          exactText: questionText.trim(),
          questionPages: parsePageNumbers(questionPagesInput, questionPages.length),
          markschemeText: markschemeText.trim(),
          markschemePages: parsePageNumbers(markschemePagesInput, markschemePages.length),
          topicIds,
        },
      );
      setConfirmedNumbers((current) => new Set(current).add(confirmed.number));
      onQuestionConfirmed(confirmed);
      setSavedMessage(`Question ${confirmed.number} is ready for practice.`);
      setSelectedCandidateId(MANUAL_ENTRY);
      setQuestionNumber("");
      setQuestionText("");
      setQuestionPagesInput("");
      setMarkschemePagesInput("");
      setEditedMarkschemeText(null);
      setTopicIds([]);
      setManualSourceConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The question could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  async function createQuestionDraft() {
    const repositories = createRepositories(revisionDb);
    const question: QuestionRecord = {
      id: crypto.randomUUID(),
      paperId: paper.id,
      number: questionNumber.trim(),
      exactText: questionText.trim(),
      questionPages: parsePageNumbers(questionPagesInput, questionPages.length),
      markschemeText: markschemeText.trim(),
      markschemePages: parsePageNumbers(markschemePagesInput, markschemePages.length),
      topicIds,
      verified: false,
      status: "draft",
    };
    await repositories.saveQuestion(question);
    return question.id;
  }

  return (
    <section className="question-review-workbench" aria-labelledby="question-review-title">
      <div className="review-workbench-header">
        <div>
          <p className="eyebrow">Check before practice</p>
          <h2 id="question-review-title">Review questions from this paper</h2>
          <p className="review-instructions">
            Compare the wording with the original page, choose its matching markscheme section, and add a topic.
          </p>
        </div>
        <button className="text-button" type="button" onClick={onClose}>Back to papers</button>
      </div>

      <div className="review-progress-line">
        <span>{confirmedNumbers.size} confirmed</span>
        <span>{candidates.length} detected in the question paper</span>
      </div>

      <label className="field-group candidate-select">
        <span>Question to review</span>
        <select value={selectedCandidateId} onChange={(event) => selectCandidate(event.currentTarget.value)}>
          {remainingCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              Question {candidate.number}, page {candidate.questionPages.join(", ")}
            </option>
          ))}
          <option value={MANUAL_ENTRY}>Add or transcribe a question manually</option>
        </select>
      </label>

      <div className="review-document-grid">
        <div className="review-source-column">
          <label className="field-group">
            <span>Exact wording from the question paper</span>
            <textarea
              rows={6}
              value={questionText}
              onChange={(event) => {
                setQuestionText(event.currentTarget.value);
                setManualSourceConfirmed(false);
              }}
            />
          </label>
          <div className="compact-fields">
            <label className="field-group">
              <span>Question number</span>
              <input value={questionNumber} onChange={(event) => setQuestionNumber(event.currentTarget.value)} />
            </label>
            <label className="field-group">
              <span>Question page(s)</span>
              <input
                value={questionPagesInput}
                onChange={(event) => setQuestionPagesInput(event.currentTarget.value)}
                aria-describedby="question-page-help"
              />
            </label>
          </div>
          <small id="question-page-help" className="field-help">Use a page such as 3 or a range such as 3-4.</small>
          <p className={`source-check ${sourceTextMatches ? "is-confirmed" : "is-pending"}`}>
            {sourceTextMatches ? "Wording found in the uploaded PDF." : "Check the wording against the source PDF."}
          </p>
          {!sourceTextMatches && (
            <label className="attestation-check">
              <input
                type="checkbox"
                checked={manualSourceConfirmed}
                onChange={(event) => setManualSourceConfirmed(event.currentTarget.checked)}
              />
              <span>I checked this transcription against the original page.</span>
            </label>
          )}
          <div className="source-preview-card">
            <div className="preview-title-row">
              <h3>Original question paper</h3>
              <span>Page {questionPreviewPage} of {questionPages.length}</span>
            </div>
            <PdfPageViewer blob={questionDocument} pageNumber={questionPreviewPage} title="Question paper" />
          </div>
        </div>

        <div className="review-marking-column">
          <label className="field-group">
            <span>Matching official markscheme text</span>
            <textarea
              rows={6}
              value={markschemeText}
              onChange={(event) => setEditedMarkschemeText(event.currentTarget.value)}
            />
          </label>
          <label className="field-group markscheme-pages-field">
            <span>Markscheme page(s)</span>
            <input
              value={markschemePagesInput}
              onChange={(event) => {
                setMarkschemePagesInput(event.currentTarget.value);
                setEditedMarkschemeText(null);
              }}
              aria-describedby="markscheme-page-help"
            />
          </label>
          <small id="markscheme-page-help" className="field-help">
            Select page numbers to load their extracted text. You can then edit the excerpt.
          </small>
          <div className="source-preview-card">
            <div className="preview-title-row">
              <h3>Official markscheme</h3>
              <span>Page {markschemePreviewPage} of {markschemePages.length}</span>
            </div>
            <PdfPageViewer blob={markschemeDocument} pageNumber={markschemePreviewPage} title="Official markscheme" />
          </div>
        </div>
      </div>

      <fieldset className="topic-picker">
        <legend>Confirmed topic</legend>
        <p>Select every syllabus topic that fits. You can add your own topic in Settings.</p>
        <div className="topic-choice-list">
          {topics.map((topic) => (
            <label className="topic-choice" key={topic.id}>
              <input
                type="checkbox"
                checked={topicIds.includes(topic.id)}
                onChange={() => toggleTopic(topic.id)}
              />
              <span>{topic.groupTitle ? `${topic.groupTitle}: ${topic.title}` : topic.title}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="inline-error" role="alert">{error}</p>}
      {savedMessage && <p className="inline-success" role="status">{savedMessage}</p>}
      <div className="review-actions">
        <p>The wording must come from this paper. Only confirmed questions can enter practice.</p>
        <button className="primary-button" type="button" disabled={busy || topics.length === 0} onClick={confirmQuestion}>
          {busy ? "Saving…" : "Confirm question"}
        </button>
      </div>
    </section>
  );
}
