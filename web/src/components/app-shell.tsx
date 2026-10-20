"use client";

import { useState } from "react";
import type { SubjectId } from "../lib/domain/types";
import { SUBJECTS } from "../lib/domain/subjects";
import { PaperLibrary } from "./papers/paper-library";
import { LMStudioSettings } from "./settings/lmstudio-settings";
import { PracticeWorkspace } from "./practice/session-builder";

type Section = "Practice" | "Papers" | "Progress" | "Settings";

const sections: Section[] = ["Practice", "Papers", "Progress", "Settings"];

export function AppShell() {
  const [activeSection, setActiveSection] = useState<Section>("Practice");
  const [selectedSubject, setSelectedSubject] = useState<SubjectId | null>(null);

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
          {SUBJECTS.map((subject) => (
            <button
              className={`subject-button${selectedSubject === subject.id ? " is-selected" : ""}`}
              type="button"
              key={subject.id}
              aria-pressed={selectedSubject === subject.id}
              onClick={() => {
                setSelectedSubject(subject.id);
                setActiveSection("Practice");
              }}
            >
              <span className="subject-initial" aria-hidden="true">{subject.label.charAt(0)}</span>
              <span>{subject.label}</span>
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

function SectionContent({ section, subject }: { section: Section; subject: SubjectId | null }) {
  if (section === "Practice") {
    return <PracticeWorkspace subjectId={subject} />;
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

  return <LMStudioSettings />;
}
