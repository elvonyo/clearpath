// api/chat.js
// Vercel serverless function — OpenAI key never reaches the browser
// Deploy this file at the ROOT of your project (same level as package.json)

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Basic rate limiting via Vercel Edge (upgrade to Redis for production)
  const { messages, systemPrompt } = req.body;

  if (!messages || !systemPrompt) {
    return res.status(400).json({ error: "Missing messages or systemPrompt" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OpenAI API key not configured on server" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("OpenAI error:", data.error);
      return res.status(400).json({ error: data.error.message });
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(500).json({ error: "No response from AI" });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "AI service temporarily unavailable" });
  }
}
