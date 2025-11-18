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
// helper
// -------------------------
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: "text",
    text,
  });
}

// -------------------------
// ส่ง flex ปุ่มเช้า ๆ เข้า group
// -------------------------
async function sendMorningPromptToGroup() {
  const groupId = process.env.LINE_GROUP_ID;
  if (!groupId) {
    console.error("LINE_GROUP_ID is not set");
    return;
  }

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
              type: "message",
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

  try {
    await client.pushMessage(groupId, flex);
    console.log("Sent morning prompt to group", groupId);
  } catch (err) {
    console.error("sendMorningPromptToGroup error:", err.response?.data || err);
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

// -------------------------
// ฟังก์ชันจัดการ event จาก LINE
// -------------------------
async function handleEvent(event) {
  console.log("event:", JSON.stringify(event, null, 2));

  // รับเฉพาะข้อความ text
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // 1) เช็คว่าคนนี้กำลังอยู่ใน flow ฟอร์มหรือเปล่า
  const { data: formState, error: formErr } = await supabase
    .from("leave_form_states")
    .select("*")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (formErr) {
    console.error("leave_form_states select error:", formErr);
  }

  // -------------------------
  // ถ้าอยู่ใน flow ฟอร์มแล้ว
  // -------------------------
  if (formState) {
    // step 1 : รอชื่อ
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

    // step 2 : รอสาเหตุ
    if (formState.step === "waiting_reason") {
      const reason = text;
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

      // ลองหา student จาก line_links
      const { data: link } = await supabase
        .from("line_links")
        .select("student_id, students(full_name, student_code)")
        .eq("line_user_id", userId)
        .maybeSingle();

      const studentId = link?.student_id ?? null;

      const fullReason = `ชื่อ: ${formState.temp_name}\nสาเหตุ: ${reason}`;

      const payload = {
        leave_date: today,
        type: formState.type, // 'leave' หรือ 'late'
        reason: fullReason,
        leave_at: now.toISOString(),
      };

      if (studentId) {
        payload.student_id = studentId;
      }

      const { error: insertErr } = await supabase
        .from("leave_requests")
        .insert(payload);

      if (insertErr) {
        console.error("insert leave_requests error:", insertErr);
        return replyText(
          replyToken,
          "มีปัญหาในการบันทึกข้อมูลใบลา ลองอีกครั้งหรือติดต่อครูครับ 🙏"
        );
      }

      // ลบ state ทิ้งเพราะจบฟอร์มแล้ว
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

    // ถ้า step แปลก ๆ → ล้างทิ้ง
    await supabase
      .from("leave_form_states")
      .delete()
      .eq("line_user_id", userId);

    return replyText(
      replyToken,
      "เกิดข้อผิดพลาดกับแบบฟอร์ม ลองกดปุ่มแจ้งลา/แจ้งเข้าสายใหม่อีกครั้งนะครับ"
    );
  }

  // -------------------------
  // 2) ถ้า "ยังไม่อยู่ในฟอร์ม" แล้วกดปุ่มแจ้งลา / แจ้งเข้าสาย
  // -------------------------
  if (text === "แจ้งลา" || text === "แจ้งเข้าสาย") {
    const type = text === "แจ้งลา" ? "leave" : "late";

    await supabase.from("leave_form_states").upsert({
      line_user_id: userId,
      step: "waiting_name",
      temp_name: null,
      type,
    });

    let intro =
      type === "leave" ? "แบบฟอร์มลาเรียน" : "แบบฟอร์มแจ้งเข้าสาย";

    // เช็กว่ามี record ใน line_links มั้ย (ไว้แสดงให้เด็กเห็น)
    const { data: link } = await supabase
      .from("line_links")
      .select("student_id, students(full_name, student_code)")
      .eq("line_user_id", userId)
      .maybeSingle();

    let askMsg =
      intro + "\n\nกรุณาพิมพ์ชื่อ-นามสกุลของคุณ\nเช่น: สมชาย ใจดี";

    if (link?.students) {
      askMsg += `\n\n(ระบบรู้ว่าคุณคือ ${link.students.student_code} ${link.students.full_name} อยู่แล้ว แต่กรอกชื่อไว้ให้ครูดูในรายงานได้)`;
    }

    return replyText(replyToken, askMsg);
  }

  // ข้อความอื่น ๆ ตอนนี้ยังไม่รองรับ
  return null;
}

// -------------------------
// Routes ทดสอบ + cron
// -------------------------
app.get("/", (req, res) => {
  res.send("LINE bot is running");
});

app.get("/cron/morning", async (req, res) => {
  try {
    await sendMorningPromptToGroup();
    res.send("ok");
  } catch (err) {
    console.error("cron/morning error:", err);
    res.status(500).send("error");
  }
});

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
