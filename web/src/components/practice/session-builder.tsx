"use client";

import { useEffect, useState } from "react";
import { SUBJECTS } from "../../lib/domain/subjects";
import type { SubjectId, TopicDefinition } from "../../lib/domain/types";
import { getSyllabusVersions, getTopicsForSubject } from "../../lib/domain/topic-catalog";
import { selectQuestions, type PracticeQuestion } from "../../lib/practice/select-questions";
import { revisionDb } from "../../lib/storage/db";
import { createRepositories } from "../../lib/storage/repositories";
import { QuestionSession } from "./question-session";

interface TopicChoice {
  topic: TopicDefinition;
  questionCount: number;
}

interface PracticeSessionBuilderProps {
  subjectId: SubjectId;
  onStart: (questions: PracticeQuestion[]) => void;
}

function topicName(topic: TopicDefinition) {
  return topic.groupTitle ? `${topic.groupTitle}: ${topic.title}` : topic.title;
}

export function PracticeSessionBuilder({ subjectId, onStart }: PracticeSessionBuilderProps) {
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [topicChoices, setTopicChoices] = useState<TopicChoice[]>([]);
  const [topicId, setTopicId] = useState("");
  const [sessionSize, setSessionSize] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subject = SUBJECTS.find(({ id }) => id === subjectId);

  useEffect(() => {
    let active = true;
    async function loadPracticeData() {
      setLoading(true);
      setError(null);
      try {
        const repositories = createRepositories(revisionDb);
        const papers = await repositories.listPapers(subjectId);
        const candidates: PracticeQuestion[] = [];
        for (const paper of papers) {
          const paperQuestions = await revisionDb.questions.where("paperId").equals(paper.id).toArray();
          candidates.push(...paperQuestions.map((question) => ({ ...question, paper })));
        }

        const versions = papers.length > 0
          ? [...new Set(papers.map(({ syllabusVersion }) => syllabusVersion))]
          : getSyllabusVersions(subjectId).map(({ id }) => id);
        const topicMap = new Map<string, TopicDefinition>();
        for (const version of versions) {
          const defaults = getTopicsForSubject(subjectId, version);
          const custom = await repositories.listTopics(subjectId, version);
          for (const topic of [...defaults, ...custom.filter(({ custom: isCustom }) => isCustom)]) {
            topicMap.set(topic.id, topic);
          }
        }

        const confirmed = candidates.filter((question) => question.verified && question.status === "confirmed");
        const counts = new Map<string, number>();
        for (const question of confirmed) {
          for (const id of question.topicIds) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        const choices = [...topicMap.values()]
          .map((topic) => ({ topic, questionCount: counts.get(topic.id) ?? 0 }))
          .sort((left, right) => left.topic.sortOrder - right.topic.sortOrder || left.topic.title.localeCompare(right.topic.title));
        if (!active) return;
        setQuestions(candidates);
        setTopicChoices(choices);
        setTopicId((current) => choices.some(({ topic }) => topic.id === current)
          ? current
          : choices.find(({ questionCount }) => questionCount > 0)?.topic.id ?? choices[0]?.topic.id ?? "");
      } catch {
        if (active) setError("Your papers could not be opened in this browser.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadPracticeData();
    return () => { active = false; };
  }, [subjectId]);

  const selectedChoice = topicChoices.find(({ topic }) => topic.id === topicId);
  const availableCount = selectedChoice?.questionCount ?? 0;
  const subjectName = subject?.label ?? subjectId;

  return (
    <div className="practice-builder-page">
      <div className="practice-page-heading">
        <div>
          <p className="eyebrow">Practice from your papers</p>
          <h1>{subjectName}</h1>
          <p className="intro-copy">Choose a syllabus topic. Only questions you confirmed from an uploaded past paper can enter this session.</p>
        </div>
        <span className="local-badge">No AI-written questions</span>
      </div>

      {loading ? (
        <p role="status" className="practice-loading">Loading your confirmed questions…</p>
      ) : error ? (
        <p role="alert" className="inline-error">{error}</p>
      ) : topicChoices.length === 0 ? (
        <div className="practice-empty-state">
          <h2>Add a paper to begin</h2>
          <p>Upload a full question paper and matching markscheme in Papers. Confirm each question and its topic before it appears here.</p>
        </div>
      ) : (
        <div className="practice-builder-card">
          <div className="practice-builder-fields">
            <label className="field-group">
              <span>Topic</span>
              <select value={topicId} onChange={(event) => setTopicId(event.currentTarget.value)}>
                {topicChoices.map(({ topic, questionCount }) => (
                  <option value={topic.id} key={topic.id} disabled={questionCount === 0}>
                    {topicName(topic)} · {questionCount} {questionCount === 1 ? "question" : "questions"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-group">
              <span>Session size</span>
              <select value={sessionSize} onChange={(event) => setSessionSize(Number(event.currentTarget.value))}>
                {[1, 3, 5, 10].map((count) => (
                  <option value={count} key={count}>{count} {count === 1 ? "question" : "questions"}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="practice-availability">
            {availableCount > 0
              ? `${availableCount} confirmed ${availableCount === 1 ? "question is" : "questions are"} available for this topic.`
              : "No confirmed paper questions match this topic yet. Choose another topic or confirm more questions in Papers."}
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={availableCount === 0}
            onClick={() => onStart(selectQuestions(questions, subjectId, topicId, sessionSize))}
          >
            Start practice
          </button>
          <p className="practice-source-note">Every question keeps its paper, session, component, and page reference.</p>
        </div>
      )}
    </div>
  );
}

export function PracticeWorkspace({ subjectId }: { subjectId: SubjectId | null }) {
  const [sessionQuestions, setSessionQuestions] = useState<PracticeQuestion[] | null>(null);
  if (sessionQuestions) {
    return <QuestionSession questions={sessionQuestions} onExit={() => setSessionQuestions(null)} />;
  }
  if (!subjectId) {
    return (
      <div className="welcome-layout">
        <div className="welcome-copy">
          <p className="eyebrow">Your study space</p>
          <h1>What are you revising today?</h1>
          <p className="intro-copy">Select a subject to find confirmed questions from your own past papers.</p>
        </div>
        <aside className="session-note" aria-label="Question source rule">
          <span className="note-rule" aria-hidden="true" />
          <h2>Questions from your papers only</h2>
          <p>AI can explain your attempt, but it never writes or changes the questions used for practice.</p>
        </aside>
      </div>
    );
  }
  return <PracticeSessionBuilder subjectId={subjectId} onStart={setSessionQuestions} />;
}
