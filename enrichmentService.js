require('dotenv').config(); 
const { GoogleGenAI } = require('@google/genai'); 
const fs = require('fs/promises');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is not set in your .env file.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL_NAME = "gemini-1.5-flash";

async function getGeminiEnrichment(work) {
    const prompt = `
    You are an expert in classical and choral music. Your task is to provide concise, structured metadata for a musical work.

    Given the following information about a classical music piece:
    Title: "${work.title}"
    Composer: "${work.composer}"
    Type: "${work.type || 'N/A'}"
    Attributes: "${(work.attributes && work.attributes.length > 0) ? work.attributes.join(', ') : 'N/A'}"
    Language: "${work.language || 'N/A'}"

    Please provide the following in JSON format:
    1.  **description**: A 1-2 sentence contextual description, including style period (e.g., Baroque, Romantic), typical performance context (e.g., sacred, secular, opera, chamber), and a unique characteristic.
    2.  **mood**: A single general mood or a short list of primary moods (e.g., "Joyful", "Solemn", "Dramatic", "Meditative").
    3.  **keywords**: 5-7 relevant keywords (e.g., "Cantata", "Oratorio", "Symphony", "Aria", "Choral", "Soloist", "Orchestral").
    4.  **semantic_tags**: 3-5 high-level semantic tags related to its meaning or common themes (e.g., "Resurrection", "Love", "Nature", "Devotion", "Celebration", "Tragedy"). If lyrics are available later, these would be based on them. For now, infer from title/composer/type.
    5.  **similar_works_description**: A brief description of what kind of works it is similar to, conceptually, if you can infer, without naming specific pieces yet (e.g., "Similar to other contrapuntal works of the Baroque era", "Resembles late Romantic orchestral pieces").

    Ensure the output is ONLY the JSON object. Do not include any other text or markdown outside the JSON.
    `;

    try {
        console.log(`Sending content for enrichment (ID: ${work.objectID}, Title: "${work.title}")...`);

        // *** CORRECTED generateContent call ***
        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        });

        // Check if candidates exist and have content parts (from your provided robust check)
        if (!result || !result.candidates || result.candidates.length === 0 ||
            !result.candidates[0].content || !result.candidates[0].content.parts ||
            result.candidates[0].content.parts.length === 0 ||
            !result.candidates[0].content.parts[0].text) {

            console.error(`Debug: Unexpected API response structure for ${work.objectID}:`, JSON.stringify(result, null, 2));
            if (result && result.promptFeedback && result.promptFeedback.safetyRatings) {
                console.error(`Debug: Prompt feedback safety ratings for ${work.objectID}:`, JSON.stringify(result.promptFeedback.safetyRatings, null, 2));
            }
            throw new Error("Gemini API did not return a valid text candidate.");
        }

        const text = result.candidates[0].content.parts[0].text;

        // Attempt to parse the JSON string from the model's response
        // Your robust JSON parsing logic is re-used here
        const cleanedText = text.replace(/^```json\n|\n```$/g, '').trim();

        const jsonStartIndex = cleanedText.indexOf('{');
        const jsonEndIndex = cleanedText.lastIndexOf('}');
        let jsonString = '';
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
            jsonString = cleanedText.substring(jsonStartIndex, jsonEndIndex + 1);
        } else {
            console.warn(`Debug: Could not find valid JSON boundaries in Gemini response for ${work.objectID}: "${cleanedText.substring(0, Math.min(cleanedText.length, 200))}..."`);
            throw new Error("Could not find valid JSON in Gemini response: " + cleanedText);
        }

        const parsedResult = JSON.parse(jsonString);

        console.log(`Enrichment successful for ID: ${work.objectID}`);
        return {
            // *** THE FIX IS HERE: Add 'ai_' prefix to these keys ***
            ai_description: parsedResult.description || null,
            ai_mood: Array.isArray(parsedResult.mood) ? parsedResult.mood : (parsedResult.mood ? [parsedResult.mood] : []),
            ai_keywords: Array.isArray(parsedResult.keywords) ? parsedResult.keywords : (parsedResult.keywords ? parsedResult.keywords.split(',').map(k => k.trim()) : []),
            ai_semantic_tags: Array.isArray(parsedResult.semantic_tags) ? parsedResult.semantic_tags : (parsedResult.semantic_tags ? parsedResult.semantic_tags.split(',').map(k => k.trim()) : []),
            ai_similar_works_description: parsedResult.similar_works_description || null
        };
    } catch (error) {
        console.error(`Error enriching work '${work.title}' (ID: ${work.objectID}):`, error.message);
        // This fallback also needs to use the 'ai_' prefixes
        return {
            ai_description: "AI enrichment failed.",
            ai_mood: [],
            ai_keywords: [],
            ai_semantic_tags: [],
            ai_similar_works_description: "AI analysis unavailable."
        };
    }
}

// The processMusicData function remains the same, just changed module.exports
async function processMusicData(inputFilePath) {
    console.log("Starting AI enrichment process...");
    let rawMusicData = [];
    try {
        const data = await fs.readFile(inputFilePath, 'utf8');
        rawMusicData = JSON.parse(data);
        console.log(`Loaded ${rawMusicData.length} works from ${inputFilePath}`);
    } catch (error) {
        console.error(`Error reading or parsing ${inputFilePath}:`, error.message);
        return [];
    }

    const enrichedMusicData = [];
    for (const work of rawMusicData) {
        // Already logging in getGeminiEnrichment
        const aiData = await getGeminiEnrichment(work);

        // Merge AI data with original work data
        const enrichedWork = {
            ...work,
            ai_description: aiData.ai_description,
            ai_mood: aiData.ai_mood,
            ai_keywords: aiData.ai_keywords,
            ai_semantic_tags: aiData.ai_semantic_tags,
            ai_similar_works_description: aiData.ai_similar_works_description,
        };
        enrichedMusicData.push(enrichedWork);
        // Already logging in getGeminiEnrichment
        // console.log(`Enrichment successful for ID: ${work.objectID}`);

        // Optional: Add a small delay to avoid hitting rate limits too quickly for Gemini
        await new Promise(resolve => setTimeout(resolve, 500)); 
    }

    console.log("AI enrichment complete.");
    return enrichedMusicData;
}

module.exports = {
    processMusicData
};