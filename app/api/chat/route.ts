import { NextResponse } from "next/server";

function normalizeAzureEndpoint(raw: string | undefined) {
  if (!raw) {
    throw new Error("Missing AZURE_OPENAI_ENDPOINT environment variable.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch (err) {
    throw new Error(`Invalid AZURE_OPENAI_ENDPOINT: ${String(err)}`);
  }

  if (url.protocol !== "https:") {
    throw new Error("AZURE_OPENAI_ENDPOINT must use HTTPS (https://)");
  }

  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION!;

const MAX_MESSAGE_LENGTH = 800;
const GENERIC_ERROR_MESSAGE =
  "Sorry, something went wrong while contacting the AI. Please try again.";

type Message = { role: "user" | "assistant"; content: string };
type Language = "en" | "fr" | "ar" | "es";
type Mode = "rules" | "rights" | "guidance";

/* 🔹 Smart system prompt */
function buildSystemPrompt(language: Language, mode: Mode) {
  const base =
    language === "fr"
      ? "Tu es un assistant calme, bienveillant et impartial qui aide les élèves."
      : language === "ar"
      ? "أنت مساعد ذكي وهادئ يساعد الطلاب بطريقة عادلة وداعمة."
      : language === "es"
      ? "Eres un asistente tranquilo, justo y solidario que ayuda a estudiantes."
      : "You are a calm, supportive, and fair assistant helping students.";

  if (mode === "rights") {
    return `${base}
Explique clairement les droits des élèves, avec un langage simple.
Ne donne pas de conseils juridiques.
Encourage le dialogue respectueux avec l'administration scolaire.`;
  }

  if (mode === "guidance") {
    return `${base}
Guide l'élève étape par étape sur ce qu'il devrait faire ensuite.
Pose des questions si une information manque.
Sois pratique et rassurant.`;
  }

  // Default: rules
  return `${base}
Explique les règles scolaires de manière simple.
Explique pourquoi ces règles existent.
Décris les conséquences possibles sans jugement.`;
}

function safeJson(body: unknown) {
  return typeof body === "object" && body !== null ? (body as any) : {};
}

/**
 * Azure streams SSE events like:
 * data: {"choices":[{"delta":{"content":"Hi"}}]}
 * data: [DONE]
 */
async function* sseToTextChunks(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const dataStr = trimmed.slice("data:".length).trim();
        if (dataStr === "[DONE]") return;

        try {
          const json = JSON.parse(dataStr);
          const token = json?.choices?.[0]?.delta?.content;
          if (typeof token === "string" && token.length > 0) {
            yield token;
          }
        } catch {
          // Ignore malformed SSE line
        }
      }
    }
  }
}

export async function POST(req: Request) {
  // 1. Move variable declaration INSIDE the function to ensure they refresh on server restart
  const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
  const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
  const API_VERSION = process.env.AZURE_OPENAI_API_VERSION;
  const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;

  try {
    // 2. Validate Endpoint immediately
    let azureEndpoint: string;
    try {
      azureEndpoint = normalizeAzureEndpoint(ENDPOINT);
    } catch (err) {
      console.error("❌ ENDPOINT ERROR:", err);
      return NextResponse.json(
        { error: "Server endpoint misconfiguration." },
        { status: 500 }
      );
    }

    // 3. Check for missing critical values
    if (!DEPLOYMENT || !AZURE_API_KEY) {
       console.error("❌ CRITICAL MISSING VARS: Ensure DEPLOYMENT and API_KEY are set in Azure Portal.");
       return NextResponse.json({ error: "Azure Deployment name not found." }, { status: 500 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    body = safeJson(body);
    const language = (body.language ?? "en") as Language;
    const mode = (body.mode ?? "rules") as Mode;
    const messages = Array.isArray(body.messages) ? (body.messages as Message[]) : null;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Conversation is empty." }, { status: 400 });
    }

    // 4. Construct the URL and Log it (Hide the key for safety)
    const fullUrl = `${azureEndpoint}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

    const azureRes = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": AZURE_API_KEY,
        },
        body: JSON.stringify({
          stream: true,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(language, mode),
            },
            ...messages,
          ],
        }),
      }
    );

    // 5. Handle Azure Errors with deep logging
    if (!azureRes.ok) {
      const errorData = await azureRes.text();
      console.error(`❌ AZURE REJECTED REQUEST (Status: ${azureRes.status})`);
      console.error("Error Detail:", errorData);
      
      return NextResponse.json(
        { error: `Azure Error: ${azureRes.statusText}`, detail: errorData }, 
        { status: azureRes.status }
      );
    }

    if (!azureRes.body) {
      console.error("❌ AZURE RESPONSE BODY IS EMPTY");
      return NextResponse.json({ error: "Empty response from AI." }, { status: 500 });
    }


    const encoder = new TextEncoder();
    const outStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const token of sseToTextChunks(azureRes.body!)) {
            controller.enqueue(encoder.encode(token));
          }
          controller.close();
        } catch (e) {
          console.error("Streaming transform error:", e);
          controller.error(e);
        }
      },
    });

    return new Response(outStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("💀 FATAL SERVER ERROR:", err);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}