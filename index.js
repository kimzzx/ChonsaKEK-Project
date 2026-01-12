// index.js — LIFF Leave/Late Form + Supabase save (stable)

const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();

// ---------- LINE ----------
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// ---------- Supabase ----------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------- Helpers ----------
function isoDateTodayTH() {
  // today in YYYY-MM-DD (local timezone is fine for TH usage)
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------- Webhook (ให้ Verify ผ่าน + log) ----------
app.post("/webhook", line.middleware(config), (req, res) => {
  console.log("Webhook body:", JSON.stringify(req.body, null, 2));
  return res.json({ status: "ok" });
});

app.use(express.json());

// ---------- LIFF Form Page ----------
app.get("/leave", (req, res) => {
  const type = req.query.type === "late" ? "late" : "leave";
  const titleText = type === "leave" ? "แจ้งลาเรียน" : "แจ้งเข้าสาย";
  const headerText = type === "leave" ? "แบบฟอร์มลาเรียน" : "แบบฟอร์มแจ้งเข้าสาย";

  // ล็อกวันให้เป็น “วันนี้”
  const lockedDate = isoDateTodayTH();

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${headerText}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      margin: 0;
      padding: 0;
      background: #0f172a;
      color: #e5e7eb;
      display: flex;
      justify-content: center;
    }
    .card {
      max-width: 440px;
      width: 100%;
      padding: 22px 18px 26px;
      margin: 16px;
      background: linear-gradient(145deg, #020617, #0b1120);
      border-radius: 18px;
      box-shadow: 0 14px 40px rgba(15,23,42,0.8);
      border: 1px solid rgba(148,163,184,0.25);
    }
    h1 { margin: 8px 0 6px; font-size: 1.22rem; }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(52,211,153,0.1);
      color: #6ee7b7;
      border: 1px solid rgba(45,212,191,0.45);
    }
    .hint { font-size: 0.78rem; color: #9ca3af; margin: 8px 0 14px; }
    label { display:block; font-size:0.86rem; margin: 0 0 6px; color:#cbd5f5; }
    input, textarea, select {
      width:100%;
      padding:10px 12px;
      border-radius: 12px;
      border:1px solid rgba(148,163,184,0.45);
      background: rgba(15,23,42,0.92);
      color:#e5e7eb;
      font-size: 0.95rem;
      outline:none;
      box-sizing:border-box;
    }
    input[readonly] { opacity: 0.9; }
    textarea { min-height: 92px; resize: vertical; }
    .field { margin-bottom: 12px; }
    .row { display:flex; gap:10px; }
    .row .field { flex:1; }
    button {
      width: 100%;
      padding: 12px 14px;
      border-radius: 999px;
      border: none;
      font-size: 1rem;
      font-weight: 700;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      color: #022c22;
      cursor: pointer;
      box-shadow: 0 10px 30px rgba(34,197,94,0.38);
    }
    button:disabled { opacity:0.55; cursor:default; box-shadow:none; }
    .msg { margin-top: 12px; font-size: 0.9rem; }
    .success { color: #4ade80; }
    .error { color: #fb7185; }
  </style>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <div class="card">
    <div class="badge">${titleText}</div>
    <h1>${headerText}</h1>
    <div class="hint">กรอกข้อมูลให้ครบ แล้วกด “ส่งข้อมูล” ระบบจะบันทึกเข้า Supabase ทันที</div>

    <div class="field">
      <label>วันที่ (ล็อกเป็นวันนี้)</label>
      <input id="locked_date" type="date" value="${lockedDate}" readonly />
      <div class="hint">*ถ้าต้องการให้เลือกวันย้อนหลัง/ล่วงหน้า บอกกู เดี๋ยวปลดล็อกให้</div>
    </div>

    <div class="field">
      <label>ชื่อ-นามสกุล</label>
      <input id="name" placeholder="เช่น สมชาย ใจดี" />
    </div>

    <div class="field">
      <label>สาเหตุ</label>
      <textarea id="reason" placeholder="ป่วยเป็นไข้ / รถติด / ไปหาหมอ ฯลฯ"></textarea>
    </div>

    <div class="row">
      <div class="field">
        <label>รูปแบบการลา</label>
        <select id="duration_type">
          <option value="full">เต็มวัน</option>
          <option value="half_am">ครึ่งวัน (เช้า)</option>
          <option value="half_pm">ครึ่งวัน (บ่าย)</option>
        </select>
      </div>
      <div class="field">
        <label>จำนวนวันลา</label>
        <input id="days" type="number" min="0.5" step="0.5" value="1" />
      </div>
    </div>

    <div class="field">
      <label>ประเภท</label>
      <select id="type" disabled>
        <option value="${type}">${type === "leave" ? "ลาเรียน" : "แจ้งเข้าสาย"}</option>
      </select>
      <div class="hint">ประเภทถูกกำหนดจากปุ่มที่กดในกลุ่ม</div>
    </div>

    <button id="submitBtn">ส่งข้อมูล</button>
    <div id="msg" class="msg"></div>
  </div>

  <script>
    const LIFF_ID = "${process.env.LIFF_LEAVE_ID || ""}";
    const LOCKED_DATE = "${lockedDate}";

    async function initLiff() {
      try {
        if (!LIFF_ID) throw new Error("Missing LIFF_LEAVE_ID");
        await liff.init({ liffId: LIFF_ID });
        // login อัตโนมัติถ้าเปิดใน external browser
        if (!liff.isLoggedIn()) liff.login();
      } catch (err) {
        console.error(err);
        const msg = document.getElementById("msg");
        msg.textContent = "เปิดฟอร์มไม่สำเร็จ (LIFF init error)";
        msg.className = "msg error";
      }
    }

    function showMsg(text, cls) {
      const msg = document.getElementById("msg");
      msg.textContent = text;
      msg.className = "msg " + (cls || "");
    }

    document.getElementById("submitBtn").addEventListener("click", async () => {
      const btn = document.getElementById("submitBtn");

      const name = document.getElementById("name").value.trim();
      const reason = document.getElementById("reason").value.trim();
      const type = document.getElementById("type").value;
      const duration_type = document.getElementById("duration_type").value;
      const days = Number(document.getElementById("days").value);
      const leave_date = LOCKED_DATE;

      if (!name || !reason) return showMsg("กรุณากรอกชื่อและสาเหตุให้ครบถ้วน", "error");
      if (!days || days < 0.5) return showMsg("จำนวนวันต้อง >= 0.5", "error");

      btn.disabled = true;
      showMsg("กำลังบันทึกข้อมูล...", "");

      try {
        const payload = { name, reason, type, duration_type, days, leave_date };

        const res = await fetch("/api/leave-from-liff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unknown error");

        showMsg("บันทึกข้อมูลเรียบร้อยแล้ว ✅ ขอบคุณครับ", "success");
        setTimeout(() => {
          if (window.liff && liff.isInClient()) liff.closeWindow();
        }, 1100);
      } catch (err) {
        console.error(err);
        showMsg("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
        btn.disabled = false;
      }
    });

    initLiff();
  </script>
</body>
</html>`);
});

// ---------- API รับข้อมูลจาก LIFF แล้วบันทึกลง Supabase ----------
app.post("/api/leave-from-liff", async (req, res) => {
  try {
    const { name, reason, type, duration_type, days, leave_date } = req.body;

    if (!name || !reason || !type || !duration_type || !days || !leave_date) {
      return res.status(400).json({ error: "missing fields" });
    }

    const now = new Date();

    // เก็บรายละเอียดเพิ่มใน reason (ถ้ายังไม่ได้เพิ่มคอลัมน์ใหม่)
    // ถ้ามึงอยากเก็บเป็นคอลัมน์แยก เดี๋ยวกูให้ SQL ALTER TABLE ได้
    const fullReason =
      `ชื่อ: ${name}\n` +
      `สาเหตุ: ${reason}\n` +
      `รูปแบบ: ${duration_type}\n` +
      `จำนวนวัน: ${days}\n` +
      `วัน: ${leave_date}`;

    const { error } = await supabase.from("leave_requests").insert({
      leave_date,              // ใช้วันจากฟอร์ม (ล็อกเป็นวันนี้)
      type,                    // leave / late
      reason: fullReason,
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

// ---------- Health ----------
app.get("/", (req, res) => {
  res.send("LINE bot is running");
});

// ---------- cron/morning ส่งปุ่มเข้า LIFF ----------
app.get("/cron/morning", async (req, res) => {
  try {
    const liffId = process.env.LIFF_LEAVE_ID;
    if (!liffId) return res.status(500).send("Missing LIFF_LEAVE_ID");

    const message = {
      type: "flex",
      altText: "เช็คชื่อเช้านี้",
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
              text: "ถ้าจะลา หรือจะเข้าสาย ให้กดปุ่มด้านล่าง",
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
                  action: {
                    type: "uri",
                    label: "📝 แจ้งลา",
                    uri: `https://liff.line.me/${liffId}?type=leave`
                  }
                },
                {
                  type: "button",
                  style: "secondary",
                  action: {
                    type: "uri",
                    label: "⏰ แจ้งเข้าสาย",
                    uri: `https://liff.line.me/${liffId}?type=late`
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

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("LINE bot running on port", PORT));
