import { createCollection, listCollections } from "@/lib/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List all collections (with document counts) for the switcher / corpus UI. */
export async function GET(): Promise<Response> {
  const collections = await listCollections();
  return Response.json({ collections });
}

/** Create a new (empty) collection. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name =
    typeof (body as { name?: unknown })?.name === "string"
      ? (body as { name: string }).name.trim()
      : "";
  if (!name) {
    return Response.json({ error: "A collection name is required." }, { status: 400 });
  }

  const description =
    typeof (body as { description?: unknown })?.description === "string"
      ? (body as { description: string }).description.trim()
      : undefined;

  const collection = await createCollection(name, description);
  return Response.json({ collection }, { status: 201 });
}
