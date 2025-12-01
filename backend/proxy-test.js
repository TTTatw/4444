
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

// Force Proxy
const PROXY_URL = 'http://127.0.0.1:7897';
process.env.HTTPS_PROXY = PROXY_URL;
process.env.HTTP_PROXY = PROXY_URL;

// Try Undici
try {
    const { setGlobalDispatcher, ProxyAgent } = await import('undici');
    if (ProxyAgent) {
        const dispatcher = new ProxyAgent(PROXY_URL);
        setGlobalDispatcher(dispatcher);
        console.log(`Global Proxy Agent set to ${PROXY_URL}`);
    }
} catch (e) {
    console.log('Undici setup skipped:', e.message);
}

async function test() {
    console.log('Testing connection to Google GenAI...');
    console.log('API Key present:', !!process.env.GEMINI_API_KEY);

    try {
        const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        console.log('Listing models...');
        const response = await client.models.list();
        console.log('Models found:', response.models?.length);
        if (response.models?.length > 0) {
            console.log('First model:', response.models[0].name);
        }

    } catch (error) {
        console.error('Test Failed:', error);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            // error.response.text() might be a function or property depending on SDK version
            try {
                const text = typeof error.response.text === 'function' ? await error.response.text() : error.response.text;
                console.error('Response Body:', text);
            } catch (e) {
                console.error('Could not read response body');
            }
        }
    }
}

test();
