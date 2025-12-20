import {
  AIVerification,
  ChatMessage,
  OfficialRule,
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

async function callAzureVerification(
  message: ChatMessage,
  rules: OfficialRule[]
): Promise<Omit<AIVerification, "verificationId">> {
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

  try {
    const parsed = JSON.parse(content);
    return {
      messageId: message.messageId,
      verificationResult: parsed.verificationResult as VerificationResult,
      explanation: parsed.explanation,
      officialSourceIds: parsed.officialSourceIds ?? [],
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error("Failed to parse Azure OpenAI verification response");
  }
}

function fallbackVerification(
  message: ChatMessage,
  rules: OfficialRule[]
): Omit<AIVerification, "verificationId"> {
  const matchedRule = rules.find((rule) =>
    message.content.toLowerCase().includes(rule.title.toLowerCase().split(" ")[0])
  );

  const result: VerificationResult = matchedRule ? "confirmed" : "partially_correct";

  return {
    messageId: message.messageId,
    verificationResult: result,
    explanation: matchedRule
      ? `Matches guidance from ${matchedRule.title}.`
      : "Could not find a direct match; treat as partially verified until a moderator reviews.",
    officialSourceIds: matchedRule ? [matchedRule.ruleId] : rules.map((r) => r.ruleId),
    createdAt: new Date().toISOString(),
  };
}

export async function verifyMessageAgainstRules(
  message: ChatMessage,
  rules: OfficialRule[]
): Promise<Omit<AIVerification, "verificationId">> {
  try {
    return await callAzureVerification(message, rules);
  } catch {
    return fallbackVerification(message, rules);
  }
}
