import { NextResponse } from "next/server";

const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION!;

// Guardrail constants
const MAX_MESSAGE_LENGTH = 800; // characters
const GENERIC_ERROR_MESSAGE =
  "Sorry, something went wrong while contacting the AI. Please try again.";

export async function POST(req: Request) {
  try {
    // 1️⃣ Parse body safely
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const message = body?.message;

    // 2️⃣ Validate message existence
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Please enter a valid question." },
        { status: 400 }
      );
    }

    // 3️⃣ Trim + length guard
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "Your message cannot be empty." },
        { status: 400 }
      );
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          error: `Your message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`,
        },
        { status: 413 }
      );
    }

    // 4️⃣ Build request (NO unsupported params like temperature)
    const azureResponse = await fetch(
      `${AZURE_ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": AZURE_API_KEY,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are a calm, supportive AI that helps students understand school rules.",
            },
            {
              role: "user",
              content: trimmed,
            },
          ],
        }),
      }
    );

    // 5️⃣ Handle Azure errors explicitly
    if (!azureResponse.ok) {
      const errorText = await azureResponse.text();
      console.error("Azure OpenAI error:", errorText);

      return NextResponse.json(
        { error: GENERIC_ERROR_MESSAGE },
        { status: 500 }
      );
    }

    const data = await azureResponse.json();

    // 6️⃣ Defensive response parsing
    const reply =
      data?.choices?.[0]?.message?.content ??
      "I’m sorry, I couldn’t generate a response. Please try again.";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}
