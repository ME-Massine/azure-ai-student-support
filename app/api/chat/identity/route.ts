import { NextResponse } from "next/server";
import { CommunicationIdentityClient } from "@azure/communication-identity";

function getIdentityClient(): CommunicationIdentityClient | null {
  const connectionString = process.env.ACS_CONNECTION_STRING;
  if (!connectionString) {
    return null;
  }
  
  return new CommunicationIdentityClient(connectionString);
}

export async function POST() {
  try {
    const identityClient = getIdentityClient();

    // When no ACS connection string is configured, return a simulated identity
    // so the demo can run end-to-end without Azure ACS.
    if (!identityClient) {
      const now = new Date();
      const expiresOn = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour

      return NextResponse.json({
        acsUserId: `sim-${crypto.randomUUID()}`,
        token: "simulated-acs-token",
        expiresOn,
        simulated: true,
      });
    }

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
