import { z } from "zod";

export const MAX_AI_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 7 * 1024 * 1024;

const imageDataUrlSchema = z
  .string()
  .max(MAX_IMAGE_DATA_URL_LENGTH)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i);

const modelIdSchema = z.string().trim().min(1).max(200);

export const modelListSchema = z.object({
  models: z.array(z.object({ id: modelIdSchema }).strict()),
}).strict();

export const topicRequestSchema = z.object({
  modelId: modelIdSchema,
  questionText: z.string().trim().min(1).max(20_000),
  allowedTopics: z.array(z.object({
    id: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
  }).strict()).min(1).max(120),
}).strict();

export const topicSuggestionSchema = z.object({
  topicId: z.string().min(1).max(300),
  reason: z.string().min(1).max(800),
}).strict();

export const topicSuggestionsSchema = z.object({
  suggestions: z.array(topicSuggestionSchema).max(12),
}).strict();

export const feedbackRequestSchema = z.object({
  modelId: modelIdSchema,
  questionText: z.string().trim().min(1).max(20_000),
  answer: z.object({
    text: z.string().max(30_000).optional(),
    images: z.array(imageDataUrlSchema).max(3).optional(),
  }).strict().refine(
    (answer) => Boolean(answer.text?.trim()) || Boolean(answer.images?.length),
    { message: "Add typed text or at least one answer image." },
  ),
  markschemeText: z.string().trim().min(1).max(30_000),
}).strict();

export const feedbackResultSchema = z.object({
  creditedPoints: z.array(z.string().min(1).max(1_200)).max(40),
  missingPoints: z.array(z.string().min(1).max(1_200)).max(40),
  explanation: z.string().min(1).max(8_000),
  uncertainty: z.array(z.string().min(1).max(1_000)).max(20),
}).strict();

export type TopicRequest = z.infer<typeof topicRequestSchema>;
export type TopicSuggestion = z.infer<typeof topicSuggestionSchema>;
export type TopicSuggestions = z.infer<typeof topicSuggestionsSchema>;
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
export type FeedbackResult = z.infer<typeof feedbackResultSchema>;
export type ModelList = z.infer<typeof modelListSchema>;
