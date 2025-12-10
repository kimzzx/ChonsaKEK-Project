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

function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: "text",
    text,
  });
}

// -------------------------
// ยิง Flex เข้า "กลุ่มผู้ปกครอง" ตอนเช้า
// -------------------------
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
            size: "lg",
          },
          {
            type: "text",
            text: "ถ้าจะลา หรือจะเข้าสาย กดปุ่มด้านล่างนี้ได้เลยนะ",
            wrap: true,
            size: "sm",
            color: "#666666",
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
            height: "sm",
            action: {
              type: "postback",
              label: "📝 แจ้งลา",
              data: "action=leave_today",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "⏰ แจ้งเข้าสาย",
              data: "action=late_today",
            },
          },
        ],
        flex: 0,
      },
    },
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

// -------------------------
// จัดการ event ทั้งหมดจาก LINE
// -------------------------
async function handleEvent(event) {
  console.log("event:", JSON.stringify(event, null, 2));

  // 1) ถ้าเป็น postback จากปุ่ม Flex → ไป handlePostback
  if (event.type === "postback") {
    return handlePostback(event);
  }

  // 2) ถ้าเป็นข้อความ → ใช้ต่อฟอร์ม
  if (event.type === "message" && event.message.type === "text") {
    return handleMessage(event);
  }

  // อย่างอื่นยังไม่รองรับ
  return null;
}

// -------------------------
// จัดการ text message (ใช้ต่อฟอร์ม)
// -------------------------
async function handleMessage(event) {
  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // ดูว่าคนนี้อยู่ใน state ฟอร์มหรือเปล่า
  const { data: formState, error: formErr } = await supabase
    .from("leave_form_states")
    .select("*")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (formErr) {
    console.error("leave_form_states select error:", formErr);
  }

  // ===== ถ้าอยู่ในโหมดฟอร์ม =====
  if (formState) {
    // STEP 1: รอชื่อ
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

    // STEP 2: รอเหตุผล
    if (formState.step === "waiting_reason") {
      const reason = text;
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

      // ผูก student_id ถ้ามีใน line_links
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
      if (studentId) insertPayload.student_id = studentId;

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

      // ลบ state ฟอร์ม
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
        `บันทึก${typeText}เรียบร้อยแล้ว ✅\n\nชื่อ: ${formState.temp_name}\nสาเหตุ: ${reason}\nวันที่: ${dateStr} เวลา: ${timeStr}`
      );
    }

    // step แปลก → ล้าง state
    await supabase
      .from("leave_form_states")
      .delete()
      .eq("line_user_id", userId);

    return replyText(
      replyToken,
      "เกิดข้อผิดพลาดกับแบบฟอร์ม ลองกดปุ่มแจ้งลา/แจ้งเข้าสายใหม่อีกครั้งนะครับ"
    );
  }

  // ===== ถ้าไม่ได้อยู่ในฟอร์ม =====
  if (text === "แจ้งลา" || text === "แจ้งเข้าสาย") {
    return replyText(
      replyToken,
      "ให้กดปุ่มในกรอบสีเขียว/ส้มเพื่อเริ่มกรอกแบบฟอร์มนะครับ 🙏"
    );
  }

  return null;
}

// -------------------------
// จัดการ postback จากปุ่ม Flex
// -------------------------
async function handlePostback(event) {
  const data = event.postback.data; // เช่น "action=leave_today"
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // ดูว่ามีข้อมูลนักเรียนมั้ย (ถ้ามีก็ดี ไม่มีก็ไม่เป็นไร)
  const { data: link } = await supabase
    .from("line_links")
    .select("student_id, students(full_name, student_code)")
    .eq("line_user_id", userId)
    .maybeSingle();

  const hasStudent = !!link;

  if (action === "leave_today" || action === "late_today") {
    const type = action === "leave_today" ? "leave" : "late";

    await supabase
      .from("leave_form_states")
      .upsert({
        line_user_id: userId,
        step: "waiting_name",
        temp_name: null,
        type,
      });

    let intro =
      type === "leave" ? "แบบฟอร์มลาเรียน" : "แบบฟอร์มแจ้งเข้าสาย";

    let askMsg =
      intro + "\n\nกรุณาพิมพ์ชื่อ-นามสกุลของนักเรียน\nเช่น: สมชาย ใจดี";

    if (hasStudent) {
      askMsg += `\n\n(ระบบรู้ว่าคุณคือ ${link.students.student_code} ${link.students.full_name} อยู่แล้ว แต่กรอกชื่อไว้ให้ครูอ่านง่าย ๆ ได้เลยครับ)`;
    }

    return replyText(replyToken, askMsg);
  }

  return null;
}

// -------------------------
// Routes ทดสอบ + cron
// -------------------------

// root
app.get("/", (req, res) => {
  res.send("LINE bot is running");
});

// ยิงข้อความเช้า
app.get("/cron/morning", async (req, res) => {
  try {
    await sendMorningPromptToGroup();
    res.send("ok");
  } catch (err) {
    console.error("cron/morning error:", err);
    res.status(500).send("error");
  }
});

// (เผื่ออนาคตทำสรุป)
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
