import dotenv from 'dotenv';
dotenv.config();
const key = process.env.GEMINI_API_KEY;

async function checkModels() {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
  for (const m of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
      });
      const data = await res.json();
      if (data.error) {
        console.log(`${m}: ERROR ${data.error.code} - ${data.error.message.slice(0, 100)}`);
      } else {
        console.log(`${m}: SUCCESS!`);
      }
    } catch (e) {
      console.log(`${m}: ${e.message}`);
    }
  }
}
checkModels();
