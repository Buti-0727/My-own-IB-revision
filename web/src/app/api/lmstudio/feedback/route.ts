import { feedbackRequestSchema } from "../../../../lib/ai/contracts";
import {
  getLocalFeedback,
  lmStudioErrorResponse,
  readJsonRequest,
} from "../../../../lib/server/lmstudio";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await readJsonRequest(request, feedbackRequestSchema);
    return Response.json(await getLocalFeedback(input), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return lmStudioErrorResponse(error);
  }
}
