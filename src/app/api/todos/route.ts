import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";

export async function GET() {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await req.json().catch(() => null);

  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("todos")
    .insert([{ text: body.text.trim(), notes: body.notes ?? "", is_complete: false, user_id: user.id }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.text === "string") updates.text = body.text;
  if (typeof body.notes === "string") updates.notes = body.notes;
  if (typeof body.is_complete === "boolean") updates.is_complete = body.is_complete;

  const { data, error } = await supabase
    .from("todos")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await withAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("todos")
    .delete()
    .eq("user_id", user.id)
    .in("id", body.ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
