"use client";

import { useEffect, useState } from "react";
import { feedbackResultSchema, type FeedbackResult } from "../../lib/ai/contracts";
import { SUBJECTS } from "../../lib/domain/subjects";
import type { AnswerMode, SelfRating, SubjectId, TopicDefinition } from "../../lib/domain/types";
import { getTopicsForSubject } from "../../lib/domain/topic-catalog";
import { buildFeedbackRequest, type PracticeQuestion } from "../../lib/practice/select-questions";
import { revisionDb } from "../../lib/storage/db";
import { createRepositories } from "../../lib/storage/repositories";
import { AnswerComposer, type AnswerComposerValue } from "./answer-composer";
import { FeedbackPanel } from "./feedback-panel";
import { MarkschemeReveal } from "./markscheme-reveal";

const emptyAnswer: AnswerComposerValue = { text: "", images: [], imageNames: [] };
const selfRatings: Array<{ id: SelfRating; label: string; help: string }> = [
  { id: "again", label: "Again", help: "I need to practise this more." },
  { id: "hard", label: "Hard", help: "I mostly understood, but had to work for it." },
  { id: "good", label: "Good", help: "I could explain this confidently." },
];

function answerMode(answer: AnswerComposerValue): AnswerMode {
  if (answer.images.length > 0) return "images";
  if (answer.text.trim()) return "typed";
  return "manual";
}

async function readResponseMessage(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (
    typeof payload === "object" && payload !== null && "error" in payload &&
    typeof payload.error === "object" && payload.error !== null &&
    "message" in payload.error && typeof payload.error.message === "string"
  ) return payload.error.message;
  return "The local AI request could not be completed.";
}

export function QuestionSession({
  questions,
  onExit,
}: {
  questions: PracticeQuestion[];
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<AnswerComposerValue>(emptyAnswer);
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [modelSettingsReady, setModelSettingsReady] = useState(false);
  const [customTopicLookup, setCustomTopicLookup] = useState<{ questionId: string; topics: TopicDefinition[] } | null>(null);
  const [showMarkscheme, setShowMarkscheme] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void createRepositories(revisionDb).getSettings()
      .then((settings) => {
        if (active) setSelectedModelId(settings?.selectedModelId ?? "");
      })
      .catch(() => {
        if (active) setError("Saved settings could not be opened. You can still reveal the official markscheme.");
      })
      .finally(() => {
        if (active) setModelSettingsReady(true);
      });
    return () => { active = false; };
  }, []);

  const question = questions[index];

  useEffect(() => {
    let active = true;
    if (!question) return;

    const standardTopics = getTopicsForSubject(question.paper.subjectId, question.paper.syllabusVersion);
    const standardIds = new Set(standardTopics.map(({ id }) => id));
    const customTopicIds = question.topicIds.filter((id) => !standardIds.has(id));
    if (customTopicIds.length === 0) return;

    void Promise.all(customTopicIds.map((id) => revisionDb.topics.get(id)))
      .then((topics) => {
        if (active) {
          setCustomTopicLookup({
            questionId: question.id,
            topics: topics.filter((topic): topic is TopicDefinition => Boolean(topic)),
          });
        }
      })
      .catch(() => {
        if (active) setCustomTopicLookup({ questionId: question.id, topics: [] });
      });

    return () => { active = false; };
  }, [question]);

  if (!question) {
    return (
      <div className="practice-complete">
        <p className="eyebrow">Session complete</p>
        <h1>Good work</h1>
        <p>Your ratings are saved on this device. Your answer text and photos were not saved.</p>
        <button className="primary-button" type="button" onClick={onExit}>Choose another topic</button>
      </div>
    );
  }

  const subject = SUBJECTS.find(({ id }) => id === question.paper.subjectId as SubjectId);
  const canRate = feedback !== null || showMarkscheme;
  const hasAnswer = Boolean(answer.text.trim() || answer.images.length > 0);

  async function requestFeedback() {
    setError(null);
    setSavedMessage(null);
    setFeedback(null);
    if (!selectedModelId) {
      setError("Choose a local model in Settings to request AI feedback. You can still reveal the official markscheme and rate your attempt.");
      return;
    }

    let content;
    try {
      content = buildFeedbackRequest(question, {
        ...(answer.text.trim() ? { text: answer.text } : {}),
        ...(answer.images.length ? { images: answer.images } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Add an answer before requesting feedback.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/lmstudio/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId: selectedModelId, ...content }),
      });
      if (!response.ok) throw new Error(await readResponseMessage(response));
      const parsed = feedbackResultSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The local model returned feedback this app could not read.");
      setFeedback(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "LM Studio could not complete the request.");
    } finally {
      setBusy(false);
    }
  }

  async function rateAttempt(rating: SelfRating) {
    setError(null);
    setSavedMessage(null);
    setBusy(true);
    try {
      await createRepositories(revisionDb).saveSelfRating(question.id, rating, answerMode(answer));
      setAnswer(emptyAnswer);
      setFeedback(null);
      setShowMarkscheme(false);
      if (index + 1 < questions.length) {
        setIndex((current) => current + 1);
        setSavedMessage("Rating saved. Your answer was cleared.");
      } else {
        setIndex(questions.length);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your rating could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const customTopics = customTopicLookup?.questionId === question.id ? customTopicLookup.topics : [];
  const topicDefinitions = [
    ...getTopicsForSubject(question.paper.subjectId, question.paper.syllabusVersion),
    ...customTopics,
  ];
  const topicText = question.topicIds.map((topicId) => {
    const topic = topicDefinitions.find(({ id }) => id === topicId);
    if (topic) return topic.groupTitle ? `${topic.groupTitle}: ${topic.title}` : topic.title;
    const slug = topicId.replace(/:custom$/, "").split(":").at(-1);
    return slug?.replaceAll("-", " ") || "Confirmed topic";
  }).join(", ");

  return (
    <div className="question-session-page">
      <div className="question-session-heading">
        <div>
          <button className="text-button session-back-button" type="button" onClick={onExit}>← Choose another topic</button>
          <p className="eyebrow">Question {index + 1} of {questions.length}</p>
          <h1>{subject?.label ?? question.paper.subjectId}</h1>
        </div>
        <span className="local-badge">Confirmed past-paper question</span>
      </div>

      <article className="practice-question-card" aria-labelledby="practice-question-title">
        <div className="practice-question-source">
          <span>{question.paper.examSession}</span>
          <span>{question.paper.component}</span>
          <span>Question {question.number}</span>
          <span>Page{question.questionPages.length === 1 ? "" : "s"} {question.questionPages.join(", ")}</span>
        </div>
        <h2 id="practice-question-title">Question {question.number}</h2>
        <p className="practice-question-text">{question.exactText}</p>
        <p className="practice-question-topic">Confirmed topic: {topicText}</p>
      </article>

      <AnswerComposer value={answer} onChange={(nextAnswer) => {
        setAnswer(nextAnswer);
        setSavedMessage(null);
      }} />

      <div className="practice-feedback-actions">
        <div>
          <p className="field-help">Your typed answer and photos stay in memory only. Rate your attempt to save progress without the answer.</p>
          <p className="field-help">AI feedback is provisional and uses only this confirmed question and its matching markscheme.</p>
          {!modelSettingsReady && <p className="field-help" role="status">Preparing your local model settings…</p>}
        </div>
        <button className="primary-button" type="button" disabled={!hasAnswer || busy || !modelSettingsReady} onClick={() => void requestFeedback()}>
          {busy ? "Checking locally…" : modelSettingsReady ? "Get local AI feedback" : "Preparing local AI…"}
        </button>
      </div>

      {error && (
        <div className="practice-error-block">
          <p className="inline-error" role="alert">{error}</p>
          {hasAnswer && selectedModelId && <button className="secondary-button" type="button" disabled={busy} onClick={() => void requestFeedback()}>Retry feedback</button>}
        </div>
      )}
      {feedback && <FeedbackPanel feedback={feedback} />}

      <MarkschemeReveal
        text={question.markschemeText}
        pages={question.markschemePages}
        open={showMarkscheme}
        onToggle={() => setShowMarkscheme((current) => !current)}
      />

      {canRate && (
        <section className="self-rating-panel" aria-labelledby="self-rating-title">
          <div>
            <p className="eyebrow">Save progress</p>
            <h2 id="self-rating-title">How did that feel?</h2>
            <p>Your rating is saved with the question and time only. Your answer and photos are cleared after rating.</p>
          </div>
          <div className="self-rating-actions">
            {selfRatings.map(({ id, label, help }) => (
              <button className="self-rating-button" type="button" key={id} aria-label={`${label} ${help}`} disabled={busy} onClick={() => void rateAttempt(id)}>
                <strong>{label}</strong>
                <span>{help}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {savedMessage && <p className="inline-success" role="status">{savedMessage}</p>}
    </div>
  );
}
