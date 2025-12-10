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
              size: "lg",
            },
            {
              type: "text",
              text: "ถ้าจะลา หรือจะมาสาย ให้กดปุ่มด้านล่าง",
              wrap: true,
              size: "sm",
              margin: "md",
            },
          ],
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
                type: "message", // ส่งข้อความแทน postback
                label: "แจ้งลา",
                text: "แจ้งลา",
              },
            },
            {
              type: "button",
              style: "secondary",
              action: {
                type: "message",
                label: "แจ้งเข้าสาย",
                text: "แจ้งเข้าสาย",
              },
            },
          ],
          flex: 0,
        },
      },
    };

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
