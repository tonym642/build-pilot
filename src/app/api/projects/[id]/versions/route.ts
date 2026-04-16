import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id } = await params;

  const { data, error } = await supabase
    .from("book_versions")
    .select("*")
    .eq("project_id", id)
    .order("version_number", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich each version with section counts for derived status
  const enriched = await Promise.all(
    (data ?? []).map(async (v) => {
      const { data: sections } = await supabase
        .from("book_version_sections")
        .select("is_finalized, is_reviewed")
        .eq("book_version_id", v.id)
        .neq("section_type", "info");

      const total = sections?.length ?? 0;
      const finalized = sections?.filter((s) => s.is_finalized).length ?? 0;
      const reviewed = sections?.filter((s) => s.is_reviewed).length ?? 0;

      let derived_status = "pending";
      if (total > 0 && finalized === total) derived_status = "finalized";
      else if (reviewed > 0 || finalized > 0) derived_status = "in_progress";

      return { ...v, derived_status, sections_total: total, sections_finalized: finalized, sections_reviewed: reviewed };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.sections)) {
    return NextResponse.json({ error: "sections array is required." }, { status: 400 });
  }

  console.log("Send to Book - project_id:", id);

  // Get current highest version_number
  const { data: existing } = await supabase
    .from("book_versions")
    .select("version_number")
    .eq("project_id", id)
    .order("version_number", { ascending: false })
    .limit(1);

  const versionNumber = existing && existing.length > 0 ? existing[0].version_number + 1 : 1;
  console.log("Send to Book - version_number:", versionNumber);

  // Create the version row
  const { data: version, error: versionError } = await supabase
    .from("book_versions")
    .insert([{
      project_id: id,
      version_number: versionNumber,
      source: "manuscript",
      status: "snapshot",
    }])
    .select()
    .single();

  if (versionError) {
    console.log("Send to Book - version insert error:", versionError);
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }

  console.log("Send to Book - created version id:", version.id);

  // Insert all sections as frozen snapshots
  const sectionRows = body.sections.map(
    (s: { section_type: string; section_title: string; position: number; content: string }) => ({
      book_version_id: version.id,
      project_id: id,
      section_type: s.section_type,
      section_title: s.section_title,
      position: s.position,
      content: s.content,
    })
  );

  const { error: sectionsError } = await supabase
    .from("book_version_sections")
    .insert(sectionRows);

  if (sectionsError) {
    console.log("Send to Book - sections insert error:", sectionsError);
    return NextResponse.json({ error: sectionsError.message }, { status: 500 });
  }

  console.log("Send to Book - sections copied:", sectionRows.length);

  return NextResponse.json({
    id: version.id,
    version_number: versionNumber,
    sections_count: sectionRows.length,
  }, { status: 201 });
}
