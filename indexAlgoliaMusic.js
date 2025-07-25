require('dotenv').config(); 
const { algoliasearch } = require('algoliasearch');
const { processMusicData } = require('./enrichmentService');

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_ADMIN_API_KEY = process.env.ALGOLIA_ADMIN_API_KEY;
const ALGOLIA_INDEX_NAME = 'classical_music_enriched_by_ai';

if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_API_KEY) {
    console.error("ERROR: ALGOLIA_APP_ID or ALGOLIA_ADMIN_API_KEY is not set in your .env file.");
    process.exit(1);
}

// Initialize Algolia client
const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);

async function indexEnrichedMusicData() {
    console.log(`Starting data enrichment and indexing to Algolia index: ${ALGOLIA_INDEX_NAME}`);
    try {
        const rawMusicFilePath = './data/music_metadata.json';
        const enrichedMusic = await processMusicData(rawMusicFilePath);

        if (enrichedMusic.length === 0) {
            console.warn("No music works were enriched. Nothing to index.");
            return;
        }

        console.log(`Successfully enriched ${enrichedMusic.length} music works. Now indexing to Algolia...`);

        const saveObjectsResponse = await client.saveObjects({
            indexName: ALGOLIA_INDEX_NAME,
            objects: enrichedMusic,
        });

        const taskID = saveObjectsResponse[0].taskID; // Access taskID from the first element of the array

        if (typeof taskID === 'undefined' || taskID === null) {
            console.error("Error: taskID was not returned by client.saveObjects. Check Algolia API response structure.");
            console.error("saveObjectsResponse:", JSON.stringify(saveObjectsResponse, null, 2));
            throw new Error("Algolia indexing task ID missing.");
        }

        console.log(`Indexing task ${taskID} submitted. Waiting for task to complete...`);
        await client.waitForTask({
            indexName: ALGOLIA_INDEX_NAME,
            taskID: taskID
        });

        console.log(`Successfully indexed music works to Algolia index: ${ALGOLIA_INDEX_NAME}`);
        console.log(`\nVerification: Go to your Algolia dashboard, navigate to the '${ALGOLIA_INDEX_NAME}' index, and inspect the records.`);
        console.log("Look for 'ai_description', 'ai_mood', 'ai_keywords', 'ai_semantic_tags', and 'ai_similar_works_description' attributes.");

    } catch (error) {
        console.error("Error during data enrichment or Algolia indexing:", error);
        if (error.status && error.message) {
            console.error(`Algolia API Error: Status ${error.status} - ${error.message}`);
        }
        if (error.details) {
            console.error("Algolia Error Details:", JSON.stringify(error.details, null, 2));
        }
    }
}

// Run the indexing process
indexEnrichedMusicData();