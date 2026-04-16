import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string; versionId: string }> };

// GET version + sections
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id, versionId } = await params;

  const [versionRes, sectionsRes] = await Promise.all([
    supabase
      .from("book_versions")
      .select("*")
      .eq("id", versionId)
      .eq("project_id", id)
      .single(),
    supabase
      .from("book_version_sections")
      .select("*")
      .eq("book_version_id", versionId)
      .eq("project_id", id)
      .order("position", { ascending: true }),
  ]);

  if (versionRes.error) {
    return NextResponse.json({ error: versionRes.error.message }, { status: 500 });
  }
  if (!versionRes.data) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  return NextResponse.json({
    version: versionRes.data,
    sections: sectionsRes.data ?? [],
  });
}

// PATCH a single section's content
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id, versionId } = await params;
  const body = await req.json().catch(() => null);

  if (!body || typeof body.section_id !== "string") {
    return NextResponse.json({ error: "section_id is required." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.content === "string") updates.content = body.content;
  if (typeof body.section_title === "string") updates.section_title = body.section_title;
  if (typeof body.is_reviewed === "boolean") updates.is_reviewed = body.is_reviewed;
  if (typeof body.is_finalized === "boolean") updates.is_finalized = body.is_finalized;
  if (typeof body.reviewed_at === "string") updates.reviewed_at = body.reviewed_at;
  if (typeof body.finalized_at === "string") updates.finalized_at = body.finalized_at;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("book_version_sections")
    .update(updates)
    .eq("id", body.section_id)
    .eq("book_version_id", versionId)
    .eq("project_id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.log("section save error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
