
import 'dotenv/config';

function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
}

// Polyfill atob for Node
function atob(str) {
    return Buffer.from(str, 'base64').toString('binary');
}

const key = process.env.SUPABASE_SERVICE_ROLE;
console.log('Checking SUPABASE_SERVICE_ROLE...');

if (!key) {
    console.log('Key is missing!');
} else {
    const payload = parseJwt(key);
    if (payload) {
        console.log('Role:', payload.role);
        if (payload.role === 'service_role') {
            console.log('✅ Key is a Service Role key.');
        } else {
            console.log('❌ Key is NOT a Service Role key. It is:', payload.role);
        }
    } else {
        console.log('❌ Invalid JWT format.');
    }
}
