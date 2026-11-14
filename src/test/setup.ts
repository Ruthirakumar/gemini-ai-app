// Imported first by every test file. Modules that create the Gemini client
// need an API key to load; tests never call Gemini.
process.env.GEMINI_API_KEY ||= "test-key-not-used";
process.env.PRACTICE_TOKEN_SECRET ||= "test-practice-secret";
