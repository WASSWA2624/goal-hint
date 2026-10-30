import { parseBestSlipsQuery } from "@/domain/best-slips-query";
import { browseSamples, reviewDay } from "../../review-data";
import { requestViewer } from "../../viewer-modes";

export function GET(request: Request) {
  try { return Response.json(browseSamples(parseBestSlipsQuery(new URL(request.url).searchParams, reviewDay), requestViewer(request))); }
  catch { return Response.json({ error: "Invalid sample filter." }, { status: 400 }); }
}
