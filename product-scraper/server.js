import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

function normalizePrice(raw) {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,]/g, "").trim();
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts[parts.length - 1].length === 2) {
      s = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
    } else {
      s = s.replace(/,/g, "");
    }
  }

  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function extractPrice($) {
  const selectors = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    '[itemprop="price"]',
    ".a-price .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    ".a-price-whole",
    ".price",
    ".product-price",
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const val = el.attr("content") || el.text();
      const normalized = normalizePrice(val);
      if (normalized !== null) return normalized;
    }
  }
  return null;
}

function extractImage($, url) {
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) return ogImage;

  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  if (twitterImage) return twitterImage;

  const dynamicImg = $("#landingImage, #imgBlkFront").attr("data-a-dynamic-image");
  if (dynamicImg) {
    try {
      const parsed = JSON.parse(dynamicImg);
      const firstUrl = Object.keys(parsed)[0];
      if (firstUrl) return firstUrl;
    } catch (e) {}
  }

  const amazonImg = $("#landingImage, #imgBlkFront, .imgTagWrapper img").attr("src");
  if (amazonImg) return amazonImg;

  let fallback = null;
  $("img").each((_, el) => {
    if (fallback) return;
    const src = $(el).attr("src");
    const width = parseInt($(el).attr("width") || "0", 10);
    if (src && src.startsWith("http") && width > 200) fallback = src;
  });
  return fallback;
}

app.post("/api/fetch-product", async (req, res) => {
  const { url } = req.body;

  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: "رابط غير صالح" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      timeout: 10000,
    });

    if (!response.ok) {
      return res.status(502).json({ error: `الموقع رجع خطأ: ${response.status}` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text() ||
      "";

    const image = extractImage($, url) || "";

    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";

    const siteName =
      $('meta[property="og:site_name"]').attr("content") ||
      new URL(url).hostname.replace("www.", "");

    const price = extractPrice($);

    res.json({
      title: title.trim(),
      image,
      description: description.trim(),
      source: siteName,
      price,
      link: url,
    });
  } catch (err) {
    res.status(500).json({ error: "ما قدرناش نجيبو معلومات المنتج", details: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("Product scraper API is running. POST /api/fetch-product { url }");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
