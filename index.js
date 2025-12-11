// index.js

const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// -------------------------
// CONFIG
// -------------------------
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// สร้าง express app ก่อน แล้วค่อยใช้
const app = express();
app.use(express.json());

const client = new line.Client(config);

// -------------------------
// helper
// -------------------------
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: "text",
    text,
  });
}

// -------------------------
// WEBHOOK (ให้ Verify ผ่านก่อน)
// -------------------------
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    console.log("Webhook body:", JSON.stringify(req.body, null, 2));
    // ตอนนี้ยังไม่ได้ทำ logic อะไรพิเศษ แค่ตอบ 200 ให้ LINE พอ
    return res.json({ status: "ok" });
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(500).end();
  }
});

// -------------------------
// LIFF FORM PAGE  /leave
// -------------------------
app.get("/leave", (req, res) => {
  const type = req.query.type === "late" ? "late" : "leave"; // default leave
  const liffId = process.env.LIFF_LEAVE_ID || "";

  res.send(`
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>แบบฟอร์มลา / แจ้งเข้าสาย</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: system-ui, sans-serif;
      margin: 0;
      padding: 0;
      background: #0f172a;
      color: #e5e7eb;
      display: flex;
      justify-content: center;
    }
    .card {
      max-width: 420px;
      width: 100%;
      padding: 24px 20px 32px;
      margin: 16px;
      background: linear-gradient(145deg, #020617, #0b1120);
      border-radius: 18px;
      box-shadow: 0 14px 40px rgba(15,23,42,0.8);
      border: 1px solid rgba(148,163,184,0.3);
    }
    h1 {
      margin-top: 0;
      font-size: 1.3rem;
      margin-bottom: 4px;
    }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(52,211,153,0.1);
      color: #6ee7b7;
      border: 1px solid rgba(45,212,191,0.5);
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 0.85rem;
      margin-bottom: 4px;
      color: #cbd5f5;
    }
    input, textarea, select {
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(148,163,184,0.5);
      background: rgba(15,23,42,0.9);
      color: #e5e7eb;
      font-size: 0.9rem;
      outline: none;
      box-sizing: border-box;
    }
    textarea {
      min-height: 90px;
      resize: vertical;
    }
    .field {
      margin-bottom: 14px;
    }
    button {
      width: 100%;
      padding: 11px 14px;
      border-radius: 999px;
      border: none;
      font-size: 0.98rem;
      font-weight: 600;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      color: #022c22;
      cursor: pointer;
      box-shadow: 0 10px 30px rgba(34,197,94,0.45);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
      box-shadow: none;
    }
    .hint {
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 4px;
    }
    .success {
      margin-top: 12px;
      font-size: 0.85rem;
      color: #4ade80;
    }
    .error {
      margin-top: 12px;
      font-size: 0.85rem;
      color: #f97373;
    }
  </style>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <div class="card">
    <div class="badge">${type === "leave" ? "แจ้งลาเรียน" : "แจ้งเข้าสาย"}</div>
    <h1>แบบฟอร์ม${type === "leave" ? "ลาเรียน" : "แจ้งเข้าสาย"}</h1>
    <p class="hint">กรอกข้อมูลให้ครบแล้วกดส่ง ระบบจะบันทึกเข้าฐานข้อมูลอัตโนมัติ</p>

    <div class="field">
      <label>ชื่อ-นามสกุล</label>
      <input id="name" placeholder="เช่น สมชาย ใจดี" />
    </div>

    <div class="field">
      <label>สาเหตุ</label>
      <textarea id="reason" placeholder="ป่วยเป็นไข้ / รถติด / ไปหาหมอ ฯลฯ"></textarea>
    </div>

    <div class="field">
      <label>ประเภท</label>
      <select id="type">
        <option value="${type}">${type === "leave" ? "ลาเรียน" : "แจ้งเข้าสาย"}</option>
      </select>
    </div>

    <button id="submitBtn">ส่งข้อมูล</button>
    <div id="msg" class=""></div>
  </div>

  <script>
    const LIFF_ID = "${liffId}";

    async function initLiff() {
      if (!LIFF_ID) return;
      try {
        await liff.init({ liffId: LIFF_ID });
        console.log("LIFF init success");
      } catch (err) {
        console.error("LIFF init error:", err);
        const msg = document.getElementById("msg");
        msg.textContent = "ไม่สามารถโหลด LIFF ได้ แต่ยังสามารถส่งฟอร์มได้";
        msg.className = "error";
      }
    }

    async function main() {
      await initLiff();

      document.getElementById("submitBtn").addEventListener("click", async () => {
        const btn = document.getElementById("submitBtn");
        const msg = document.getElementById("msg");
        const name = document.getElementById("name").value.trim();
        const reason = document.getElementById("reason").value.trim();
        const type = document.getElementById("type").value;

        if (!name || !reason) {
          msg.textContent = "กรุณากรอกชื่อและสาเหตุให้ครบถ้วน";
          msg.className = "error";
          return;
        }

        btn.disabled = true;
        msg.textContent = "กำลังบันทึกข้อมูล...";
        msg.className = "hint";

        try {
          const res = await fetch("/api/leave-from-liff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, reason, type }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Unknown error");

          msg.textContent = "บันทึกข้อมูลเรียบร้อยแล้ว ขอบคุณครับ 🙏";
          msg.className = "success";

          setTimeout(() => {
            if (window.liff && liff.isInClient()) {
              liff.closeWindow();
            }
          }, 1200);
        } catch (err) {
          console.error(err);
          msg.textContent = "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";
          msg.className = "error";
          btn.disabled = false;
        }
      });
    }

    main();
  </script>
</body>
</html>
  `);
});

// -------------------------
// API รับข้อมูลจาก LIFF แล้วเซฟเข้า Supabase
// -------------------------
app.post("/api/leave-from-liff", async (req, res) => {
  try {
    const { name, reason, type } = req.body;

    if (!name || !reason || !type) {
      return res.status(400).json({ error: "missing fields" });
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const { error } = await supabase.from("leave_requests").insert({
      leave_date: today,
      type, // 'leave' หรือ 'late'
      reason: \`ชื่อ: \${name}\\nสาเหตุ: \${reason}\`,
      leave_at: now.toISOString(),
    });

    if (error) {
      console.error("insert leave_requests error:", error);
      return res.status(500).json({ error: "supabase insert failed" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("api/leave-from-liff error:", err);
    return res.status(500).json({ error: "server error" });
  }
});

// -------------------------
// cron/morning → ยิง Flex + ปุ่มเปิด LIFF
// -------------------------
app.get("/cron/morning", async (req, res) => {
  try {
    const liffId = process.env.LIFF_LEAVE_ID;
    if (!liffId) {
      return res.status(500).send("LIFF_LEAVE_ID not set");
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
            { type: "text", text: "เช็คชื่อเช้านี้ 📝", weight: "bold", size: "lg" },
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
                    type: "uri",
                    label: "📝 แจ้งลา",
                    uri: \`https://liff.line.me/\${liffId}?type=leave\`
                  }
                },
                {
                  type: "button",
                  style: "secondary",
                  height: "sm",
                  action: {
                    type: "uri",
                    label: "⏰ แจ้งเข้าสาย",
                    uri: \`https://liff.line.me/\${liffId}?type=late\`
                  }
                }
              ]
            }
          ]
        }
      }
    };

    await client.pushMessage(process.env.LINE_GROUP_ID, message);
    res.send("ok");
  } catch (err) {
    console.error("cron/morning error:", err);
    res.status(500).send("error");
  }
});

// root test
app.get("/", (req, res) => {
  res.send("LINE bot + LIFF is running");
});

// -------------------------
// START SERVER
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("LINE bot running on port", PORT);
});
