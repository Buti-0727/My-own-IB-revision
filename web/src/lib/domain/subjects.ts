import type { SubjectDefinition, SubjectId } from "./types";

export const SUBJECTS: readonly SubjectDefinition[] = [
  { id: "english-b-sl", label: "English B SL", level: "SL" },
  { id: "chinese-a-lang-lit-sl", label: "Chinese A Language & Literature SL", level: "SL" },
  { id: "chemistry-hl", label: "Chemistry HL", level: "HL" },
  { id: "math-aa-hl", label: "Mathematics AA HL", level: "HL" },
  { id: "biology-sl", label: "Biology SL", level: "SL" },
  { id: "psychology-hl", label: "Psychology HL", level: "HL" },
];

export function isSubjectId(value: string): value is SubjectId {
  return SUBJECTS.some((subject) => subject.id === value);
}
