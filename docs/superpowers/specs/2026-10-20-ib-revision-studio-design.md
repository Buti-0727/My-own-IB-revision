# IB Revision Studio - Design Specification

**Date:** 2026-10-20
**Status:** Approved direction, awaiting written-spec review
**Product:** A local, single-user revision website for six IB courses

## 1. Goal

Build a focused revision workspace for the user's English B SL, Chinese A Language and Literature SL, Chemistry HL, Mathematics: Analysis and Approaches HL, Biology SL, and Psychology HL courses.

The app keeps complete user-provided past-paper and markscheme PDFs available, selects practice material only from questions the user has verified in those PDFs, and uses the user's local LM Studio model to explain and give provisional feedback against the matching official markscheme.

## 2. Product decisions

- **Local only:** The app runs on the user's laptop. There is no hosted/private cloud server, account, remote file storage, telemetry, or cross-device sync.
- **Local AI:** LM Studio is the default model provider. The app sends question context, answers, and the matching markscheme only to LM Studio running on the same laptop. It does not call a hosted AI service.
- **Past-paper-only questions:** AI may classify a source question by topic or explain an answer, but it must not write, paraphrase, or invent practice questions.
- **User-supplied materials:** The app links to IB Docs as a resource reference. It does not scrape or automatically download papers. The user imports paper and markscheme PDFs they already have.
- **Fallback:** If LM Studio is unavailable, image interpretation is unsupported, or feedback is not useful, the user can reveal the official markscheme and self-rate after attempting the question separately.

## 3. Main user journeys

### 3.1 First launch and local model connection

1. The user starts the study app locally and opens it in a browser.
2. A connection panel checks whether LM Studio is reachable and whether a model is loaded.
3. The user can test the connection and see whether the loaded model supports text, images, or both.
4. If AI is unavailable, paper browsing and manual markscheme practice remain usable.

The app uses a small same-machine connection helper so the browser does not need broad direct access to the LM Studio API. The helper and model remain local and are not exposed as a hosted service.

### 3.2 Paper library and import

1. The user selects a subject and adds a full past-paper PDF with its matching official markscheme PDF.
2. The user records session/year and paper/component metadata. The original PDFs remain viewable in the app.
3. The app extracts available text locally and proposes question boundaries, page references, and syllabus topic tags. The local model may suggest topic tags, but cannot change question wording.
4. Before a question is available for practice, the user confirms its exact extracted wording against the original PDF, page/question reference, topic tag, and corresponding markscheme section.
5. If text extraction is incomplete, such as for a scanned page, the paper remains viewable and the user can add the question text manually with a page reference and verify it against the PDF. No unverified extraction enters practice.

Syllabus topic lists are selected for the user's chosen exam-session/course version, editable, and supplemented by user-defined topics. A question can have more than one confirmed topic tag.

### 3.3 Revision session

1. The user chooses one of the six subjects, then selects a syllabus topic or enters a custom topic phrase.
2. The app returns only confirmed questions tagged to that topic. Each question retains its paper, session, question number, page reference, and matching markscheme link.
3. The full source page is available beside the question so diagrams, tables, and other visual context are not lost in text extraction.
4. The user types an answer or attaches one or more answer images to that question.
5. If the loaded model supports the selected answer format, LM Studio returns provisional feedback grounded only in the question and its verified markscheme section. Feedback identifies relevant points, omissions, and uncertainty. It is not presented as an official examiner mark.
6. The user can reveal the official markscheme and self-rate at any point. If feedback fails or appears unreliable, this remains the fallback.

Typed answers and uploaded answer images are temporary by default. The progress record stores the attempted question and the user's self-rating, not the answer content or photos.

### 3.4 Progress

Progress is local and organized by subject, topic, and question. It records attempts and the user's self-rating so the user can revisit questions. The MVP does not claim a statistically valid mastery score and does not treat AI feedback as an official grade.

### 3.5 Backup and restore

The app provides an export/import backup containing locally stored papers, markschemes, confirmed question metadata, editable topic lists, and progress. The UI explains that clearing the browser's site data without a backup can remove the library and progress.

## 4. Information architecture and interface

Primary navigation:

- **Practice:** choose subject and topic, then start a question session.
- **Papers:** manage full past-paper and markscheme files and confirm extracted questions.
- **Progress:** review attempted questions and self-ratings by subject and topic.
- **Settings:** test LM Studio connection, choose the loaded local model, set the exam session/course version, and export or restore a backup.

The visual direction is a calm, high-contrast study workspace. It is responsive, supports system light/dark appearance, and honors reduced-motion preferences. This is a daily-use product interface, not a marketing landing page; cinematic hero layouts, dense decorative bento grids, and scroll-driven motion are intentionally excluded.

## 5. Local data and privacy boundaries

- Browser-local storage holds original PDFs, verified question records, topic lists, and progress.
- PDF text extraction and topic suggestions run locally.
- Text answers, answer images, and markscheme excerpts are sent only to the local LM Studio process for the current feedback request.
- No account, cloud database, remote AI provider, analytics, or automatic web ingestion is included.
- The app displays a clear disconnected state when LM Studio is stopped and never silently switches to a hosted model.

## 6. Error and fallback behavior

- **LM Studio unavailable:** show connection instructions; keep library, paper viewing, and markscheme reveal usable.
- **Text extraction incomplete:** mark the question as needing manual entry/verification; do not add it to practice until confirmed.
- **Vision unsupported or poor image reading:** explain the limitation, allow a typed response, or use the official markscheme and self-rating path.
- **Missing or unconfirmed markscheme mapping:** do not request AI feedback for that question; allow the user to review the paper and add/confirm the matching markscheme section.
- **Backup import problem:** report which records failed and preserve the existing local library unless the user explicitly confirms replacement.

## 7. Non-goals for the first version

- Cloud hosting, accounts, private-server sync, or multi-device access.
- Scraping, downloading, or mirroring content from IB Docs.
- AI-generated or AI-rewritten questions.
- Remote AI services or API keys.
- Official grading, predicted IB grades, or automatic examiner scoring.
- Persistent storage of raw answer text or answer photos by default.

## 8. Acceptance criteria

1. All six listed courses are available, with editable version-aware topic lists and custom topic entry.
2. Full uploaded paper and markscheme PDFs can be viewed locally and paired together.
3. Only user-confirmed question text with a source page/question reference and confirmed markscheme mapping can enter practice.
4. Every practice item is traceable to an uploaded paper; AI never generates or rewrites its wording.
5. Typed answers work with a local text model. Photo feedback is offered only when a local vision-capable model is available.
6. AI feedback is clearly provisional and markscheme-grounded; official markscheme reveal and self-rating remain available.
7. Papers, topic data, and progress persist in the browser and can be backed up and restored.
8. Normal use makes no external network request for papers, answers, progress, or AI inference.
9. The interface remains usable on desktop and mobile, in light and dark appearances, with keyboard navigation and reduced motion.

## 9. Verification plan

- Test imports with text-based and scanned PDFs, including page/question references and incomplete extraction states.
- Verify that unconfirmed questions and questions without a confirmed markscheme mapping never enter AI-assisted practice.
- Use a mock LM Studio endpoint to test connection failure, text feedback, unsupported image input, malformed responses, and retry behavior.
- Verify that the app never falls back to a remote AI provider.
- Test browser refresh, backup export/import, and recovery from a failed import without losing existing data.
- Manually inspect desktop/mobile layouts, keyboard focus, light/dark themes, and reduced-motion behavior.

## 10. Implementation boundary

Implementation begins only after the user reviews and approves this written specification. The next artifact should be an implementation plan; code, project scaffolding, and dependency installation are outside this design phase.
