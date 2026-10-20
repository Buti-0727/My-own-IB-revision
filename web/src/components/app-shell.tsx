"use client";

import { useState } from "react";
import { PaperLibrary } from "./papers/paper-library";

type Section = "Practice" | "Papers" | "Progress" | "Settings";

const sections: Section[] = ["Practice", "Papers", "Progress", "Settings"];
const subjects = [
  "English B SL",
  "Chinese A Language & Literature SL",
  "Chemistry HL",
  "Mathematics AA HL",
  "Biology SL",
  "Psychology HL",
];

export function AppShell() {
  const [activeSection, setActiveSection] = useState<Section>("Practice");
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="#main-content" aria-label="Revision Studio home">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span className="brand-name">Revision Studio</span>
        </a>

        <nav className="section-nav" aria-label="Study sections">
          <p className="nav-heading">Workspace</p>
          {sections.map((section) => (
            <button
              className={`nav-button${activeSection === section ? " is-active" : ""}`}
              type="button"
              key={section}
              aria-current={activeSection === section ? "page" : undefined}
              onClick={() => setActiveSection(section)}
            >
              <span>{section}</span>
              {section === "Settings" && <span className="nav-trailing">Local</span>}
            </button>
          ))}
        </nav>

        <nav className="subject-nav" aria-label="Your subjects">
          <p className="nav-heading">Your subjects</p>
          {subjects.map((subject) => (
            <button
              className={`subject-button${selectedSubject === subject ? " is-selected" : ""}`}
              type="button"
              key={subject}
              aria-pressed={selectedSubject === subject}
              onClick={() => {
                setSelectedSubject(subject);
                setActiveSection("Practice");
              }}
            >
              <span className="subject-initial" aria-hidden="true">{subject.charAt(0)}</span>
              <span>{subject}</span>
            </button>
          ))}
        </nav>

        <div className="privacy-note">
          <span className="privacy-mark" aria-hidden="true">On this device</span>
          <p>Your papers and progress stay in this browser.</p>
        </div>
      </aside>

      <main className="main-panel" id="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Study space</span>
            <span className="breadcrumb-divider" aria-hidden="true">/</span>
            <span>{activeSection}</span>
          </div>
          <a
            className="resource-link"
            href="https://ibdocs.re/past-papers-by-subject"
            target="_blank"
            rel="noreferrer"
          >
            Find past papers <span aria-hidden="true">↗</span>
          </a>
        </header>

        <section className="content-area" aria-live="polite">
          <SectionContent section={activeSection} subject={selectedSubject} />
        </section>

        <footer className="workspace-footer">
          <span>Made for your next study session.</span>
          <span>No account or cloud sync</span>
        </footer>
      </main>
    </div>
  );
}

function SectionContent({ section, subject }: { section: Section; subject: string | null }) {
  if (section === "Practice") {
    return (
      <div className="welcome-layout">
        <div className="welcome-copy">
          <p className="eyebrow">Your study space</p>
          <h1>{subject ?? "What are you revising today?"}</h1>
          <p className="intro-copy">
            {subject
              ? "Choose a topic to find questions from your verified past papers."
              : "Select a subject to start a focused revision session."}
          </p>
          <div className="welcome-actions">
            {subject ? (
              <div className="empty-state-inline">
                <span className="empty-state-icon" aria-hidden="true">+</span>
                <span>Verified questions will appear here once your papers are added.</span>
              </div>
            ) : (
              <p className="action-hint">Your subjects are listed on the left.</p>
            )}
          </div>
        </div>
        <aside className="session-note" aria-label="How revision works">
          <span className="note-rule" aria-hidden="true" />
          <h2>Practice from your papers</h2>
          <p>Questions are checked against the original paper and paired with its official markscheme before practice.</p>
          <div className="note-bottom">
            <span>Question source</span>
            <strong>Your uploaded papers</strong>
          </div>
        </aside>
      </div>
    );
  }

  if (section === "Papers") {
    return <PaperLibrary />;
  }

  if (section === "Progress") {
    return (
      <div className="section-empty">
        <p className="eyebrow">Your practice history</p>
        <h1>Progress</h1>
        <p className="intro-copy">Your attempts and self-ratings will be saved on this device.</p>
        <div className="empty-state-card">
          <span className="empty-state-icon" aria-hidden="true">↗</span>
          <div>
            <h2>Progress starts with a practice session</h2>
            <p>Once you have answered and rated a question, you can find it here by subject and topic.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-empty">
      <p className="eyebrow">Your setup</p>
      <h1>Settings</h1>
      <p className="intro-copy">Connect your local LM Studio model and manage your study data.</p>
      <div className="settings-preview">
        <div>
          <span className="setting-label">AI feedback</span>
          <strong>Runs through LM Studio on this laptop</strong>
        </div>
        <div>
          <span className="setting-label">Your library</span>
          <strong>Stored in this browser</strong>
        </div>
      </div>
    </div>
  );
}
