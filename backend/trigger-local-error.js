
import 'dotenv/config';

async function test() {
    console.log('Calling local backend...');
    // Need a valid token? The backend has authGuard.
    // We need to bypass auth or get a token.
    // Wait, I can't easily get a token without login.
    // But I can temporarily disable authGuard in index.js for debugging? 
    // OR, I can use the supabaseAdmin to generate a token? No, that's hard.
    // Let's try to hit the health check first to ensure server is up.

    try {
        const health = await fetch('http://localhost:3000/health');
        console.log('Health:', await health.json());
    } catch (e) {
        console.error('Health check failed:', e.message);
    }

    // To test /api/generate, we need a token.
    // If I can't get a token, I'll rely on the backend logs.
    // But the user is getting 500, so they HAVE a token.
}

test();
