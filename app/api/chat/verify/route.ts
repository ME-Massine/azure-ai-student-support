import { NextResponse } from "next/server";
import { verifyMessageAgainstRules } from "@/lib/general-chat/openaiVerification";
import {
  addMessage,
  addVerification,
  augmentThread,
  findMessage,
} from "@/lib/general-chat/store";

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

  const message = findMessage(messageId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const thread = augmentThread(message.threadId);
  const rules = thread.officialRules;

  const verification = await verifyMessageAgainstRules(message, rules);

  const verifiedStatus =
    verification.verificationResult === "confirmed"
      ? "verified"
      : verification.verificationResult === "partially_correct"
      ? "partially_verified"
      : "conflict";

  const record = addVerification(verification, verifiedStatus);

  const aiContent = `AI verification: ${record.verificationResult}\nReason: ${record.explanation}\nSources: ${record.officialSourceIds.join(", ")}`;

  const aiMessage = addMessage({
    threadId: message.threadId,
    senderId: "ai-verifier",
    senderRole: "senior",
    content: aiContent,
    createdAt: record.createdAt,
    messageType: "ai_verification",
    verifiedStatus: "verified",
    relatedMessageId: message.messageId,
  });

  return NextResponse.json({
    verification: record,
    aiMessage,
    thread: augmentThread(message.threadId),
  });
}
