// ============================================================
//  ELEVATE — server.js
//  Node.js + Express backend proxy
//  Hides your Gemini API key from the frontend
//  Model: Gemini 2.0 Flash (free tier)
//  Deploy: Render.com (same as FIT GPT)
// ============================================================

const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Serve index.html as static frontend (root folder)
app.use(express.static(__dirname));

// ── Valid Options Matrix ──────────────────────────────────────
const VALID_OPTIONS = [
  "A1 English", "A2 English", "B1 English",
  "B2 English", "C1 English", "C2 English",
  "Hindi", "Bengali", "Marathi", "Telugu", "Tamil",
  "Gujarati", "Urdu", "Kannada", "Odia", "Malayalam",
  "Punjabi", "Sanskrit", "Assamese", "Maithili", "Santali",
  "Kashmiri", "Nepali", "Konkani", "Sindhi", "Dogri",
  "Manipuri", "Bodo"
];

// ── CEFR Level Descriptions ───────────────────────────────────
const CEFR_GUIDE = {
  "A1 English": "very simple words, short sentences, basic present tense only",
  "A2 English": "simple sentences, common everyday vocabulary, basic past/future tense",
  "B1 English": "clear standard language, some complex sentences, everyday topics",
  "B2 English": "fluent and natural, range of vocabulary, abstract topics handled well",
  "C1 English": "flexible and effective, nuanced vocabulary, complex structures",
  "C2 English": "near-native mastery, precise, sophisticated, idiomatic, eloquent"
};

// ── System Prompt ─────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are the Core AI Logic Engine for ELEVATE — a professional translation application.

SUPPORTED MATRIX: 6 English CEFR levels (A1–C2) + 22 Official Indian Languages.

CEFR GUIDE:
- A1 English → very simple words, short sentences, basic present tense only
- A2 English → simple sentences, common everyday vocabulary
- B1 English → clear standard language, some complex sentences, everyday topics
- B2 English → fluent and natural, range of vocabulary, abstract topics
- C1 English → flexible, nuanced vocabulary, complex structures
- C2 English → near-native mastery, precise, sophisticated, idiomatic, eloquent

STRICT RULES:
1. Translate exact meaning — never add or omit ideas
2. Match vocabulary and grammar precisely to target level/language
3. For Indian languages: natural, fluent, native-speaker text in correct script
4. Preserve the original tone (formal, casual, urgent, emotional)
5. Respond in EXACTLY this format — nothing else:

Translated Output: [translated text]

Analysis: [one sentence explanation]`;
}

// ── User Prompt Builder ───────────────────────────────────────
function buildUserPrompt(inputText, inputLang, outputLang) {
  const cefrHint = CEFR_GUIDE[outputLang]
    ? `\nCEFR Target Guidance: ${outputLang} means → ${CEFR_GUIDE[outputLang]}`
    : "";

  return `Input Text: "${inputText}"
Input Language/Level: ${inputLang}
Output Language/Level: ${outputLang}${cefrHint}

Translate strictly following your core rules.`;
}

// ── Response Parser ───────────────────────────────────────────
function parseResponse(rawText) {
  const outputMatch = rawText.match(/Translated Output:\s*(.+?)(?=\n\nAnalysis:|$)/s);
  const analysisMatch = rawText.match(/Analysis:\s*(.+)/s);
  return {
    translated_output: outputMatch ? outputMatch[1].trim() : rawText.trim(),
    analysis: analysisMatch ? analysisMatch[1].trim() : ""
  };
}

// ── POST /api/translate ───────────────────────────────────────
app.post("/api/translate", async (req, res) => {
  const { input_text, input_language, output_language } = req.body;

  // Validation
  if (!input_text || !input_language || !output_language) {
    return res.status(400).json({ success: false, error: "Missing required fields." });
  }
  if (!VALID_OPTIONS.includes(input_language)) {
    return res.status(400).json({ success: false, error: `'${input_language}' is not supported.` });
  }
  if (!VALID_OPTIONS.includes(output_language)) {
    return res.status(400).json({ success: false, error: `'${output_language}' is not supported.` });
  }

  try {
    // Call Gemini API (free tier — Gemini 2.5 Flash)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildSystemPrompt() }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: buildUserPrompt(input_text, input_language, output_language) }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 1024
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "API call failed");
    }

    const rawText = data.candidates[0].content.parts[0].text;
    const parsed = parseResponse(rawText);

    return res.json({
      success: true,
      input_text,
      input_language,
      output_language,
      translated_output: parsed.translated_output,
      analysis: parsed.analysis,
      model_used: "gemini-2.5-flash"
    });

  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ success: false, error: "Translation failed. Try again." });
  }
});

// ── GET /api/matrix — for frontend dropdowns ──────────────────
app.get("/api/matrix", (req, res) => {
  res.json({
    english_levels: ["A1 English", "A2 English", "B1 English", "B2 English", "C1 English", "C2 English"],
    indian_languages: [
      "Hindi", "Bengali", "Marathi", "Telugu", "Tamil", "Gujarati", "Urdu",
      "Kannada", "Odia", "Malayalam", "Punjabi", "Sanskrit", "Assamese",
      "Maithili", "Santali", "Kashmiri", "Nepali", "Konkani", "Sindhi",
      "Dogri", "Manipuri", "Bodo"
    ],
    total_pairs: 784
  });
});

// ── Health Check ──────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "Elevate API" });
});

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✦ Elevate API running on port ${PORT}`);
});
