import { describe, expect, it } from "vitest";
import { SUBJECTS } from "../../src/lib/domain/subjects";
import { createCustomTopic, getTopicsForSubject, getSyllabusVersions } from "../../src/lib/domain/topic-catalog";

describe("IB subject catalog", () => {
  it("lists the six requested subjects with the correct levels", () => {
    expect(SUBJECTS).toEqual([
      { id: "english-b-sl", label: "English B SL", level: "SL" },
      { id: "chinese-a-lang-lit-sl", label: "Chinese A Language & Literature SL", level: "SL" },
      { id: "chemistry-hl", label: "Chemistry HL", level: "HL" },
      { id: "math-aa-hl", label: "Mathematics AA HL", level: "HL" },
      { id: "biology-sl", label: "Biology SL", level: "SL" },
      { id: "psychology-hl", label: "Psychology HL", level: "HL" },
    ]);
  });

  it("provides syllabus-versioned starter topics for all six subjects", () => {
    for (const subject of SUBJECTS) {
      const versions = getSyllabusVersions(subject.id);
      expect(versions.length, `${subject.label} should have a version`).toBeGreaterThan(0);
      for (const version of versions) {
        expect(getTopicsForSubject(subject.id, version.id).length).toBeGreaterThan(0);
      }
    }

    expect(getTopicsForSubject("english-b-sl", "first-assessment-2020").map(({ title }) => title))
      .toEqual([
        "Identities",
        "Experiences",
        "Human ingenuity",
        "Social organization",
        "Sharing the planet",
      ]);
  });

  it("creates an editable custom topic without altering the course starter list", () => {
    const custom = createCustomTopic("psychology-hl", "first-assessment-2027", "Working memory", 20);

    expect(custom).toMatchObject({
      subjectId: "psychology-hl",
      syllabusVersion: "first-assessment-2027",
      title: "Working memory",
      custom: true,
    });
    expect(custom.id).toContain(":custom");
  });

  it("rejects empty custom topics and unsupported syllabus versions", () => {
    expect(() => createCustomTopic("biology-sl", "first-assessment-2025", "  ", 1)).toThrow(/topic name/i);
    expect(() => createCustomTopic("biology-sl", "unknown-version", "Cells", 1)).toThrow(/syllabus version/i);
  });

  it("returns a fresh topic list so edits do not mutate the starter catalog", () => {
    const first = getTopicsForSubject("chemistry-hl", "first-assessment-2025");
    const second = getTopicsForSubject("chemistry-hl", "first-assessment-2025");
    first[0].title = "My renamed topic";

    expect(second[0].title).not.toBe("My renamed topic");
  });
});
