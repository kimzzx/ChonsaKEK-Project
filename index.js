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

async function sendMorningPromptToGroup() {
  const groupId = process.env.LINE_GROUP_ID;
  if (!groupId) {
    console.error("LINE_GROUP_ID is not set");
    return;
  }

  const message = {
    type: "flex",
    altText: "เช็คชื่อเช้านี้ (แจ้งลา / แจ้งเข้าสาย)",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "เช็คชื่อเช้านี้ 📝",
            weight: "bold",
            size: "lg"
          },
          {
            type: "text",
            text: "ถ้าจะลา หรือจะเข้าสาย กดปุ่มด้านล่างนี้ได้เลยนะ",
            wrap: true,
            size: "sm",
            color: "#666666"
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "lg",
            contents: [
              {
                type: "button",
                style: "primary",
                height: "sm",
                action: {
                  type: "postback",
                  label: "📝 แจ้งลา",
                  data: "action=leave_today"
                }
              },
              {
                type: "button",
                style: "secondary",
                height: "sm",
                action: {
                  type: "postback",
                  label: "⏰ แจ้งเข้าสาย",
                  data: "action=late_today"
                }
              }
            ]
          }
        ]
      }
    }
  };

  try {
    await client.pushMessage(groupId, message);
    console.log("Sent morning prompt to group", groupId);
  } catch (err) {
    console.error("sendMorningPromptToGroup error:", err);
  }
}

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

  async function handleEvent(event) {
  // log source ไว้ดู groupId / userId เวลา debug
  console.log("Source:", JSON.stringify(event.source));

  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const text = event.message.text.trim();

  // ถ้ากดปุ่ม "แจ้งลา"
  if (text === "แจ้งลา") {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text:
        "แบบฟอร์มแจ้งลา 🙏\n" +
        "พิมพ์ตามนี้เลยนะ:\n" +
        "ลา: ชื่อ-นามสกุล / ห้อง / เหตุผล / วันที่ที่ลา"
    });
  }

  // ถ้ากดปุ่ม "แจ้งเข้าสาย"
  if (text === "แจ้งเข้าสาย") {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text:
        "แบบฟอร์มแจ้งเข้าสาย ⏰\n" +
        "พิมพ์ตามนี้เลยนะ:\n" +
        "เข้าสาย: ชื่อ-นามสกุล / ห้อง / เหตุผล / เวลาที่จะมาถึง"
    });
  }

  // ตรงนี้เดี๋ยวไว้ทีหลังจะเพิ่ม logic แยกข้อความที่ขึ้นต้นด้วย "ลา:" / "เข้าสาย:" แล้ว insert เข้า Supabase
  return Promise.resolve(null);
}

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
    await sendMorningPromptToGroup();
    res.send("ok");
  } catch (err) {
    console.error("cron/morning error:", err);
    res.status(500).send("error");
  }
});

async function handlePostback(event) {
  const data = event.postback.data;
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // ... หา student จาก line_links ตาม userId ...

  if (action === "leave_today") {
    // บันทึก leave_requests ...
    return replyText(replyToken, `บันทึกว่า ... ลาวันนี้แล้ว`);
  }

  if (action === "late_today") {
    // บันทึก leave_requests ...
    return replyText(replyToken, `บันทึกว่า ... แจ้งเข้าสายแล้ว`);
  }
}

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