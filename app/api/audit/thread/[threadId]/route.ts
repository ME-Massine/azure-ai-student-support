import { NextResponse } from "next/server";

import { augmentThread } from "@/lib/general-chat/store";

interface RouteParams {
  params: {
    threadId: string;
  };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const threadId = params.threadId;
  if (!threadId) {
    return NextResponse.json(
      { error: "threadId is required." },
      { status: 400 }
    );
  }

  try {
    const thread = await augmentThread(threadId);
    return NextResponse.json({ thread });
  } catch (error) {
    if (error instanceof Error && error.message === "Thread not found") {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }
    console.error("Failed to load audit thread", error);
    return NextResponse.json(
      { error: "Unable to load audit thread." },
      { status: 500 }
    );
  }
}
