const axios = require('axios');

// The model is env-configurable; this default is a real, currently-served model.
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Service to handle Google Gemini AI API requests (v1beta generateContent).
 * Reads GEMINI_API_KEY and GEMINI_MODEL from environment variables.
 * Returns null on any failure so callers can fall back gracefully.
 */
async function callGemini(systemPrompt, userPrompt) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    const model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();

    if (!apiKey || apiKey === 'helloworld' || apiKey.includes('your_')) {
        console.warn('[Gemini Service] GEMINI_API_KEY is not configured or using placeholder. Skipping Gemini call.');
        return null;
    }

    // Key goes in a header, never in the URL, so it can't leak through error logs
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [{ text: userPrompt }]
            }
        ]
    };

    if (systemPrompt && systemPrompt.trim().length > 0) {
        requestBody.system_instruction = {
            parts: [{ text: systemPrompt.trim() }]
        };
    }

    try {
        const response = await axios.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            timeout: 10000 // 10s timeout
        });

        if (response.data && response.data.candidates && response.data.candidates.length > 0) {
            const candidate = response.data.candidates[0];
            const parts = candidate.content?.parts;
            if (parts && parts.length > 0 && parts[0].text) {
                return parts[0].text.trim();
            }
        }
        return null;
    } catch (geminiError) {
        // Log Gemini errors separately with full details
        const errorDetail = geminiError.response?.data?.error?.message || geminiError.message;
        const statusCode = geminiError.response?.status || 'UNKNOWN';
        console.error(`[Gemini Error] (Status ${statusCode}): ${errorDetail}`);
        // Return null so the route falls back gracefully to deterministic financial data
        return null;
    }
}

module.exports = {
    callGemini
};
