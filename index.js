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

// client สำหรับส่งข้อความกลับ LINE
const client = new line.Client(config);

// helper ส่ง text ง่าย ๆ
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: "text",
    text,
  });
}

// --------------------------------------------------
// 1) Webhook หลักจาก LINE
// --------------------------------------------------
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.json({ status: "ok" }))
    .catch((err) => {
      console.error("webhook error:", err);
      res.status(500).end();
    });
});

// --------------------------------------------------
// 2) logic หลักของบอท
// --------------------------------------------------
async function handleEvent(event) {
  console.log("event:", JSON.stringify(event, null, 2));

  // รับเฉพาะข้อความ text
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // ----- 2.1 เช็คว่ามี state ฟอร์มอยู่ไหม -----
  const { data: formState, error: formErr } = await supabase
    .from("leave_form_states")
    .select("*")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (formErr) {
    console.error("select leave_form_states error:", formErr);
  }

  if (formState) {
    // ====== STEP 1: กำลังรอ "ชื่อ" ======
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
        "รับชื่อเรียบร้อยแล้ว ✅\n\nกรุณาพิมพ์สาเหตุที่ลา/เข้าสาย\nเช่น: ป่วยเป็นไข้, รถติด, ไปหาหมอ ฯลฯ"
      );
    }

    // ====== STEP 2: กำลังรอ "สาเหตุ" ======
    if (formState.step === "waiting_reason") {
      const reason = text;
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

      // ถ้ามี mapping line_links → students
      const { data: link } = await supabase
        .from("line_links")
        .select("student_id, students(full_name, student_code)")
        .eq("line_user_id", userId)
        .maybeSingle();

      const studentId = link?.student_id ?? null;

      const fullReason = `ชื่อ: ${formState.temp_name}\nสาเหตุ: ${reason}`;

      const insertPayload = {
        leave_date: today,
        type: formState.type,       // 'leave' หรือ 'late'
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
          "มีปัญหาในการบันทึกข้อมูลใบลา ลองอีกครั้งหรือติดต่อครูครับ 🙏"
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
        `บันทึก${typeText}เรียบร้อยแล้ว ✅\n\n` +
          `ชื่อ: ${formState.temp_name}\n` +
          `สาเหตุ: ${reason}\n` +
          `วันที่: ${dateStr} เวลา: ${timeStr}`
      );
    }

    // กรณี step แปลก ๆ → ล้าง state ทิ้ง
    await supabase
      .from("leave_form_states")
      .delete()
      .eq("line_user_id", userId);

    return replyText(
      replyToken,
      "เกิดข้อผิดพลาดกับแบบฟอร์ม ลองกดปุ่มแจ้งลา/แจ้งเข้าสายใหม่อีกครั้งนะครับ"
    );
  }

  // ----- 2.2 ถ้ายังไม่มีฟอร์ม แล้ว user กดปุ่ม/พิมพ์แจ้งลา/แจ้งเข้าสาย -----
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

    const intro =
      type === "leave" ? "แบบฟอร์มลาเรียน" : "แบบฟอร์มแจ้งเข้าสาย";

    return replyText(
      replyToken,
      intro +
        "\n\nกรุณาพิมพ์ชื่อ-นามสกุลของนักเรียน\nเช่น: สมชาย ใจดี"
    );
  }

  // ข้อความอื่น ๆ → ยังไม่ทำอะไร
  return null;
}

// --------------------------------------------------
// 3) Routes ทดสอบ + cron
// --------------------------------------------------
app.get("/", (req, res) => {
  res.send("LINE bot is running");
});

// ใช้ส่ง flex ตอนเช้า
async function sendMorningPromptToGroup() {
  const groupId = process.env.LINE_GROUP_ID;
  if (!groupId) {
    console.error("LINE_GROUP_ID is not set");
    return;
  }

  // flex เดิมของนาย ตรงนี้จะต้องอยู่ด้วย (ไม่ขอซ้ำ)
  // ... (ใช้ flex จากข้อ 2) ...
}

app.get("/cron/morning", async (req, res) => {
  try {
    await sendMorningPromptToGroup();
    res.send("ok");
  } catch (err) {
    console.error("cron/morning error:", err);
    res.status(500).send("error");
  }
});

// สรุป dummy ไว้ก่อน
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
