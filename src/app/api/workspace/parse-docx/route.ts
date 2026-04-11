import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();

    if (!text) {
      return NextResponse.json({ error: "Could not extract readable text from this DOCX file." }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("DOCX parse error:", err);
    return NextResponse.json({ error: "Could not extract readable text from this DOCX file." }, { status: 500 });
  }
}
