import { NextResponse } from "next/server";
import { sendAcsMessage } from "@/lib/general-chat/acs";
import { verifyMessageAgainstRules } from "@/lib/general-chat/openaiVerification";
import {
  addMessage,
  addVerification,
  augmentThread,
  findMessage,
  addModerationFlag,
  store,
} from "@/lib/general-chat/store";
import { analyzeTextSafety } from "@/lib/content-safety/client";
import { isSuccessfulVerification } from "@/lib/general-chat/models";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messageId } = body as { messageId?: string };
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const message = await findMessage(messageId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const thread = await augmentThread(message.threadId);
  const rules = thread.officialRules;

  const verification = await verifyMessageAgainstRules(message, rules);

  // If Azure OpenAI is unavailable (or returns an "unverified" style payload), store it and return.
  if (!isSuccessfulVerification(verification)) {
    const record = await addVerification(verification);

    return NextResponse.json({
      verification: record,
      thread: await augmentThread(message.threadId),
    });
  }

  const verifiedStatus =
    verification.verificationResult === "confirmed"
      ? "verified"
      : verification.verificationResult === "partially_correct"
      ? "partially_verified"
      : "conflict";

  const record = await addVerification(verification, verifiedStatus);

  if (!isSuccessfulVerification(record)) {
    return NextResponse.json(
      { error: "Verification record incomplete" },
      { status: 500 }
    );
  }

  const aiContent =
    `AI verification: ${record.verificationResult}\n` +
    `Reason: ${record.explanation}\n` +
    `Sources: ${record.officialSourceIds.join(", ")}`;

  // Choose an ACS sender id for posting system/AI messages
  // Prefer: message sender's ACS id -> thread creator -> any user in thread -> fallback undefined (skip ACS send)
  const senderAcsUserId =
    store.users[message.senderId]?.acsUserId ||
    store.users[thread.createdBy]?.acsUserId ||
    thread.users[0]?.acsUserId;

  // Content Safety on the AI output
  const safetyCheckedAt = new Date().toISOString();
  let safety: { blocked: boolean; categories: Record<string, number> };
  try {
    safety = await analyzeTextSafety(aiContent);
  } catch (error) {
    console.error("Content Safety check failed", error);
    safety = { blocked: false, categories: {} };
  }

  const safetyMetadata = {
    source: "azure_content_safety",
    categories: safety.categories,
    blocked: safety.blocked,
    createdAt: safetyCheckedAt,
  };

  if (safety.blocked) {
    const systemText =
      "This AI verification could not be posted due to school safety policy.";

    // Best-effort ACS post (optional)
    try {
      if (senderAcsUserId) {
        await sendAcsMessage({
          threadId: message.threadId,
          content: systemText,
          senderAcsUserId,
          senderDisplayName: "System",
        });
      }
    } catch (e) {
      console.error("ACS system warning send failed", e);
    }

    // Persist system warning in Cosmos (must include content)
    const systemMessage = await addMessage({
      threadId: message.threadId,
      senderId: "system-content-safety",
      senderRole: "ai",
      content: systemText,
      createdAt: safetyCheckedAt,
      messageType: "system_warning",
      verifiedStatus: "unverified",
      relatedMessageId: message.messageId,
    });

    const moderation = await addModerationFlag({
      messageId: systemMessage.messageId,
      severity: "high",
      reason: "Azure Content Safety blocked an AI verification.",
      createdAt: safetyCheckedAt,
      actionTaken: "warning_posted",
      metadata: safetyMetadata,
    });

    return NextResponse.json({
      blocked: true,
      verification: record,
      moderation,
      systemMessage,
      thread: await augmentThread(message.threadId),
    });
  }

  // Best-effort ACS send for the AI verification message
  let deliveredAt = record.createdAt;
  try {
    if (senderAcsUserId) {
      const acsVerification = await sendAcsMessage({
        threadId: message.threadId,
        content: aiContent,
        senderAcsUserId,
        senderDisplayName: "AI Verifier",
      });
      deliveredAt = acsVerification?.deliveredAt ?? deliveredAt;
    }
  } catch (e) {
    console.error("ACS verification send failed", e);
  }

  // Persist AI verification message in Cosmos (must include content)
  const aiMessage = await addMessage({
    threadId: message.threadId,
    senderId: "ai-verifier",
    senderRole: "ai",
    content: aiContent,
    createdAt: deliveredAt,
    messageType: "ai_verification",
    verifiedStatus: "verified",
    relatedMessageId: message.messageId,
  });

  await addModerationFlag({
    messageId: aiMessage.messageId,
    severity: "low",
    reason: "Azure Content Safety scan completed.",
    createdAt: safetyCheckedAt,
    actionTaken: "none",
    metadata: safetyMetadata,
  });

  return NextResponse.json({
    verification: record,
    aiMessage,
    thread: await augmentThread(message.threadId),
  });
}
