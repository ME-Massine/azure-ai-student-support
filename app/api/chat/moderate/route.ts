import { NextResponse } from "next/server";
import { sendAcsMessage } from "@/lib/general-chat/acs";
import {
  addMessage,
  addModerationFlag,
  augmentThread,
  findMessage,
  store,
} from "@/lib/general-chat/store";
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

  const message = await findMessage(messageId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const moderation = evaluateModeration(message);

  const record = await addModerationFlag({
    messageId,
    severity: moderation.severity,
    reason: moderation.reason,
    createdAt: new Date().toISOString(),
    actionTaken: moderation.actionTaken,
  });

  let systemMessage: any = null;

  if (moderation.actionTaken === "warning_posted") {
    const systemText =
      "This message triggered safety filters and has been escalated to a moderator. Please keep the conversation respectful.";

    // Try to post via ACS (optional)
    const senderAcsUserId =
      store.users[message.senderId]?.acsUserId ||
      store.users[(await augmentThread(message.threadId)).createdBy]?.acsUserId;

    let deliveredAt = record.createdAt;
    try {
      if (senderAcsUserId) {
        const systemAcsMessage = await sendAcsMessage({
          threadId: message.threadId,
          content: systemText,
          senderAcsUserId,
          senderDisplayName: "System",
        });
        deliveredAt = systemAcsMessage?.deliveredAt ?? deliveredAt;
      }
    } catch (e) {
      console.error("ACS moderation warning send failed", e);
    }

    // Persist system warning in Cosmos (must include content)
    systemMessage = await addMessage({
      threadId: message.threadId,
      senderId: "system-moderation",
      senderRole: "ai",
      content: systemText,
      createdAt: deliveredAt,
      messageType: "system_warning",
      verifiedStatus: "unverified",
      relatedMessageId: message.messageId,
    });
  }

  return NextResponse.json({
    moderation: record,
    systemMessage,
    thread: await augmentThread(message.threadId),
  });
}
