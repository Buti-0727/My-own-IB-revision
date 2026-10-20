import type { SubjectId, SyllabusVersion, TopicDefinition } from "./types";

const sources: Record<SubjectId, SyllabusVersion[]> = {
  "english-b-sl": [
    {
      id: "first-assessment-2020",
      label: "Language B course",
      firstAssessment: 2020,
      sourceUrl: "https://www.ibo.org/programmes/diploma-programme/curriculum/language-acquisition/language-b/",
    },
  ],
  "chinese-a-lang-lit-sl": [
    {
      id: "first-assessment-2021",
      label: "First assessment 2021",
      firstAssessment: 2021,
      sourceUrl: "https://www.ibo.org/globalassets/new-structure/university-admission/pdfs/subject-guides/language-a-language-literature-guide.pdf",
    },
  ],
  "chemistry-hl": [
    {
      id: "first-assessment-2025",
      label: "First assessment 2025",
      firstAssessment: 2025,
      sourceUrl: "https://www-prod.ibo.org/globalassets/new-structure/recognition/pdfs/dp_sciences_chemistry_subject-brief_jan_2022_e.pdf",
    },
  ],
  "math-aa-hl": [
    {
      id: "first-assessment-2021",
      label: "First assessment 2021",
      firstAssessment: 2021,
      sourceUrl: "https://www-prod.ibo.org/globalassets/new-structure/programmes/dp/pdfs/sb_maths_analysis_en.pdf",
    },
  ],
  "biology-sl": [
    {
      id: "first-assessment-2025",
      label: "First assessment 2025",
      firstAssessment: 2025,
      sourceUrl: "https://www-prod.ibo.org/globalassets/new-structure/recognition/pdfs/dp_sciences_biology_subject-brief_jan_2022_e.pdf",
    },
  ],
  "psychology-hl": [
    {
      id: "first-assessment-2019",
      label: "First assessment 2019",
      firstAssessment: 2019,
      sourceUrl: "https://ibo.org/globalassets/new-structure/programmes/dp/pdfs/psychology-2019.pdf",
    },
    {
      id: "first-assessment-2027",
      label: "First assessment 2027",
      firstAssessment: 2027,
      sourceUrl: "https://www-prod.ibo.org/globalassets/new-structure/programmes/dp/pdfs/dp_psychology_subjectbrief_en.pdf",
    },
  ],
};

type TopicSeed = {
  title: string;
  groupTitle?: string;
};

const topicSeeds: Record<string, TopicSeed[]> = {
  "english-b-sl:first-assessment-2020": [
    { title: "Identities" },
    { title: "Experiences" },
    { title: "Human ingenuity" },
    { title: "Social organization" },
    { title: "Sharing the planet" },
  ],
  "chinese-a-lang-lit-sl:first-assessment-2021": [
    { title: "Readers, writers and texts" },
    { title: "Time and space" },
    { title: "Intertextuality: connecting texts" },
  ],
  "chemistry-hl:first-assessment-2025": [
    { title: "Models of the particulate nature of matter", groupTitle: "Structure 1" },
    { title: "Models of bonding and structure", groupTitle: "Structure 2" },
    { title: "Classification of matter", groupTitle: "Structure 3" },
    { title: "What drives chemical reactions?", groupTitle: "Reactivity 1" },
    { title: "How much, how fast and how far?", groupTitle: "Reactivity 2" },
    { title: "What are the mechanisms of chemical change?", groupTitle: "Reactivity 3" },
  ],
  "math-aa-hl:first-assessment-2021": [
    { title: "Number and algebra" },
    { title: "Functions" },
    { title: "Geometry and trigonometry" },
    { title: "Statistics and probability" },
    { title: "Calculus" },
  ],
  "biology-sl:first-assessment-2025": [
    { title: "Unity and diversity" },
    { title: "Form and function" },
    { title: "Interaction and interdependence" },
    { title: "Continuity and change" },
  ],
  "psychology-hl:first-assessment-2019": [
    { title: "Biological approach", groupTitle: "Approaches" },
    { title: "Cognitive approach", groupTitle: "Approaches" },
    { title: "Sociocultural approach", groupTitle: "Approaches" },
    { title: "Abnormal psychology", groupTitle: "Options" },
    { title: "Developmental psychology", groupTitle: "Options" },
    { title: "Health psychology", groupTitle: "Options" },
    { title: "Psychology of human relationships", groupTitle: "Options" },
    { title: "Research methods" },
  ],
  "psychology-hl:first-assessment-2027": [
    { title: "Concepts", groupTitle: "Curriculum model" },
    { title: "Content", groupTitle: "Curriculum model" },
    { title: "Contexts", groupTitle: "Curriculum model" },
    { title: "Research methodology", groupTitle: "Curriculum model" },
  ],
};

function makeTopicId(subjectId: SubjectId, versionId: string, title: string) {
  const slug = title
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return `${subjectId}:${versionId}:${slug}`;
}

export function getSyllabusVersions(subjectId: SubjectId): SyllabusVersion[] {
  return sources[subjectId].map((version) => ({ ...version }));
}

export function getTopicsForSubject(subjectId: SubjectId, syllabusVersion: string): TopicDefinition[] {
  const version = sources[subjectId].find(({ id }) => id === syllabusVersion);
  if (!version) return [];

  return (topicSeeds[`${subjectId}:${syllabusVersion}`] ?? []).map((seed, sortOrder) => ({
    id: makeTopicId(subjectId, syllabusVersion, seed.title),
    subjectId,
    syllabusVersion,
    title: seed.title,
    sortOrder,
    sourceUrl: version.sourceUrl,
    ...(seed.groupTitle ? { groupTitle: seed.groupTitle } : {}),
    custom: false,
  }));
}

export function createCustomTopic(
  subjectId: SubjectId,
  syllabusVersion: string,
  title: string,
  sortOrder: number,
): TopicDefinition {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("A topic name is required.");
  if (!sources[subjectId].some((version) => version.id === syllabusVersion)) {
    throw new Error("Choose a syllabus version for this subject.");
  }

  return {
    id: `${makeTopicId(subjectId, syllabusVersion, normalizedTitle)}:custom`,
    subjectId,
    syllabusVersion,
    title: normalizedTitle,
    sortOrder,
    sourceUrl: sources[subjectId].find(({ id }) => id === syllabusVersion)!.sourceUrl,
    custom: true,
  };
}
