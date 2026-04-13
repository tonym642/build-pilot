import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/ai-engine
 * Returns the single ai_engine_settings row.
 */
export async function GET() {
  const { data, error } = await supabase
    .from("ai_engine_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If no row exists yet, return defaults
  if (!data) {
    return NextResponse.json({
      global_instruction: "",
      mode_instructions: {},
    });
  }

  return NextResponse.json(data);
}

/**
 * PUT /api/ai-engine
 * Upserts the ai_engine_settings row.
 * Body: { global_instruction?: string, mode_instructions?: object }
 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.global_instruction === "string") {
    updates.global_instruction = body.global_instruction;
  }
  if (body.mode_instructions && typeof body.mode_instructions === "object") {
    updates.mode_instructions = body.mode_instructions;
  }
  if (typeof body.structuring_instructions === "string") {
    updates.structuring_instructions = body.structuring_instructions;
  }

  // Check if a row already exists
  const { data: existing } = await supabase
    .from("ai_engine_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update the existing row
    const { data, error } = await supabase
      .from("ai_engine_settings")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } else {
    // Insert a new row
    const { data, error } = await supabase
      .from("ai_engine_settings")
      .insert([{
        global_instruction: updates.global_instruction ?? "",
        mode_instructions: updates.mode_instructions ?? {},
      }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  }
}
