import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("compilation_items")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

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

  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "items array is required." }, { status: 400 });
  }

  // Delete existing and replace with current state
  const { error: deleteError } = await supabase
    .from("compilation_items")
    .delete()
    .eq("project_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (body.items.length === 0) {
    return NextResponse.json([]);
  }

  const rows = body.items.map((item: Record<string, unknown>) => ({
    id: item.id,
    project_id: id,
    content: item.content,
    chapter: item.chapter,
    source_message_id: item.sourceMessageId ?? null,
    is_favorite: item.isFavorite ?? false,
  }));

  const { data, error } = await supabase
    .from("compilation_items")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
