// index.js

const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// -------------------------
// LINE & Supabase Config
// -------------------------
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(express.json());

// ตัว client ที่เอาไว้ใช้ push / reply หา LINE
const client = new line.Client(config);

// -------------------------
// Webhook หลักจาก LINE
// -------------------------
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.json({ status: "ok" }))
    .catch((err) => {
      console.error("webhook error:", err);
      res.status(500).end();
    });
});

// ฟังก์ชันจัดการ event จาก LINE
async function handleEvent(event) {
  // log source ไว้เอา groupId / userId ใช้
  console.log("Source:", JSON.stringify(event.source, null, 2));

  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const text = (event.message.text || "").trim();

  // คำสั่ง test ง่าย ๆ
  if (text === "/ping") {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "pong!",
    });
  }

  // อื่น ๆ ตอนนี้ตอบกลับเฉย ๆ
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: `รับข้อความแล้ว: ${text}`,
  });
}

// -------------------------
// Routes ทดสอบ + cron
// -------------------------

// route root ไว้เช็คว่า service รันอยู่ไหม
app.get("/", (req, res) => {
  res.send("LINE bot is running");
});

// ยิงเองจาก browser / cron service เพื่อส่งข้อความเข้า group ตอนเช้า
app.get("/cron/morning", async (req, res) => {
  try {
    await client.pushMessage(process.env.LINE_GROUP_ID, {
      type: "text",
      text: "ทดสอบ /cron/morning: บอทส่งข้อความเข้ากลุ่มได้แล้ว ✅",
    });
    res.send("ok");
  } catch (err) {
    console.error("cron/morning error:", err.response?.data || err.message || err);
    res.status(500).send("error");
  }
});

// ยิงสรุป (ตอนนี้ยังเป็นข้อความ dummy ไว้ทดสอบเฉย ๆ)
app.get("/cron/summary", async (req, res) => {
  try {
    await client.pushMessage(process.env.LINE_GROUP_ID, {
      type: "text",
      text: "ทดสอบ /cron/summary: สรุปการมาเรียน (dummy) ✅",
    });
    res.send("ok");
  } catch (err) {
    console.error("cron/summary error:", err.response?.data || err.message || err);
    res.status(500).send("error");
  }
});

// -------------------------
// Start server
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("LINE bot running on port", PORT);
});