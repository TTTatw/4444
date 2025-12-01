
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
    console.log('Checking IP via proxy...');
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        console.log('IP:', data.ip);

        // Also try to get location info if possible (optional)
        const geoRes = await fetch(`http://ip-api.com/json/${data.ip}`);
        const geo = await geoRes.json();
        console.log('Location:', geo.country, geo.regionName);

    } catch (error) {
        console.error('IP Check Failed:', error);
    }
}

test();
