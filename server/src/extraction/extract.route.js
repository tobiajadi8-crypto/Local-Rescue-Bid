// POST /api/extract  ->  { requirements, sources, issues }
const { Router } = require("express");
const { z } = require("zod");
const { generateExtraction } = require("./watsonx.js");
const { parseModelJson, normalizeExtraction } = require("./normalize.js");

const router = Router();
const RequestSchema = z.object({ packet_text: z.string().trim().min(1).max(50_000) });

router.post("/api/extract", async (req, res) => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Body must be { packet_text: string }" });
  }
  const { packet_text } = parsed.data;

  try {
    const modelText = await generateExtraction(packet_text);
    const raw = parseModelJson(modelText);
    const result = normalizeExtraction(raw, packet_text);
    return res.json(result);
  } catch (err) {
    console.error("[extract]", err instanceof Error ? err.message : "Unknown error");
    return res.status(502).json({ error: "Extraction failed" });
  }
});

module.exports = router;
