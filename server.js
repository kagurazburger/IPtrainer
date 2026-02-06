const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname)));

const BAIDU_API_KEY = process.env.BAIDU_API_KEY || "YOUR_BAIDU_API_KEY";
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || "YOUR_BAIDU_SECRET_KEY";
const ARK_API_KEY = process.env.ARK_API_KEY || "YOUR_ARK_API_KEY";
const ARK_MODEL = process.env.ARK_MODEL || "glm-4-7-251222";
const ARK_ENDPOINT = process.env.ARK_ENDPOINT || "https://ark.cn-beijing.volces.com/api/v3/responses";

const LLM_BACKEND = process.env.LLM_BACKEND || "doubao_ark";
const DOUBAO_ARK_API_BASE = process.env.DOUBAO_ARK_API_BASE || "https://ark.cn-beijing.volces.com/api/v3";
const DOUBAO_ARK_API_KEY = process.env.DOUBAO_ARK_API_KEY || ARK_API_KEY;
const DOUBAO_ARK_MODEL = process.env.DOUBAO_ARK_MODEL || ARK_MODEL;

const BAIDU_OCR_ENDPOINT = "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic";
const BAIDU_TOKEN_ENDPOINT = "https://aip.baidubce.com/oauth/2.0/token";

const tokenCache = {
  value: null,
  expiresAt: 0,
};

const isPlaceholder = (value) => !value || value.startsWith("YOUR_");

const normalizeBase64 = (image) => {
  if (!image) return "";
  if (image.startsWith("data:")) {
    return image.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
  }
  return image;
};

const getAccessToken = async () => {
  const now = Date.now();
  if (tokenCache.value && tokenCache.expiresAt > now + 60 * 1000) {
    return tokenCache.value;
  }

  if (isPlaceholder(BAIDU_API_KEY) || isPlaceholder(BAIDU_SECRET_KEY)) {
    throw new Error("Baidu OCR credentials missing");
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: BAIDU_API_KEY,
    client_secret: BAIDU_SECRET_KEY,
  });

  const response = await fetch(`${BAIDU_TOKEN_ENDPOINT}?${params.toString()}`);
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Failed to get Baidu access token");
  }

  tokenCache.value = data.access_token;
  tokenCache.expiresAt = now + (data.expires_in || 0) * 1000;
  return tokenCache.value;
};

const runBaiduOCR = async ({ image }) => {
  const token = await getAccessToken();
  const payload = new URLSearchParams({
    image,
    detect_direction: "false",
    paragraph: "false",
    probability: "false",
    multidirectional_recognize: "false",
  });

  const response = await fetch(`${BAIDU_OCR_ENDPOINT}?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
  });

  const data = await response.json();
  if (!data.words_result) {
    return [];
  }
  return data.words_result.map((item) => item.words).filter(Boolean);
};

const extractTextFromArk = (data) => {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text;
  if (Array.isArray(data.output) && data.output.length) {
    const content = data.output[0].content || [];
    return content
      .map((item) => item.text || "")
      .filter(Boolean)
      .join("");
  }
  if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  if (data.message?.content) return data.message.content;
  return "";
};

const extractJson = (text) => {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    return null;
  }
};

const buildFallbackCards = (ocrText, count) => {
  const words = (ocrText || "").split(/\r?\n/).filter(Boolean);
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    const name = words[i] || `角色 ${i + 1}`;
    const hint = words[i + 1] || "待补充";
    cards.push({
      name,
      description: `关键词：${hint}`,
    });
  }
  return cards;
};

const getLlmConfig = () => {
  if (LLM_BACKEND !== "doubao_ark") {
    return null;
  }

  return {
    apiKey: DOUBAO_ARK_API_KEY,
    model: DOUBAO_ARK_MODEL,
    endpoint: ARK_ENDPOINT || `${DOUBAO_ARK_API_BASE}/responses`,
  };
};

const callArkLLM = async ({ ocrText, mode, count }) => {
  const config = getLlmConfig();
  if (!config || isPlaceholder(config.apiKey)) {
    return null;
  }

  const prompt = `你是潮玩角色卡片助手。\n请根据 OCR 文本提取 ${count} 个角色卡片。\n要求：\n1) 如果是多角色海报，输出多个角色；如果是单角色，输出一个角色。\n2) 角色名称尽量简短；简介 1-2 句。\n3) 只输出 JSON，格式为 {"cards":[{"name":"","description":""}] }。\n\nOCR 文本：\n${ocrText || "(无)"}`;

  const body = {
    model: config.model,
    stream: false,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }],
      },
    ],
  };

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  const text = extractTextFromArk(data);
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.cards)) {
    return null;
  }
  return parsed.cards;
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/parse-image", async (req, res) => {
  try {
    const { image, mode, count } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: "Missing image" });
    }

    const base64 = normalizeBase64(image);
    const ocrWords = await runBaiduOCR({ image: base64 });
    const ocrText = ocrWords.join("\n");

    const targetCount = Number.isFinite(count) ? Math.max(1, count) : 3;
    const cards =
      (await callArkLLM({ ocrText, mode, count: targetCount })) ||
      buildFallbackCards(ocrText, targetCount);

    return res.json({
      ocrText: ocrText || "未识别到文本",
      cards,
    });
  } catch (error) {
    return res.status(500).json({
      error: "AI processing failed",
      message: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI proxy running on http://localhost:${PORT}`);
});
