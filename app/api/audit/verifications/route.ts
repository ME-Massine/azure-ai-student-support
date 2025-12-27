import { NextResponse } from "next/server";

import { listVerificationsByResult } from "@/lib/general-chat/store";
import type { VerificationDetail } from "@/lib/general-chat/store";
import type { VerificationResult } from "@/lib/general-chat/models";

const STATUS_MAP: Record<string, VerificationResult> = {
  confirmed: "confirmed",
  partial: "partially_correct",
  incorrect: "incorrect",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const statusParam = (searchParams.get("status") ?? "partial").toLowerCase();
  const verificationResult = STATUS_MAP[statusParam];

  if (!verificationResult) {
    return NextResponse.json(
      { error: "Invalid status. Use confirmed, partial, or incorrect." },
      { status: 400 }
    );
  }

  try {
    const verifications: VerificationDetail[] =
      await listVerificationsByResult(verificationResult);
    return NextResponse.json({ verifications });
  } catch (error) {
    console.error("Failed to load audit verifications", error);
    return NextResponse.json(
      { error: "Unable to load verifications." },
      { status: 500 }
    );
  }
}
