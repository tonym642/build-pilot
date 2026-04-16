import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id } = await params;
  const sectionId = req.nextUrl.searchParams.get("section_id");

  if (!sectionId) {
    return NextResponse.json({ error: "section_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("section_notes")
    .select("*")
    .eq("project_id", id)
    .eq("section_id", sectionId)
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { content: "" });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);

  if (!body || typeof body.section_id !== "string" || typeof body.content !== "string") {
    return NextResponse.json({ error: "section_id and content are required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("section_notes")
    .select("id")
    .eq("project_id", id)
    .eq("section_id", body.section_id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("section_notes")
      .update({ content: body.content, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } else {
    const { data, error } = await supabase
      .from("section_notes")
      .insert([{ project_id: id, section_id: body.section_id, content: body.content }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }
}
