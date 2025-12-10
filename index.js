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

// client LINE สำหรับ reply / push
const client = new line.Client(config);

function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: "text",
    text,
  });
}

// -------------------------
// Flex ตอนเช้า (ปุ่ม postback)
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
            text: "ถ้าจะลา หรือจะเข้าสาย ให้กดปุ่มด้านล่างนี้ได้เลยนะครับ",
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
// ตัวจัดการ event หลัก
// -------------------------
async function handleEvent(event) {
  console.log("event:", JSON.stringify(event, null, 2));

  // 1) ปุ่ม postback จาก Flex
  if (event.type === "postback") {
    return handlePostback(event);
  }

  // 2) ข้อความ text (ใช้ตอบฟอร์ม)
  if (event.type === "message" && event.message.type === "text") {
    return handleTextMessage(event);
  }

  // 3) event แบบอื่นไม่ทำอะไร
  return null;
}

// -------------------------
// จัดการข้อความ text (ชื่อ / เหตุผล)
// -------------------------
async function handleTextMessage(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const text = event.message.text.trim();

  // เช็คว่า user อยู่ใน flow ฟอร์มหรือเปล่า
  const { data: formState, error: formErr } = await supabase
    .from("leave_form_states")
    .select("*")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (formErr) {
    console.error("leave_form_states select error:", formErr);
  }

  // ----- กรณี ยังไม่มี form state -----
  if (!formState) {
    // รองรับกรณี user พิมพ์ "แจ้งลา" / "แจ้งเข้าสาย" เอง
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

      return replyText(
        replyToken,
        intro +
          "\n\nกรุณาพิมพ์ชื่อ-นามสกุลของนักเรียน\nเช่น: สมชาย ใจดี"
      );
    }

    // ข้อความอื่น ๆ ยังไม่รองรับ
    return null;
  }

  // ----- กรณีอยู่ใน flow ฟอร์มแล้ว -----

  // STEP 1: รอ "ชื่อ"
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

  // STEP 2: รอ "สาเหตุ"
  if (formState.step === "waiting_reason") {
    const reason = text;
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // ถ้าอยาก map กับ student_id จาก line_links
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
        "มีปัญหาในการบันทึกข้อมูลใบลา ลองอีกครั้งหรือติดต่อครูครับ 🙏"
      );
    }

    // ลบสถานะฟอร์มเพราะจบ flow แล้ว
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

  // ถ้า step แปลก ๆ → ล้างทิ้งแล้วเริ่มใหม่
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
// จัดการ postback จากปุ่ม
// -------------------------
async function handlePostback(event) {
  const data = event.postback.data; // "action=leave_today"
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (action === "leave_today" || action === "late_today") {
    const type = action === "leave_today" ? "leave" : "late";

    await supabase.from("leave_form_states").upsert({
      line_user_id: userId,
      step: "waiting_name",
      temp_name: null,
      type,
    });

    let intro =
      type === "leave" ? "แบบฟอร์มลาเรียน" : "แบบฟอร์มแจ้งเข้าสาย";

    return replyText(
      replyToken,
      intro +
        "\n\nกรุณาพิมพ์ชื่อ-นามสกุลของนักเรียน\nเช่น: สมชาย ใจดี"
    );
  }

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

// ยิงสรุป dummy
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
