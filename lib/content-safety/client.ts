type ContentSafetyResult = {
  blocked: boolean;
  categories: Record<string, number>;
};

const API_VERSION = "2023-10-01";

export async function analyzeTextSafety(
  text: string
): Promise<ContentSafetyResult> {
  const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
  const key = process.env.AZURE_CONTENT_SAFETY_KEY;

  if (!endpoint || !key) {
    throw new Error("Content Safety is not configured");
  }

  const res = await fetch(
    `${endpoint}contentsafety/text:analyze?api-version=${API_VERSION}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": key,
      },
      body: JSON.stringify({
        text,
        categories: ["Hate", "Violence", "SelfHarm", "Sexual"],
        outputType: "FourSeverityLevels",
      }),
    }
  );

  if (!res.ok) {
    throw new Error("Content Safety request failed");
  }

  const data = await res.json();

  const categories: Record<string, number> = {};
  let blocked = false;

  for (const item of data.categoriesAnalysis ?? []) {
    categories[item.category] = item.severity;
    if (item.severity >= 3) blocked = true; // High or Critical
  }

  return { blocked, categories };
}
