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
  console.log("event:", JSON.stringify(event, null, 2));

  // รับเฉพาะข้อความก่อน
  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const text = event.message.text.trim();

  // กดปุ่ม "แจ้งลา"
  if (text === "แจ้งลา") {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "พิมพ์แบบนี้ในห้องเลยนะ\n\nลา: ชื่อ-สกุล / สาเหตุ\nเช่น\nลา: วิชญะ คุ้มฉัยยา / ป่วยมีไข้"
    });
  }

  // กดปุ่ม "แจ้งเข้าสาย"
  if (text === "แจ้งเข้าสาย") {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "พิมพ์แบบนี้ในห้องเลยนะ\n\nสาย: ชื่อ-สกุล / สาเหตุ\nเช่น\nสาย: วิชญะ คุ้มฉัยยา / รถติด"
    });
  }

  // ถ้าเป็นข้อความอื่นๆ (ตอนนี้ยังไม่ทำอะไร)
  return Promise.resolve(null);
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
    const flex = {
      type: "flex",
      altText: "เช็คชื่อเช้านี้",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "เช็คชื่อเช้านี้ 📝",
              weight: "bold",
              size: "lg"
            },
            {
              type: "text",
              text: "ถ้าจะลา หรือจะมาสาย ให้กดปุ่มด้านล่าง",
              wrap: true,
              size: "sm",
              margin: "md"
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#22c55e",
              action: {
                type: "message",      // ✅ ให้ส่งข้อความแทน postback
                label: "แจ้งลา",
                text: "แจ้งลา"        // ข้อความที่บอทจะได้รับ
              }
            },
            {
              type: "button",
              style: "secondary",
              action: {
                type: "message",
                label: "แจ้งเข้าสาย",
                text: "แจ้งเข้าสาย"
              }
            }
          ],
          flex: 0
        }
      }
    };

    await client.pushMessage(process.env.LINE_GROUP_ID, flex);
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