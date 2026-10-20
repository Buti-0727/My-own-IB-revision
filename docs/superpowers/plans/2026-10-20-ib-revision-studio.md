# IB Revision Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user local revision website that uses only user-confirmed questions from uploaded IB past papers and uses the user's LM Studio model for markscheme-grounded feedback.

**Architecture:** A Next.js App Router application runs on the user's laptop and binds only to loopback. Its Route Handlers act as a same-origin local bridge to LM Studio, avoiding direct browser-to-LM Studio CORS access. The browser stores PDFs, verified question records, topics, and progress in IndexedDB through Dexie; PDF.js handles local PDF rendering and text extraction.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS variables, Dexie, PDF.js (`pdfjs-dist`), Zod, fflate, Vitest, React Testing Library, fake-indexeddb, and Playwright. The workspace currently has Node.js 26.7.0 and npm 11.19.0.

**Spec:** [`docs/superpowers/specs/2026-10-20-ib-revision-studio-design.md`](../specs/2026-10-20-ib-revision-studio-design.md)

## Global Constraints

- “There is no hosted/private cloud server, account, remote file storage, telemetry, or cross-device sync.”
- “The app sends question context, answers, and the matching markscheme only to LM Studio running on the same laptop. It does not call a hosted AI service.”
- “AI may classify a source question by topic or explain an answer, but it must not write, paraphrase, or invent practice questions.”
- “The user imports paper and markscheme PDFs they already have.”
- “Before a question is available for practice, the user confirms its exact extracted wording against the original PDF, page/question reference, topic tag, and corresponding markscheme section.”
- “Typed answers and uploaded answer images are temporary by default. The progress record stores the attempted question and the user's self-rating, not the answer content or photos.”
- “The app displays a clear disconnected state when LM Studio is stopped and never silently switches to a hosted model.”
- Keep the web app bound to `127.0.0.1`; use `http://127.0.0.1:3000` as the one canonical browser origin so the browser database is not split across `localhost` and `127.0.0.1`.
- Do not enable broad LM Studio CORS. Do not add remote fonts, analytics, external AI, or automatic IBDocs ingestion.
- The user authorized Git initialization and linked this repository to their GitHub URL. Work on `feat/ib-revision-studio`; do not push or publish unless explicitly asked.

---

## Repository and File Map

Create the app in `web/` so the approved design and implementation documents stay outside the application tree.

| Path | Responsibility |
|---|---|
| `web/package.json` | Local start, test, lint, typecheck, and build scripts. |
| `web/next.config.ts` | Minimal Next.js configuration required for PDF.js worker assets. |
| `web/vitest.config.mts` | Vitest environment and test setup. |
| `web/src/app/layout.tsx` | Document metadata, global CSS, and app root. |
| `web/src/app/page.tsx` | Main single-page workspace route. |
| `web/src/app/globals.css` | Light/dark tokens, typography, responsive layout, focus styles, and reduced-motion rules. |
| `web/src/app/api/lmstudio/models/route.ts` | List models from the loopback LM Studio endpoint. |
| `web/src/app/api/lmstudio/feedback/route.ts` | Validate and forward a question, answer, and confirmed markscheme excerpt. |
| `web/src/app/api/lmstudio/topics/route.ts` | Suggest only IDs from the supplied topic list. |
| `web/src/lib/domain/types.ts` | Shared records and discriminated unions. |
| `web/src/lib/domain/subjects.ts` | The six fixed subject IDs, labels, and levels. |
| `web/src/lib/domain/topic-catalog.ts` | Versioned syllabus topic headings and custom-topic helpers. |
| `web/src/lib/storage/db.ts` | Dexie schema and database migrations. |
| `web/src/lib/storage/repositories.ts` | Paper, document, question, topic, settings, and attempt operations, including quota-aware writes. |
| `web/src/lib/pdf/extract.ts` | Local PDF page text extraction. |
| `web/src/lib/pdf/viewer.ts` | PDF.js worker setup and page rendering helpers. |
| `web/src/lib/papers/question-drafts.ts` | Deterministic question-boundary suggestions and exact-text validation. |
| `web/src/lib/ai/contracts.ts` | Zod request and response contracts for local AI routes. |
| `web/src/lib/ai/prompts.ts` | Topic suggestion and markscheme-feedback prompts. |
| `web/src/lib/server/lmstudio.ts` | Loopback-only LM Studio URL validation, model listing, and chat requests. |
| `web/src/lib/backup/archive.ts` | Versioned local ZIP export/import and validation. |
| `web/src/components/app-shell.tsx` | Persistent navigation and responsive workspace frame. |
| `web/src/components/practice/*` | Session setup, source question, typed/photo answer, feedback, and reveal flow. |
| `web/src/components/papers/*` | Paper library, upload, PDF viewer, and question confirmation flow. |
| `web/src/components/progress/*` | Attempt history and self-rating summaries. |
| `web/src/components/settings/*` | LM Studio status, model selection, exam-session choice, and backup controls. |
| `web/tests/unit/*` | Domain, storage, PDF, AI contract, and backup tests. |
| `web/tests/e2e/*` | Browser-level import, practice, fallback, and backup flows. |
| `web/tests/fixtures/*` | Small synthetic text-based paper, markscheme, and image used only in tests. |
| `web/README.md` | Local setup, LM Studio start instructions, backup warning, and privacy boundary. |

## Shared Data Contracts

Create these contracts before building feature screens so tasks can be reviewed independently.

```ts
export type SubjectId =
  | "english-b-sl"
  | "chinese-a-lang-lit-sl"
  | "chemistry-hl"
  | "math-aa-hl"
  | "biology-sl"
  | "psychology-hl";

export interface StoredDocument {
  id: string;
  paperId: string;
  kind: "question-paper" | "markscheme";
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
  status: "draft" | "confirmed";
}

export type SelfRating = "again" | "hard" | "good";

export interface AttemptRecord {
  id: string;
  questionId: string;
  attemptedAt: string;
  answerMode: "typed" | "images" | "manual";
  selfRating: SelfRating;
}

export interface FeedbackResult {
  creditedPoints: string[];
  missingPoints: string[];
  explanation: string;
  uncertainty: string[];
}
```

Do not add answer text or answer images to `AttemptRecord` or any persisted table.

---

## Task 1: Scaffold the Local App and Shell

**Files:** `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/src/app/layout.tsx`, `web/src/app/page.tsx`, `web/src/app/globals.css`, `web/vitest.config.mts`, `web/README.md`.

**Interfaces:** Produces a locally startable Next.js App Router app and an empty but navigable shell. Later tasks replace the main pane without changing the shell contract.

- [x] **Step 1: Create a non-Git Next.js app.**

Run from the workspace root:

```bash
npx create-next-app@latest web --typescript --eslint --app --src-dir --use-npm --no-tailwind --disable-git --skip-install --yes
```

Expected: `web/` contains a TypeScript App Router app; no nested Git repository is created.

- [x] **Step 2: Install runtime and test dependencies.**

```bash
cd web
npm install dexie pdfjs-dist fflate zod
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom fake-indexeddb @playwright/test
```

Expected: `package-lock.json` records the selected versions. Keep Next.js/React versions generated by `create-next-app` compatible with each other.

- [x] **Step 3: Bind the local start scripts to loopback and add verification scripts.**

Set scripts in `package.json` to:

```json
{
  "dev": "next dev --hostname 127.0.0.1",
  "build": "next build",
  "start": "next start --hostname 127.0.0.1",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```

- [x] **Step 4: Replace the scaffold page with the workspace shell.**

Create navigation labels `Practice`, `Papers`, `Progress`, and `Settings`; use the six fixed subjects in the subject navigation. Use semantic buttons and links, visible keyboard focus, CSS variables, a system light/dark theme, and no remote font imports or automatic motion.

- [x] **Step 5: Verify the empty shell.**

```bash
cd web
npm run lint && npm run typecheck && npm run build
```

Expected: all three commands pass, and the app starts at `http://127.0.0.1:3000` using `npm run dev`.

## Task 2: Add Subject, Topic, and Browser Storage Models

**Files:** `web/src/lib/domain/types.ts`, `subjects.ts`, `topic-catalog.ts`, `web/src/lib/storage/db.ts`, `repositories.ts`, `web/tests/unit/domain.test.ts`, `storage.test.ts`.

**Interfaces:** Produces the shared contracts above, `SUBJECTS`, `getTopicsForSubject(subjectId, syllabusVersion)`, `listPracticeQuestions(subjectId, topicId)`, and repository methods `savePaperBundle`, `confirmQuestion`, `listQuestions`, `saveAttempt`, and `listAttempts`.

- [x] **Step 1: Write failing domain tests.**

```ts
expect(SUBJECTS.map(({ id }) => id)).toEqual([
  "english-b-sl",
  "chinese-a-lang-lit-sl",
  "chemistry-hl",
  "math-aa-hl",
  "biology-sl",
  "psychology-hl",
]);
expect(listPracticeQuestions([draftQuestion, confirmedQuestion], "chemistry-hl", "topic-1"))
  .toEqual([confirmedQuestion]);
```

Add tests that every course has a versioned editable topic list and custom topics are returned only for their subject.

- [x] **Step 2: Run the focused tests and confirm they fail.**

```bash
cd web
npm test -- tests/unit/domain.test.ts tests/unit/storage.test.ts
```

Expected: FAIL because the domain and repository modules do not exist.

- [x] **Step 3: Implement the six subject records and versioned topic catalog.**

Require the user to choose their exam session before selecting a syllabus-version key. Seed concise topic headings for all six subjects from the applicable official IB subject guides for that session; store each guide title, source link, and first-assessment/session label next to the catalog. Verify each catalog against the current official IB material instead of guessing from older subject guides. Keep labels editable and support custom topic entries. Do not copy explanatory guide text into the app.

- [x] **Step 4: Implement the Dexie schema and repository functions.**

Create separate tables for papers, PDF blobs, questions, topics, settings, and attempts. Persist only question attempts and self-ratings. Store `verified` as a required boolean and ensure the practice query always filters `verified === true`. On first use, request persistent browser storage when supported and show `navigator.storage.estimate()` usage. Translate quota errors into a clear message that preserves the existing library and points to backup/export or removal of an unwanted PDF.

- [x] **Step 5: Run the focused tests and add migration coverage.**

```bash
cd web
npm test -- tests/unit/domain.test.ts tests/unit/storage.test.ts
```

Expected: PASS, including round-trip storage of Blob documents and rejection of unverified questions from practice queries.

## Task 3: Implement Local PDF Import, Viewing, and Question Confirmation

**Files:** `web/src/lib/pdf/extract.ts`, `viewer.ts`, `web/src/lib/papers/question-drafts.ts`, `web/src/components/papers/paper-library.tsx`, `paper-import-form.tsx`, `question-review-workbench.tsx`, `pdf-page-viewer.tsx`, `web/tests/unit/pdf.test.ts`, `paper-import.test.ts`.

**Interfaces:** Produces `extractPdfPages(file): Promise<ExtractedPage[]>`, `suggestQuestionDrafts(pages): QuestionDraft[]`, `isExactSourceText(candidate, pages): boolean`, and `confirmQuestion(draft, confirmedFields): Promise<QuestionRecord>`.

- [ ] **Step 1: Write failing PDF-import tests.**

```ts
const pages = [
  { page: 1, text: "1. State the equation.\n(a) Explain the result." },
  { page: 2, text: "2. Calculate the value." },
];
const drafts = suggestQuestionDrafts(pages);
expect(drafts.map(({ number }) => number)).toEqual(["1", "2"]);
expect(isExactSourceText(drafts[0].exactText, pages)).toBe(true);
expect(isExactSourceText("Invented question text", pages)).toBe(false);
```

Also test that an incomplete paper/markscheme pair cannot be saved.

- [ ] **Step 2: Run the tests and confirm they fail.**

```bash
cd web
npm test -- tests/unit/pdf.test.ts tests/unit/paper-import.test.ts
```

Expected: FAIL because PDF and paper-import functions do not exist.

- [ ] **Step 3: Implement PDF.js loading and text extraction in the browser.**

Return page-numbered text without sending files to a network URL. Keep the original PDF Blob in browser storage. Configure the PDF.js worker as a local bundled asset and test it on the synthetic two-page fixture.

- [ ] **Step 4: Implement editable question-boundary suggestions and source checks.**

Split initial candidates at recognizable numbered-question headings. Preserve the extracted wording; let the user merge/split candidates, select question pages, select markscheme pages/text, and add topic tags. If exact-text validation fails, keep the item in review state. For image-only/scanned pages, show the PDF and allow manual transcription with an explicit source-page confirmation.

- [ ] **Step 5: Implement the import and review screens.**

Require subject, exam session, component, question-paper PDF, and matching markscheme PDF. Include a clearly external resource link to the user-provided IB Docs subject-paper index; never fetch from it automatically. Show the full PDF at the selected source page beside extracted text. Do not persist a question as practice-ready until the user confirms wording, topic, page, and markscheme mapping.

- [ ] **Step 6: Run PDF/import tests and verify no external upload.**

```bash
cd web
npm test -- tests/unit/pdf.test.ts tests/unit/paper-import.test.ts
```

Expected: PASS. Browser network inspection during manual import shows no request containing PDF bytes or extracted paper text.

## Task 4: Connect the App to LM Studio on Loopback

**Files:** `web/src/lib/ai/contracts.ts`, `prompts.ts`, `web/src/lib/server/lmstudio.ts`, `web/src/app/api/lmstudio/models/route.ts`, `feedback/route.ts`, `topics/route.ts`, `web/src/components/settings/lmstudio-settings.tsx`, `web/tests/unit/lmstudio.test.ts`.

**Interfaces:**

- `GET /api/lmstudio/models` returns `{ models: { id: string }[] }` or a typed disconnected error.
- `POST /api/lmstudio/topics` accepts `{ modelId, questionText, allowedTopics }` and returns only valid topic IDs.
- `POST /api/lmstudio/feedback` accepts `{ modelId, questionText, answer, markschemeText }` and returns `FeedbackResult`.
- The server-side client reads `LM_STUDIO_BASE_URL`, defaults to `http://127.0.0.1:1234/v1`, and rejects non-loopback hosts.

- [ ] **Step 1: Write failing route/client tests.**

```ts
expect(() => assertLoopbackBaseUrl("https://example.com/v1")).toThrow();
expect(() => assertLoopbackBaseUrl("http://192.168.1.20:1234/v1")).toThrow();
expect(assertLoopbackBaseUrl("http://127.0.0.1:1234/v1").hostname).toBe("127.0.0.1");
```

Test model-list success, disconnected response, malformed feedback JSON, invalid topic IDs, and image content encoding using a mocked `fetch`.

- [ ] **Step 2: Run tests and confirm they fail.**

```bash
cd web
npm test -- tests/unit/lmstudio.test.ts
```

Expected: FAIL because the local client and handlers do not exist.

- [ ] **Step 3: Implement loopback-only LM Studio client and model discovery.**

Use the OpenAI-compatible `GET /v1/models` and `POST /v1/chat/completions` endpoints. Set a request timeout and map connection failures to a typed `LM_STUDIO_UNAVAILABLE` response. Do not accept arbitrary remote URLs from the browser. Enforce request-size limits before forwarding, especially for base64 answer images.

- [ ] **Step 4: Implement topic suggestions with a strict allowed-ID contract.**

Ask the local model to select from the supplied syllabus topic IDs only. Validate the response with Zod; discard IDs not present in the request. The endpoint returns tags/reasons only and has no question-generation output field.

- [ ] **Step 5: Implement markscheme feedback for text and image answers.**

Send only the confirmed question, current typed answer or temporary image data URLs, and its confirmed markscheme text. Request a structured response with credited points, missing points, explanation, and uncertainty. Reject any model response that fails the Zod response schema. Do not request or display an official mark.

- [ ] **Step 6: Add connection, text, and image-support checks in Settings.**

Show the models returned by LM Studio, let the user select one, and provide explicit text/image test actions. A successful model listing alone must not be labeled proof of image-reading quality. Save the selected model locally.

- [ ] **Step 7: Run local AI tests.**

```bash
cd web
npm test -- tests/unit/lmstudio.test.ts
```

Expected: PASS, including assertions that every upstream request uses a loopback host and that an unavailable model never triggers a remote fallback.

## Task 5: Build Topic Practice and Answer Feedback

**Files:** `web/src/lib/practice/select-questions.ts`, `web/src/components/practice/session-builder.tsx`, `question-session.tsx`, `answer-composer.tsx`, `feedback-panel.tsx`, `markscheme-reveal.tsx`, `web/tests/unit/practice.test.ts`, `web/tests/e2e/practice.spec.ts`.

**Interfaces:** Produces `selectQuestions(questions, subjectId, topicId, count)`, `buildFeedbackRequest(question, answer)`, and `saveSelfRating(questionId, rating)`.

- [ ] **Step 1: Write failing practice-selection and payload tests.**

```ts
expect(selectQuestions(questions, "biology-sl", "topic-a", 4))
  .toEqual([confirmedBiologyQuestion]);
expect(selectQuestions(questions, "biology-sl", "topic-b", 4))
  .toEqual([]);
expect(buildFeedbackRequest(question, typedAnswer).markschemeText)
  .toBe(question.markschemeText);
```

Include unverified questions in the fixture and assert they are never selected.

- [ ] **Step 2: Run the focused tests and confirm they fail.**

```bash
cd web
npm test -- tests/unit/practice.test.ts
```

Expected: FAIL because the practice selection/request functions do not exist.

- [ ] **Step 3: Implement subject/topic session setup.**

Support the versioned topic picker and custom topic text. Show question source details and allow the user to set a session size. If no verified matching questions exist, explain that more paper questions must be imported and confirmed.

- [ ] **Step 4: Implement typed and photo answer entry.**

Typed text stays in component memory. Photo input accepts supported browser image formats, previews each selected image, and keeps image bytes out of IndexedDB. If the selected model cannot process images, offer typed entry or manual markscheme reveal.

- [ ] **Step 5: Implement feedback, source display, and fallback.**

Call the local feedback endpoint. Display provisional credited/missing points and uncertainty beside the official markscheme reveal control. If the call fails, preserve the current question and answer on screen and offer retry or self-rating.

- [ ] **Step 6: Persist only the attempt and self-rating.**

After the user selects `again`, `hard`, or `good`, write an `AttemptRecord` without answer text, image blobs, or model prompt content.

- [ ] **Step 7: Run focused unit and browser tests.**

```bash
cd web
npm test -- tests/unit/practice.test.ts
npx playwright test tests/e2e/practice.spec.ts
```

Expected: PASS for exact-source filtering, typed answer feedback, vision-unavailable fallback, official markscheme reveal, and self-rating persistence.

## Task 6: Build Progress, Backup, and Restore

**Files:** `web/src/lib/backup/archive.ts`, `web/src/lib/progress/queries.ts`, `web/src/components/progress/progress-page.tsx`, `web/src/components/settings/backup-controls.tsx`, `web/tests/unit/backup.test.ts`, `progress.test.ts`, `web/tests/e2e/backup.spec.ts`.

**Interfaces:** Produces `exportBackup(db): Promise<Blob>`, `validateBackup(blob): Promise<ValidatedBackup>`, `restoreBackup(db, backup, mode): Promise<void>`, and `getProgressBySubjectAndTopic(db)`.

- [ ] **Step 1: Write failing progress and backup tests.**

```ts
const backup = await exportBackup(db);
const parsed = await validateBackup(backup);
expect(parsed.manifest.schemaVersion).toBe(1);
expect(parsed.attempts[0]).not.toHaveProperty("answerText");
expect(parsed.documents.map(({ kind }) => kind).sort())
  .toEqual(["markscheme", "question-paper"]);
```

Test rejection of an unsupported schema version and preservation of current data after an invalid archive.

- [ ] **Step 2: Run the focused tests and confirm they fail.**

```bash
cd web
npm test -- tests/unit/backup.test.ts tests/unit/progress.test.ts
```

Expected: FAIL because backup and progress functions do not exist.

- [ ] **Step 3: Implement local progress queries.**

Group attempts by subject, topic, and question; display attempt count and latest self-rating without creating a composite mastery score.

- [ ] **Step 4: Implement versioned ZIP export with fflate.**

Write `manifest.json`, `records.json`, and original paper/markscheme PDFs under generated safe document IDs. Exclude raw answers, image uploads, API payloads, and LM Studio prompts.

- [ ] **Step 5: Implement staged validation and restore.**

Validate archive paths, manifest version, record schemas, referenced document IDs, and PDF MIME types before opening a write transaction. Do not clear the existing database until validation succeeds and the user confirms replacement.

- [ ] **Step 6: Add backup controls and loss warning.**

Let the user download a backup and restore one. Explain that browser site-data deletion removes local data unless a backup exists.

- [ ] **Step 7: Run progress and backup tests.**

```bash
cd web
npm test -- tests/unit/backup.test.ts tests/unit/progress.test.ts
npx playwright test tests/e2e/backup.spec.ts
```

Expected: PASS, including an export-clear-import round trip that restores PDFs, confirmed questions, topics, and attempts.

## Task 7: Complete Accessibility, Local Run Instructions, and Full Verification

**Files:** `web/src/app/globals.css`, affected component files, `web/README.md`, `web/playwright.config.ts`, `web/tests/e2e/library.spec.ts`, `web/tests/e2e/locality.spec.ts`.

**Interfaces:** Produces a complete local workflow and verification suite; no new data contracts.

- [ ] **Step 1: Add the local setup and privacy instructions.**

Document Node/npm prerequisites, starting LM Studio's Developer server, selecting a model, running `npm run dev`, opening `http://127.0.0.1:3000`, backing up data, and the no-cloud boundary.

- [ ] **Step 2: Add the paper-library browser test.**

Test adding a question/markscheme PDF pair, extracting question candidates, changing a topic suggestion, confirming the source/page/markscheme mapping, and verifying the question appears in practice only after confirmation.

- [ ] **Step 3: Add local-network boundary tests.**

Assert the configured app server uses `127.0.0.1`, the LM Studio client rejects non-loopback URLs, the app never calls an external model host, and importing a PDF makes no network request.

- [ ] **Step 4: Audit accessibility and responsive states.**

Check keyboard-only navigation, visible focus, labels for file inputs, inline error text, light/dark contrast, reduced motion, narrow-screen navigation collapse, and readable source-PDF controls.

- [ ] **Step 5: Run the complete verification suite.**

```bash
cd web
npm run lint
npm run typecheck
npm test
npm run build
npx playwright test
```

Expected: all commands pass. Resolve any failures before describing the app as complete.

- [ ] **Step 6: Perform the manual LM Studio smoke test.**

With LM Studio server running on the default loopback endpoint, verify model discovery, text feedback, vision test with a vision-capable model, graceful failure with a text-only model, stop/restart behavior, and that the browser's network panel shows only same-origin app requests.

## Official Documentation to Consult During Implementation

- [Next.js `create-next-app` CLI](https://nextjs.org/docs/app/api-reference/cli/create-next-app) and [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers).
- [Mozilla PDF.js](https://mozilla.github.io/pdf.js/) Getting Started, browser examples, and API reference.
- [LM Studio OpenAI-compatible endpoints](https://lmstudio.ai/docs/developer/openai-compat), including [Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions) with image inputs.
- [Dexie documentation](https://dexie.org/docs) for IndexedDB schema, transactions, and upgrades.
- fflate documentation for ZIP creation and extraction; verify the official project docs/repository during implementation.
- [Playwright test documentation](https://playwright.dev/docs/intro).
- [IB Diploma Programme curriculum](https://www.ibo.org/programmes/diploma-programme/curriculum/). Select only subject-guide material appropriate to the user's chosen exam session.
- [IB Docs past papers by subject](https://ibdocs.re/past-papers-by-subject), as a user-opened resource link only.

## Spec Coverage Check

| Approved specification requirement | Plan tasks |
|---|---|
| Six courses, versioned topics, custom topic entry | 2, 4, 5 |
| Full local paper and matching markscheme PDFs | 2, 3 |
| Exact user-confirmed question wording, page, topic, and markscheme mapping | 3, 5 |
| Practice questions only from confirmed past-paper records | 2, 5 |
| Typed answers and optional vision-model answer photos | 4, 5 |
| Provisional markscheme-grounded feedback and manual self-rating fallback | 4, 5 |
| Browser-local persistence and versioned backup/restore | 2, 6 |
| No cloud, remote AI, paper scraping, or telemetry | 1, 3, 4, 7 |
| Responsive accessible UI, theme support, reduced motion | 1, 7 |
| Connection errors, incomplete extraction, missing markscheme, invalid backup | 3, 4, 6 |

## Execution Note

The user explicitly authorized Git initialization and provided the GitHub repository URL. Work locally on `feat/ib-revision-studio`; do not push or publish. Commit each independently verified task.


## Dependency Audit Note

The initial npm audit reports GHSA-vfj7-8cjw-p6xm through the development-only chain `eslint-config-next` -> `@next/eslint-plugin-next` -> `fast-glob` -> `micromatch` -> `braces@3.0.3`. The [GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) currently lists no patched braces release. npm's suggested fix is a major downgrade of `eslint-config-next`, so do not apply `npm audit fix --force`; re-check for an upstream patch before release.
