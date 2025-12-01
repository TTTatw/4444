
import 'dotenv/config';

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
    console.log('Testing raw fetch to Google API...');
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Body:', text.substring(0, 200)); // Print first 200 chars
    } catch (error) {
        console.error('Fetch Failed:', error);
    }
}

test();
