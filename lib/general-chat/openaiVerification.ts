import {
  ChatMessage,
  OfficialRule,
  NewAIVerification,
  VerificationResult,
} from "./models";

function normalizeAzureEndpoint(raw: string | undefined) {
  if (!raw) throw new Error("Missing AZURE_OPENAI_ENDPOINT");

  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("AZURE_OPENAI_ENDPOINT must use https://");
  }

  return url.toString().endsWith("/") ? url.toString() : `${url.toString()}/`;
}

function composePrompt(message: ChatMessage, rules: OfficialRule[]) {
  const ruleSummaries = rules
    .map((rule) => `- [${rule.ruleId}] ${rule.title}: ${rule.content}`)
    .join("\n");

  return `You are a verifier ensuring student answers match official school rules.\n\nMessage to verify:\n${message.content}\n\nOfficial rules for the school:\n${ruleSummaries}\n\nDecide if the message matches the rules. Respond with:\n- verificationResult: one of confirmed | partially_correct | incorrect\n- explanation: short neutral justification referencing rule ids\n- officialSourceIds: array of rule ids used.`;
}

function parseVerificationResponse(content: string) {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error("Failed to parse Azure OpenAI verification response");
  }

  const verificationResult = parsed?.verificationResult;
  const explanation = parsed?.explanation;

  const isValidResult =
    verificationResult === "confirmed" ||
    verificationResult === "partially_correct" ||
    verificationResult === "incorrect";

  if (!isValidResult || typeof explanation !== "string") {
    throw new Error("Azure OpenAI verification response missing required fields");
  }

  const officialSourceIds = Array.isArray(parsed.officialSourceIds)
    ? parsed.officialSourceIds.filter((id: unknown): id is string => typeof id === "string")
    : [];

  return {
    verificationResult: verificationResult as VerificationResult,
    explanation,
    officialSourceIds,
  };
}

async function callAzureVerification(
  message: ChatMessage,
  rules: OfficialRule[]
): Promise<NewAIVerification> {
  const { AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_VERSION } =
    process.env;
  const endpointRaw = process.env.AZURE_OPENAI_ENDPOINT;

  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_DEPLOYMENT || !AZURE_OPENAI_API_VERSION) {
    throw new Error("Azure OpenAI credentials are missing");
  }

  const endpoint = normalizeAzureEndpoint(endpointRaw);
  const prompt = composePrompt(message, rules);

  const response = await fetch(
    `${endpoint}openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_OPENAI_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You only return JSON with keys verificationResult, explanation, officialSourceIds.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Azure OpenAI verification failed: ${response.status}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Azure OpenAI response malformed");
  }

  const parsed = parseVerificationResponse(content);

  return {
    messageId: message.messageId,
    verdict: parsed.verificationResult,
    verificationResult: parsed.verificationResult,
    explanation: parsed.explanation,
    officialSourceIds: parsed.officialSourceIds,
    createdAt: new Date().toISOString(),
  };
}

export async function verifyMessageAgainstRules(
  message: ChatMessage,
  rules: OfficialRule[]
): Promise<NewAIVerification> {
  try {
    return await callAzureVerification(message, rules);
  } catch (error) {
    console.error("Azure OpenAI verification unavailable", error);
    return {
      messageId: message.messageId,
      verdict: "unverified",
      reason: "ai_unavailable",
      requiresHumanReview: true,
      createdAt: new Date().toISOString(),
    };
  }
}
