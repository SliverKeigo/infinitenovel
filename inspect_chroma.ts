import { ChromaClient } from "chromadb";

// This is the same URL from your project's vector-store
const CHROMA_URL = process.env.CHROMA_URL || "http://10.241.158.161:8000";

async function inspectCollection(collectionName: string) {
  console.log(`Connecting to ChromaDB at ${CHROMA_URL}...`);

  const url = new URL(CHROMA_URL);
  const client = new ChromaClient({
    host: url.hostname,
    port: Number(url.port),
    ssl: url.protocol === "https:",
  });

  try {
    console.log(`Fetching collection: "${collectionName}"...`);
    const collection = await client.getCollection({ name: collectionName });

    console.log("Found collection. Getting all items...");
    // The .get() method with an empty object retrieves all items.
    const items = await collection.get({});

    console.log(`
--------------------------------------------------
Collection: ${collectionName}
Total Items: ${items.ids.length}
--------------------------------------------------
`);

    if (items.ids.length === 0) {
      console.log("The collection is empty.");
      return;
    }

    for (let i = 0; i < items.ids.length; i++) {
      console.log(`[Item ${i + 1}]`);
      console.log(`  ID: ${items.ids[i]}`);
      console.log(`  Document: ${items.documents[i]}`);
      console.log(`  Metadata: ${JSON.stringify(items.metadatas[i])}`);
      console.log("--------------------");
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

// Get the collection name from command line arguments
const collectionNameArg = process.argv[2];

if (!collectionNameArg) {
  console.error("Please provide a collection name to inspect.");
  console.error("Example: ts-node inspect_chroma.ts novel_YOUR_NOVEL_ID_roles");
  process.exit(1);
}

inspectCollection(collectionNameArg);
