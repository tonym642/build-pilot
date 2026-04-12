import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/mode-preferences
 * Returns the single mode_preferences row.
 */
export async function GET() {
  const { data, error } = await supabase
    .from("mode_preferences")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      modes: { Book: true, App: false, Business: false, Music: false },
    });
  }

  return NextResponse.json(data);
}

/**
 * PUT /api/mode-preferences
 * Upserts the mode_preferences row.
 * Body: { modes: { Book: boolean, App: boolean, ... } }
 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !body.modes || typeof body.modes !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates = { modes: body.modes, updated_at: new Date().toISOString() };

  const { data: existing } = await supabase
    .from("mode_preferences")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("mode_preferences")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } else {
    const { data, error } = await supabase
      .from("mode_preferences")
      .insert([{ modes: body.modes }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }
}
