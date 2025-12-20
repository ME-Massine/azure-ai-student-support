import { NextResponse } from "next/server";
import { sendAcsMessage } from "@/lib/general-chat/acs";
import {
  addMessage,
  augmentThread,
  getOrCreateThread,
  upsertUser,
} from "@/lib/general-chat/store";
import { ChatMessage, User } from "@/lib/general-chat/models";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { schoolId, threadId, user, content, messageType } = body as {
    schoolId?: string;
    threadId?: string;
    user?: User;
    content?: string;
    messageType?: ChatMessage["messageType"];
  };

  if (!user || !schoolId || !content) {
    return NextResponse.json(
      { error: "user, schoolId, and content are required" },
      { status: 400 }
    );
  }

  const thread = threadId
    ? augmentThread(threadId)
    : getOrCreateThread(schoolId, user.userId);

  upsertUser(user);

  const acsResult = await sendAcsMessage({
    threadId: thread.threadId,
    content,
    senderAcsUserId: user.acsUserId,
  });

  const created = addMessage({
    threadId: thread.threadId,
    senderId: user.userId,
    senderRole: user.role === "senior" ? "senior" : "student",
    content,
    createdAt: acsResult.deliveredAt,
    messageType: messageType ?? "student_answer",
    verifiedStatus: "unverified",
  });

  return NextResponse.json({ message: created, thread: augmentThread(thread.threadId) });
}
