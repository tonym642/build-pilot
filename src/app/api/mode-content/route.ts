import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/mode-content
 * Returns the single mode_content row.
 */
export async function GET() {
  const { data, error } = await supabase
    .from("mode_content")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ content: {} });
  }

  return NextResponse.json(data);
}

/**
 * PUT /api/mode-content
 * Upserts the mode_content row.
 * Body: { content: { Book: {...}, App: {...}, ... } }
 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !body.content || typeof body.content !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates = { content: body.content, updated_at: new Date().toISOString() };

  const { data: existing } = await supabase
    .from("mode_content")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("mode_content")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } else {
    const { data, error } = await supabase
      .from("mode_content")
      .insert([{ content: body.content }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }
}
