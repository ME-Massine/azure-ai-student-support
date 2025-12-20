import { NextResponse } from "next/server";
import { addMessage, addModerationFlag, augmentThread, findMessage } from "@/lib/general-chat/store";
import { evaluateModeration } from "@/lib/general-chat/moderation";

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

  const message = findMessage(messageId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const moderation = evaluateModeration(message);
  const record = addModerationFlag(
    {
      messageId,
      severity: moderation.severity,
      reason: moderation.reason,
      createdAt: new Date().toISOString(),
      actionTaken: moderation.actionTaken,
    }
  );

  let systemMessage = null;
  if (moderation.actionTaken === "warning_posted") {
    systemMessage = addMessage({
      threadId: message.threadId,
      senderId: "system-moderation",
      senderRole: "ai",
      content:
        "This message triggered safety filters and has been escalated to a moderator. Please keep the conversation respectful.",
      createdAt: record.createdAt,
      messageType: "system_warning",
      verifiedStatus: message.verifiedStatus,
      relatedMessageId: message.messageId,
    });
  }

  return NextResponse.json({
    moderation: record,
    systemMessage,
    thread: augmentThread(message.threadId),
  });
}
