import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("draft_blocks")
    .select("*")
    .eq("project_id", id)
    .order("chapter", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.blocks)) {
    return NextResponse.json({ error: "blocks array is required." }, { status: 400 });
  }

  // Delete existing and replace with current state
  const { error: deleteError } = await supabase
    .from("draft_blocks")
    .delete()
    .eq("project_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (body.blocks.length === 0) {
    return NextResponse.json([]);
  }

  const rows = body.blocks.map((block: Record<string, unknown>, index: number) => ({
    id: block.id,
    project_id: id,
    content: block.content,
    previous_content: block.previousContent ?? null,
    chapter: block.chapter,
    source_compilation_id: block.sourceCompilationId ?? null,
    sort_order: index,
  }));

  const { data, error } = await supabase
    .from("draft_blocks")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
