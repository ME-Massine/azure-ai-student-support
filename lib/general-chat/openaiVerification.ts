import {
  ChatMessage,
  OfficialRule,
  NewAIVerification,
  VerificationResult,
  SuccessfulAIVerification,
  UnverifiedAIVerification,
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

  const requestBody = {
    messages: [
      {
        role: "system",
        content:
          "You only return JSON with keys verificationResult, explanation, officialSourceIds.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    max_tokens: 1000,
  };

  const requestUrl = `${endpoint}openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;
  
  // Log request details for debugging (without sensitive data)
  console.log("Azure OpenAI verification request:", {
    endpoint: endpoint,
    deployment: AZURE_OPENAI_DEPLOYMENT,
    apiVersion: AZURE_OPENAI_API_VERSION,
    messageLength: message.content.length,
    rulesCount: rules.length,
    promptLength: prompt.length,
  });

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": AZURE_OPENAI_API_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorMessage = `Azure OpenAI verification failed: ${response.status} ${response.statusText}`;
    let errorDetails: any = null;
    try {
      const errorBody = await response.json();
      errorDetails = errorBody;
      if (errorBody.error?.message) {
        errorMessage += ` - ${errorBody.error.message}`;
      } else if (errorBody.error?.code) {
        errorMessage += ` - Code: ${errorBody.error.code}`;
      } else if (typeof errorBody === "string") {
        errorMessage += ` - ${errorBody}`;
      }
      // Log full error details for debugging
      console.error("Azure OpenAI API error response:", JSON.stringify(errorBody, null, 2));
    } catch (parseError) {
      // If we can't parse the error body, try to get text
      try {
        const errorText = await response.text();
        console.error("Azure OpenAI API error (non-JSON):", errorText);
        errorMessage += ` - ${errorText.substring(0, 200)}`;
      } catch {
        // If we can't read the body at all, use the status text
        console.error("Azure OpenAI API error: Could not read error response body");
      }
    }
    const enhancedError = new Error(errorMessage);
    (enhancedError as any).status = response.status;
    (enhancedError as any).details = errorDetails;
    throw enhancedError;
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
  } as Omit<SuccessfulAIVerification, "verificationId">;
}

export async function verifyMessageAgainstRules(
  message: ChatMessage,
  rules: OfficialRule[]
): Promise<NewAIVerification> {
  try {
    return await callAzureVerification(message, rules);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = {
      message: errorMessage,
      messageId: message.messageId,
      hasRules: rules.length > 0,
      envVars: {
        hasApiKey: !!process.env.AZURE_OPENAI_API_KEY,
        hasDeployment: !!process.env.AZURE_OPENAI_DEPLOYMENT,
        hasApiVersion: !!process.env.AZURE_OPENAI_API_VERSION,
        hasEndpoint: !!process.env.AZURE_OPENAI_ENDPOINT,
      },
    };
    console.error("Azure OpenAI verification unavailable", errorDetails, error);
    return {
      messageId: message.messageId,
      verdict: "unverified",
      reason: "ai_unavailable",
      requiresHumanReview: true,
      createdAt: new Date().toISOString(),
    } as Omit<UnverifiedAIVerification, "verificationId">;
  }
}
