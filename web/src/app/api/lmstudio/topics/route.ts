import { topicRequestSchema } from "../../../../lib/ai/contracts";
import {
  lmStudioErrorResponse,
  readJsonRequest,
  suggestLocalTopics,
} from "../../../../lib/server/lmstudio";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await readJsonRequest(request, topicRequestSchema);
    return Response.json(await suggestLocalTopics(input), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return lmStudioErrorResponse(error);
  }
}
