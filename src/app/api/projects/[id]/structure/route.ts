import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("book_structure")
    .select("*")
    .eq("project_id", id)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// Canonical sort: info=0, prologue=1, chapters by number starting at 2, epilogue last
function canonicalSort(
  items: { id: string; type: string; title: string; position: number }[]
) {
  const info = items.filter((r) => r.type === "info");
  const prologue = items.filter((r) => r.type === "prologue");
  const chapters = items
    .filter((r) => r.type === "chapter")
    .sort((a, b) => {
      const aNum = parseInt(a.title.match(/(\d+)/)?.[1] ?? "0", 10);
      const bNum = parseInt(b.title.match(/(\d+)/)?.[1] ?? "0", 10);
      return aNum - bNum;
    });
  const epilogue = items.filter((r) => r.type === "epilogue");
  const sorted = [...info, ...prologue, ...chapters, ...epilogue];
  return sorted.map((item, i) => ({ ...item, position: i }));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const type = body?.type ?? "chapter";
  const title = body?.title;

  // Get existing items
  const { data: existing } = await supabase
    .from("book_structure")
    .select("id, position, title, type")
    .eq("project_id", id);

  // Auto-generate chapter title based on count of existing chapters
  let finalTitle = title;
  if (!finalTitle && type === "chapter") {
    const chapterCount = (existing ?? []).filter((r) => r.type === "chapter").length;
    finalTitle = `Chapter ${chapterCount + 1}`;
  }

  // Insert the new row with a temporary position
  const { data: inserted, error } = await supabase
    .from("book_structure")
    .insert([{ project_id: id, type, title: finalTitle, position: 999 }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Re-sort all items to canonical order and update positions
  const allItems = [...(existing ?? []), inserted];
  const sorted = canonicalSort(allItems);
  for (const item of sorted) {
    await supabase
      .from("book_structure")
      .update({ position: item.position })
      .eq("id", item.id);
  }

  return NextResponse.json(inserted, { status: 201 });
}

// One-time repair: reorder all items to canonical positions
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("book_structure")
    .select("id, type, title, position")
    .eq("project_id", id);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!existing || existing.length === 0) {
    return NextResponse.json({ message: "Nothing to repair." });
  }

  const sorted = canonicalSort(existing);
  for (const item of sorted) {
    await supabase
      .from("book_structure")
      .update({ position: item.position })
      .eq("id", item.id);
  }

  return NextResponse.json(sorted);
}
