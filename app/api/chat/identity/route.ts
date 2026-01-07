import { NextResponse } from "next/server";
import { CommunicationIdentityClient } from "@azure/communication-identity";

export async function POST() {
  try {
    const connectionString = process.env.ACS_CONNECTION_STRING;

    // When no ACS connection string is configured, return a simulated identity
    // so the demo can run end-to-end without Azure ACS.
    if (!connectionString) {
      const now = new Date();
      const expiresOn = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour

      return NextResponse.json({
        acsUserId: `sim-${crypto.randomUUID()}`,
        token: "simulated-acs-token",
        expiresOn,
        simulated: true,
      });
    }

    const identityClient = new CommunicationIdentityClient(connectionString);

    const user = await identityClient.createUser();
    const token = await identityClient.getToken(user, ["chat"]);

    return NextResponse.json({
      acsUserId: user.communicationUserId,
      token: token.token,
      expiresOn: token.expiresOn,
      simulated: false,
    });
  } catch (error) {
    console.error("ACS identity creation failed:", error);
    return NextResponse.json(
      { error: "Failed to create ACS identity" },
      { status: 500 }
    );
  }
}
