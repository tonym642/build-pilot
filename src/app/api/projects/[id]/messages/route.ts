import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await req.json();
  const { messageId, ...flags } = body as {
    messageId: string;
    is_favorite?: boolean;
    is_liked?: boolean;
    is_disliked?: boolean;
    is_hidden?: boolean;
    is_deleted?: boolean;
  };

  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }

  const allowed = ["is_favorite", "is_liked", "is_disliked", "is_hidden", "is_deleted"];
  const updates: Record<string, boolean> = {};
  for (const key of allowed) {
    if (key in flags) updates[key] = !!(flags as Record<string, boolean>)[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid flags provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("messages")
    .update(updates)
    .eq("id", messageId)
    .eq("project_id", projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
