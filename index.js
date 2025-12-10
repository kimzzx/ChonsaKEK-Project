// index.js  (Parent Leave Bot)

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

const client = new line.Client(config);

// -------------------------
// helper
// -------------------------
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, { type: "text", text });
}

// -------------------------
// ส่ง Flex ตอนเช้าเข้า “กลุ่มผู้ปกครอง”
// -------------------------
async function sendMorningPromptToGroup() {
  const groupId = process.env.LINE_GROUP_ID;
  if (!groupId) {
    console.error("LINE_GROUP_ID is not set");
    return;
  }

  const flex = {
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
            text: "ถ้าจะลา หรือจะมาสาย ให้กดปุ่มด้านล่าง",
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
            color: "#22c55e",
            action: {
              type: "message",       // 👉 ให้ยิงเป็นข้อความ
              label: "📝 แจ้งลา",
              text: "📝 แจ้งลา",
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "message",
              label: "⏰ แจ้งเข้าสาย",
              text: "⏰ แจ้งเข้าสาย",
            },
          },
        ],
        flex: 0,
      },
    },
  };

  await client.pushMessage(groupId, flex);
  console.log("Sent morning prompt to group", groupId);
}

// -------------------------
// Webhook จาก LINE
// -------------------------
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.json({ status: "ok" });
  } catch (err) {
    console.error("webhook error:", err);
    res.status(500).end();
  }
});

// logic หลักของบอท
async function handleEvent(event) {
  console.log("event:", JSON.stringify(event, null, 2));

  // รับเฉพาะข้อความ
  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }

  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // 1) เช็คว่าผู้ปกครองคนนี้กำลังอยู่ในฟอร์มอยู่ไหม
  const { data: formState, error: formErr } = await supabase
    .from("leave_form_states")
    .select("*")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (formErr) {
    console.error("leave_form_states select error:", formErr);
  }

  // -------------------------
  // อยู่ในโหมดฟอร์ม
  // -------------------------
  if (formState) {
    // STEP 1: รอชื่อ-นามสกุลนักเรียน
    if (formState.step === "waiting_child_name") {
      const childName = text;

      await supabase
        .from("leave_form_states")
        .update({
          temp_child_name: childName,
          step: "waiting_reason",
        })
        .eq("line_user_id", userId);

      return replyText(
        replyToken,
        "รับชื่อนักเรียนแล้ว ✅\n\nกรุณาพิมพ์สาเหตุที่ลา/มาสาย\nเช่น: ป่วยเป็นไข้, ไปหาหมอ, รถติด ฯลฯ"
      );
    }

    // STEP 2: รอสาเหตุ
    if (formState.step === "waiting_reason") {
      const reason = text;
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

      const insertPayload = {
        parent_line_user_id: userId,
        child_name: formState.temp_child_name,
        type: formState.type, // 'leave' หรือ 'late'
        reason,
        leave_date: today,
        leave_at: now.toISOString(),
      };

      const { error: insertErr } = await supabase
        .from("leave_requests")
        .insert(insertPayload);

      if (insertErr) {
        console.error("insert leave_requests error:", insertErr);
        return replyText(
          replyToken,
          "มีปัญหาในการบันทึกข้อมูลใบลา ลองใหม่อีกครั้งหรือติดต่อครูครับ 🙏"
        );
      }

      // ล้าง state ฟอร์ม
      await supabase
        .from("leave_form_states")
        .delete()
        .eq("line_user_id", userId);

      const typeText =
        formState.type === "leave" ? "ลาเรียน" : "มาสาย";

      return replyText(
        replyToken,
        `บันทึก${typeText}เรียบร้อยแล้ว ✅\n\nนักเรียน: ${formState.temp_child_name}\nสาเหตุ: ${reason}`
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
  // ยังไม่ได้เริ่มฟอร์ม → ดูว่ากดปุ่มไหน
  // -------------------------
  if (text === "📝 แจ้งลา" || text === "แจ้งลา") {
    // สร้าง state ฟอร์มแบบ "ลาเรียน"
    await supabase.from("leave_form_states").upsert({
      line_user_id: userId,
      step: "waiting_child_name",
      temp_child_name: null,
      type: "leave",
    });

    return replyText(
      replyToken,
      "แบบฟอร์มลาเรียน\n\nกรุณาพิมพ์ชื่อ-นามสกุลของนักเรียน\nเช่น: ด.ช. สมชาย ใจดี"
    );
  }

  if (text === "⏰ แจ้งเข้าสาย" || text === "แจ้งเข้าสาย") {
    // สร้าง state ฟอร์มแบบ "มาสาย"
    await supabase.from("leave_form_states").upsert({
      line_user_id: userId,
      step: "waiting_child_name",
      temp_child_name: null,
      type: "late",
    });

    return replyText(
      replyToken,
      "แบบฟอร์มแจ้งมาสาย\n\nกรุณาพิมพ์ชื่อ-นามสกุลของนักเรียน\nเช่น: ด.ช. สมชาย ใจดี"
    );
  }

  // ข้อความอื่นที่ไม่เกี่ยว → ยังไม่ตอบอะไรเป็นพิเศษ
  return;
}

// -------------------------
// Routes ทดสอบ + cron
// -------------------------
app.get("/", (req, res) => {
  res.send("Parent leave bot is running");
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

// (เผื่ออยากยิงสรุปทีหลัง ใช้ /cron/summary ได้)
app.get("/cron/summary", async (req, res) => {
  try {
    await client.pushMessage(process.env.LINE_GROUP_ID, {
    type: "text",
      text: "ทดสอบ /cron/summary: สรุปการลา/มาสาย (dummy) ✅",
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
  console.log("Parent leave bot running on port", PORT);
});
