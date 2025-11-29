import { GoogleGenAI } from '@google/genai';

const client = new GoogleGenAI({ apiKey: 'test' });
console.log('Client keys:', Object.keys(client));
if (client.models) {
    console.log('client.models exists');
} else {
    console.log('client.models MISSING');
}
