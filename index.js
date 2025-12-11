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

app.post("/webhook", line.middleware(config), (req, res) => {
  console.log("Webhook event:", JSON.stringify(req.body, null, 2));
  // ตอนนี้ยังไม่ต้องทำอะไรกับ event ก็ได้
  res.status(200).json({ ok: true });
});

app.get("/leave", (req, res) => {
  // type จะได้มาจาก query (?type=leave หรือ ?type=late)
  const type = req.query.type === "late" ? "late" : "leave";

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
    const LIFF_ID = "${process.env.LIFF_LEAVE_ID}";

    async function main() {
      try {
        await liff.init({ liffId: LIFF_ID });
        // ดึง profile ไว้โชว์หรือใช้ต่อได้ ถ้าต้องการ
        const profile = await liff.getProfile();
        console.log("LIFF profile:", profile);
      } catch (err) {
        console.error("LIFF init error:", err);
        document.getElementById("msg").textContent = "ไม่สามารถโหลด LIFF ได้";
        document.getElementById("msg").className = "error";
      }

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
            if (liff.isInClient()) liff.closeWindow();
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


const app = express();
app.use(express.json());

// client LINE ไว้ใช้ reply/push
const client = new line.Client(config);

function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: "text",
    text,
  });
}

// -------------------------
// Webhook หลักจาก LINE
// -------------------------
app.post("/webhook", line.middleware(config), async (req, res) => {
  // แก้ปัญหา verify webhook: ตอน verify events จะเป็น [] หรือ undefined
  const events = Array.isArray(req.body.events) ? req.body.events : [];

  try {
    await Promise.all(events.map(handleEvent));
    return res.json({ status: "ok" });
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(500).end();
  }
});

// -------------------------
// ฟังก์ชันจัดการ event จาก LINE
// -------------------------
async function handleEvent(event) {
  console.log("event:", JSON.stringify(event, null, 2));

  // รับเฉพาะข้อความธรรมดา
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // 1) เช็คว่าคนนี้กำลังกรอกฟอร์มอยู่มั้ย
  const { data: formState, error: formErr } = await supabase
    .from("leave_form_states")
    .select("*")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (formErr) {
    console.error("leave_form_states select error:", formErr);
  }

  // -------------------------
  // โหมดกรอกฟอร์ม (มี state อยู่แล้ว)
  // -------------------------
  if (formState) {
    // STEP 1: รอ "ชื่อ-สกุล"
    if (formState.step === "waiting_name") {
      const name = text;

      await supabase
        .from("leave_form_states")
        .update({
          temp_name: name,
          step: "waiting_reason",
        })
        .eq("line_user_id", userId);

      return replyText(
        replyToken,
        [
          "✅ รับชื่อเรียบร้อยแล้ว",
          "",
          "2️⃣ กรุณาพิมพ์ *สาเหตุที่ลา/เข้าสาย*",
          "เช่น: ป่วยเป็นไข้, รถติด, ไปหาหมอ ฯลฯ",
        ].join("\n")
      );
    }

    // STEP 2: รอ "เหตุผล"
    if (formState.step === "waiting_reason") {
      const reason = text;
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

      // ผูกกับ student_id ถ้ามี line_links
      const { data: link } = await supabase
        .from("line_links")
        .select("student_id, students(full_name, student_code)")
        .eq("line_user_id", userId)
        .maybeSingle();

      const studentId = link?.student_id ?? null;

      const fullReason = `ชื่อ: ${formState.temp_name}\nสาเหตุ: ${reason}`;

      const insertPayload = {
        leave_date: today,
        type: formState.type, // 'leave' หรือ 'late'
        reason: fullReason,
        leave_at: now.toISOString(),
      };

      if (studentId) {
        insertPayload.student_id = studentId;
      }

      const { error: insertErr } = await supabase
        .from("leave_requests")
        .insert(insertPayload);

      if (insertErr) {
        console.error("insert leave_requests error:", insertErr);
        return replyText(
          replyToken,
          "⚠️ มีปัญหาในการบันทึกข้อมูลใบลา ลองอีกครั้งหรือติดต่อครูครับ 🙏"
        );
      }

      // ลบ state เพราะกรอกเสร็จแล้ว
      await supabase
        .from("leave_form_states")
        .delete()
        .eq("line_user_id", userId);

      const typeText =
        formState.type === "leave" ? "ลาเรียน" : "แจ้งเข้าสาย";

      const dateStr = now.toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const timeStr = now.toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      });

      return replyText(
        replyToken,
        [
          `✅ บันทึก${typeText}เรียบร้อยแล้ว`,
          "",
          `ชื่อ: ${formState.temp_name}`,
          `สาเหตุ: ${reason}`,
          `วันที่: ${dateStr} เวลา: ${timeStr}`,
        ].join("\n")
      );
    }

    // step แปลก → ล้าง state ทิ้ง
    await supabase
      .from("leave_form_states")
      .delete()
      .eq("line_user_id", userId);

    return replyText(
      replyToken,
      "⚠️ เกิดข้อผิดพลาดกับแบบฟอร์ม ลองกดปุ่มแจ้งลา/แจ้งเข้าสายใหม่อีกครั้งนะครับ"
    );
  }

  // -------------------------
  // ยังไม่ได้อยู่ในโหมดฟอร์ม
  // เริ่มฟอร์มเมื่อกดปุ่ม (ข้อความ "แจ้งลา" / "แจ้งเข้าสาย")
  // -------------------------
  if (text === "แจ้งลา" || text === "แจ้งเข้าสาย") {
    const type = text === "แจ้งลา" ? "leave" : "late";

    await supabase
      .from("leave_form_states")
      .upsert({
        line_user_id: userId,
        step: "waiting_name",
        temp_name: null,
        type,
      });

    const title =
      type === "leave" ? "📄 แบบฟอร์มลาเรียน" : "⏰ แบบฟอร์มแจ้งเข้าสาย";

    return replyText(
      replyToken,
      [
        title,
        "",
        "1️⃣ กรุณาพิมพ์ *ชื่อ-นามสกุลของนักเรียน*",
        'เช่น: วิชญะ คุ้มฉัยยา',
      ].join("\n")
    );
  }

  // ข้อความอื่น ๆ ไม่ตอบอะไร (หรือจะใส่ help ก็ได้)
  return null;
}

// -------------------------
// Routes ทดสอบ + cron
// -------------------------

// root เอาไว้เช็คว่า service รันอยู่มั้ย
app.get("/", (req, res) => {
  res.send("LINE bot is running");
});

// ยิงเองจาก browser / cron service เพื่อส่งข้อความเข้า group ตอนเช้า
app.get("/cron/morning", async (req, res) => {
  try {
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
                    uri: `https://liff.line.me/${process.env.LIFF_LEAVE_ID}?type=leave`
                  }
                },
                {
                  type: "button",
                  style: "secondary",
                  height: "sm",
                  action: {
                    type: "uri",
                    label: "⏰ แจ้งเข้าสาย",
                    uri: `https://liff.line.me/${process.env.LIFF_LEAVE_ID}?type=late`
                  }
                }
              ]
            }
          ]
        }
      }
    }
    await client.pushMessage(process.env.LINE_GROUP_ID, flex);
    res.send("ok");
  } catch (err) {
    console.error("cron/morning error:", err);
    res.status(500).send("error");
  }
});

// ยิงสรุป (ตอนนี้ยัง dummy)
app.get("/cron/summary", async (req, res) => {
  try {
    await client.pushMessage(process.env.LINE_GROUP_ID, {
      type: "text",
      text: "ทดสอบ /cron/summary: สรุปการมาเรียน (dummy) ✅",
    });
    res.send("ok");
  } catch (err) {
    console.error(
      "cron/summary error:",
      err.response?.data || err.message || err
    );
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

app.post("/api/leave-from-liff", async (req, res) => {
  try {
    const { name, reason, type } = req.body;

    if (!name || !reason || !type) {
      return res.status(400).json({ error: "missing fields" });
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const { error } = await supabase.from("leave_requests").insert({
      // student_id แล้วค่อย map ทีหลังได้
      leave_date: today,
      type, // 'leave' หรือ 'late'
      reason: `ชื่อ: ${name}\nสาเหตุ: ${reason}`,
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
