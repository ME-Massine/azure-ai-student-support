import { NextResponse } from "next/server";
import { sendAcsMessage } from "@/lib/general-chat/acs";
import { verifyMessageAgainstRules } from "@/lib/general-chat/openaiVerification";
import {
  addMessage,
  addVerification,
  augmentThread,
  findMessage,
  addModerationFlag,
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
    return NextResponse.json(
      { error: "messageId is required" },
      { status: 400 }
    );
  }

  const message = await findMessage(messageId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const thread = await augmentThread(message.threadId);
  const rules = thread.officialRules;

  const verification = await verifyMessageAgainstRules(message, rules);

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

  const aiContent = `AI verification: ${record.verificationResult}\nReason: ${record.explanation}\nSources: ${record.officialSourceIds.join(", ")}`;
  const senderUser =
    thread.users.find((u) => u.userId === message.senderId) ?? thread.users[0];
  const senderAcsUserId = senderUser?.acsUserId;

  const safetyCheckedAt = new Date().toISOString();
  const safety = await analyzeTextSafety(aiContent);
  const safetyMetadata = {
    source: "azure_content_safety",
    categories: safety.categories,
    blocked: safety.blocked,
    createdAt: safetyCheckedAt,
  };

  if (safety.blocked) {
    const systemAcsMessage = senderAcsUserId
      ? await sendAcsMessage({
          threadId: message.threadId,
          content: "This message could not be posted due to school safety policy.",
          senderAcsUserId,
          senderDisplayName: "System",
        })
      : null;

    const systemMessage = await addMessage({
      threadId: message.threadId,
      senderId: "system-content-safety",
      senderRole: "ai",
      createdAt: systemAcsMessage?.deliveredAt ?? safetyCheckedAt,
      messageType: "system_warning",
      verifiedStatus: message.verifiedStatus,
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

  const acsVerification = senderAcsUserId
    ? await sendAcsMessage({
        threadId: message.threadId,
        content: aiContent,
        senderAcsUserId,
        senderDisplayName: "AI Verifier",
      })
    : null;

  const aiMessage = await addMessage({
    threadId: message.threadId,
    senderId: "ai-verifier",
    senderRole: "ai",
    createdAt: acsVerification?.deliveredAt ?? record.createdAt,
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
