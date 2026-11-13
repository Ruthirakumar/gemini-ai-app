import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
for (const model of [env.GEMINI_MODEL, "gemini-flash-latest"]) {
  for (let i = 1; i <= 3; i++) {
    const t = Date.now();
    try { const r = await ai.models.generateContent({ model, contents: "Reply with OK" }); console.log(model, i, "OK", (r.text||"").trim(), Date.now()-t+"ms"); }
    catch (e) { console.log(model, i, "ERR", e.status, String(e.message).slice(0, 220)); }
  }
}
