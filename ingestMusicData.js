require('dotenv').config();
const { MusicBrainzApi } = require('musicbrainz-api'); 
const fs = require('fs/promises'); 

const MUSICBRAINZ_USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT;

if (!MUSICBRAINZ_USER_AGENT || MUSICBRAINZ_USER_AGENT === "ClassicalMusicAIEnrichmentApp/1.0.0 (your-email@example.com)") {
    console.error("ERROR: Please update MUSICBRAINZ_USER_AGENT in your .env file with your application name and email.");
    process.exit(1);
}

// Parse user agent string for MusicBrainzApi constructor
const [appNameAndVersion, contactInfoRaw] = MUSICBRAINZ_USER_AGENT.split(' ');
const [appName, appVersion] = appNameAndVersion.split('/');
const appContactInfo = contactInfoRaw ? contactInfoRaw.substring(1, contactInfoRaw.length - 1) : 'jonamarkin@gmail.com';

const mbApi = new MusicBrainzApi({ // Corrected variable name and constructor
    appName: appName || 'my-app',
    appVersion: appVersion || '1.0.0',
    appContactInfo: appContactInfo
    // MusicBrainz API has rate limits, be mindful for larger fetches
    // You might need to add delays or pagination for large datasets
});

async function fetchComposerWorks(composerName, limit = 10) {
    console.log(`Fetching works by composer: ${composerName}...`);
    try {
        // First, search for the composer to get their MBID (MusicBrainz ID)
        const artistResult = await mbApi.search('artist', { query: composerName }); 
        const composer = artistResult.artists.find(a => a.name === composerName && a['type'] === 'Person');

        if (!composer) {
            console.error(`Composer '${composerName}' not found on MusicBrainz or no exact match found.`);
            // Log the artistResult to see what came back
            console.error("Artist search result:", JSON.stringify(artistResult, null, 2));
            return [];
        }

        console.log(`Found composer: ${composer.name} (MBID: ${composer.id})`);

        // Now, fetch works by that composer using their MBID
        const worksResult = await mbApi.lookup('artist', composer.id, ['works']);

        // Apply limit manually if worksResult.works is too large
        const worksToProcess = limit > 0 ? worksResult.works.slice(0, limit) : worksResult.works;


        if (!worksToProcess || worksToProcess.length === 0) { // Check worksToProcess
            console.warn(`No works found for ${composer.name}.`);
            return [];
        }

        const formattedWorks = worksToProcess.map((work, index) => ({ // Map worksToProcess
            objectID: `music_${work.id || Date.now() + '_' + index}`,
            mbid: work.id,
            title: work.title,
            type: work.type,
            iswcs: work.iswcs || [],
            attributes: work.attributes || [],
            language: work.language,
            composer: composer.name,
            composer_mbid: composer.id,
            lyrics: null,
            score_url: null,
            audio_sample_url: null,
        }));

        console.log(`Successfully fetched ${formattedWorks.length} works for ${composer.name}.`);
        return formattedWorks;

    } catch (error) {
        console.error(`Error fetching works for ${composerName}:`, error.message);
        return [];
    }
}

async function main() {
    const composerToFetch = "Johann Sebastian Bach";
    const numWorksToFetch = 5;

    const musicData = await fetchComposerWorks(composerToFetch, numWorksToFetch);

    if (musicData.length > 0) {
        const outputPath = './data/music_metadata.json';
        await fs.writeFile(outputPath, JSON.stringify(musicData, null, 2), 'utf8');
        console.log(`\nSuccessfully saved ${musicData.length} works to ${outputPath}`);
        console.log("Sample Data:", musicData[0]); // Log the first item for review
    } else {
        console.log("No data fetched to save.");
    }
}

main();