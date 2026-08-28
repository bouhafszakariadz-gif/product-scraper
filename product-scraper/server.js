import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------
// هاد الخدمة تاخد رابط منتج، تجيب صفحة الويب تاعو، وتستخرج منها:
// العنوان، الصورة، الوصف، ومحاولة استخراج السعر.
// تخدم بطريقة آمنة عن طريق قراءة Open Graph meta tags، اللي
// غالبية المواقع الكبيرة (Amazon, Shein, AliExpress...) تحطها
// فالصفحة باش تبان مليحة كي تتشارك فـ Facebook/WhatsApp.
// ---------------------------------------------------------------

function extractPrice($) {
  // نجربو بزاف بحال باش نلقاو السعر، مواقع مختلفة تحط السعر بطرق مختلفة
  const selectors = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    '[itemprop="price"]',
    ".a-price .a-offscreen", // Amazon
    ".price",
    ".product-price",
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const val = el.attr("content") || el.text();
      const match = val && val.replace(/\s/g, "").match(/[\d.,]+/);
      if (match) return match[0].replace(/,/g, "");
    }
  }
  return null;
}

app.post("/api/fetch-product", async (req, res) => {
  const { url } = req.body;

  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: "رابط غير صالح" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        // نتصرفو كمتصفح عادي باش الموقع يرجعلنا الصفحة الكاملة
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

    const image =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      "";

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
