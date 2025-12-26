import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE_ID!;

export const cosmos = new CosmosClient({ endpoint, key });
export const database = cosmos.database(databaseId);
