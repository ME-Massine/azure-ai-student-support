import { CosmosClient, Database } from "@azure/cosmos";

let cosmosClient: CosmosClient | null = null;
let databaseInstance: Database | null = null;

export function getCosmosClient(): CosmosClient {
  if (cosmosClient) return cosmosClient;
  
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  
  if (!endpoint || !key) {
    throw new Error("Cosmos DB credentials are not configured");
  }
  
  cosmosClient = new CosmosClient({ endpoint, key });
  return cosmosClient;
}

export function getDatabase(): Database {
  if (databaseInstance) return databaseInstance;
  
  const databaseId = process.env.COSMOS_DATABASE_ID;
  if (!databaseId) {
    throw new Error("COSMOS_DATABASE_ID is not configured");
  }
  
  const client = getCosmosClient();
  databaseInstance = client.database(databaseId);
  return databaseInstance;
}
