import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

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
  const user_id = typeof body.user_id === "string" ? body.user_id : null;

  const row: Record<string, unknown> = { name, type };
  if (user_id) row.user_id = user_id;

  const { data, error } = await supabase
    .from("projects")
    .insert([row])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
