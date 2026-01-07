import { NextResponse } from "next/server";

export async function POST() {
  try {
    // ACS is always simulated - always return a simulated identity
    const now = new Date();
    const expiresOn = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour

    return NextResponse.json({
      acsUserId: `sim-${crypto.randomUUID()}`,
      token: "simulated-acs-token",
      expiresOn,
      simulated: true,
    });
  } catch (error) {
    console.error("ACS identity creation failed:", error);
    return NextResponse.json(
      { error: "Failed to create ACS identity" },
      { status: 500 }
    );
  }
}
