import { listLocalModels, lmStudioErrorResponse } from "../../../../lib/server/lmstudio";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await listLocalModels(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return lmStudioErrorResponse(error);
  }
}
