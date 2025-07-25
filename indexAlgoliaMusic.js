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

// Initialize Algolia client (this should now correctly get the function)
const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);


async function indexEnrichedMusicData() {
    console.log(`Starting data enrichment and indexing to Algolia index: ${ALGOLIA_INDEX_NAME}`);
    try {
        // --- Set Index Settings for Vector Search (v5 syntax) ---
        console.log(`Configuring Algolia index '${ALGOLIA_INDEX_NAME}' for vector search...`);
        await client.setSettings({ // Call setSettings directly on the client
             indexName: ALGOLIA_INDEX_NAME, // Specify the index name
             
             indexSettings: { // Your settings object goes inside 'settings'
                searchableAttributes: [
                    'title',
                    'composer',
                    'type',
                    'ai_description',
                    'ai_mood',
                    'ai_keywords',
                    'ai_semantic_tags',
                    'ai_similar_works_description',
                    'unordered(ai_description)'
                ],
             }
        });
        console.log("Index settings updated successfully for vector search.");
        // --- END Settings ---


        const rawMusicFilePath = './data/music_metadata.json';
        const enrichedMusic = await processMusicData(rawMusicFilePath);

        if (enrichedMusic.length === 0) {
            console.warn("No music works were enriched. Nothing to index.");
            return;
        }

        console.log(`Successfully enriched ${enrichedMusic.length} music works. Now indexing to Algolia...`);

        // *** Save Objects (v5 syntax) ***
        const saveObjectsResponse = await client.saveObjects({
            indexName: ALGOLIA_INDEX_NAME, // Specify the index name
            objects: enrichedMusic,
            autoGenerateObjectIDIfNotExist: false
        });

        // TaskID is directly on the response object in v5
        //const taskID = saveObjectsResponse.taskID;
        const taskID = saveObjectsResponse[0] ? saveObjectsResponse[0].taskID : undefined;


        if (typeof taskID === 'undefined' || taskID === null) {
            console.error("Error: taskID was not returned by client.saveObjects. Check Algolia API response structure.");
            console.error("saveObjectsResponse:", JSON.stringify(saveObjectsResponse, null, 2));
            throw new Error("Algolia indexing task ID missing.");
        }

        console.log(`Indexing task ${taskID} submitted. Waiting for task to complete...`);
        // *** Wait for Task (v5 syntax) ***
        await client.waitForTask({
            indexName: ALGOLIA_INDEX_NAME, // Specify the index name
            taskID: taskID
        });

        console.log(`Successfully indexed music works to Algolia index: ${ALGOLIA_INDEX_NAME}`);
        console.log(`\nVerification: Go to your Algolia dashboard, navigate to the '${ALGOLIA_INDEX_NAME}' index, and inspect the records.`);
        console.log("Look for 'ai_description_embedding' attribute (it will be a long array of numbers).");
        console.log("Also verify 'ai_description', 'ai_mood', 'ai_keywords', 'ai_semantic_tags', and 'ai_similar_works_description' attributes are populated.");


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