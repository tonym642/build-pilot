import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const showArchived = req.nextUrl.searchParams.get("archived") === "true";

  let query = supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (showArchived) {
    query = query.eq("archived", true);
  } else {
    query = query.or("archived.is.null,archived.eq.false");
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.archived === "boolean") updates.archived = body.archived;
  if (body.book_info && typeof body.book_info === "object") updates.book_info = body.book_info;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", body.id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  const name = body.name.trim();
  const type = typeof body.type === "string" ? body.type : "Book";

  const row = { name, type };

  const { data, error } = await supabase
    .from("projects")
    .insert([row])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create default book structure for Book projects
  if (type === "Book" && data) {
    const structure = [
      { project_id: data.id, type: "info", title: "Book Info", position: 0 },
      { project_id: data.id, type: "prologue", title: "Prologue", position: 1 },
      { project_id: data.id, type: "chapter", title: "Chapter 1", position: 2 },
      { project_id: data.id, type: "epilogue", title: "Epilogue", position: 3 },
    ];
    console.log("Creating book structure for project:", data.id);
    console.log("Structure payload:", structure);

    const { error: structureError } = await supabase
      .from("book_structure")
      .insert(structure);

    if (structureError) {
      console.log("book_structure insert error:", structureError);
    } else {
      console.log("book_structure created successfully");
    }
  }

  return NextResponse.json(data, { status: 201 });
}
