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

// client LINE เอาไว้ push / reply
const client = new line.Client(config);

// -------------------------
// Helper
// -------------------------
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: "text",
    text,
  });
}

// Flex สวย ๆ เอาไว้ถามชื่อ
function buildAskNameFlex(typeText) {
  return {
    type: "flex",
    altText: `${typeText} - ขั้นที่ 1/2`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: typeText,
            weight: "bold",
            size: "lg",
          },
          {
            type: "text",
            text: "ขั้นที่ 1/2 : กรุณาพิมพ์ชื่อ-นามสกุลของนักเรียนตอบกลับมาที่แชตนี้\nเช่น: วิชญะ คุ้มฉัยยา",
            wrap: true,
            size: "sm",
            color: "#555555",
          },
        ],
      },
    },
  };
}

// Flex สวย ๆ เอาไว้ยืนยันตอนบันทึกสำเร็จ
function buildSuccessFlex({ typeText, name, reason, dateStr, timeStr }) {
  return {
    type: "flex",
    altText: `${typeText} สำเร็จ`,
    contents: {
      type: "bubble",
      styles: {
        body: {
          backgroundColor: "#0f172a",
        },
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: `${typeText} บันทึกแล้ว ✅`,
            weight: "bold",
            size: "lg",
            color: "#e5e7eb",
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "text",
                    text: "ชื่อ",
                    size: "sm",
                    color: "#9ca3af",
                    flex: 2,
                  },
                  {
                    type: "text",
                    text: name,
                    size: "sm",
                    color: "#e5e7eb",
                    flex: 5,
                    wrap: true,
                  },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "text",
                    text: "สาเหตุ",
                    size: "sm",
                    color: "#9ca3af",
                    flex: 2,
                  },
                  {
                    type: "text",
                    text: reason,
                    size: "sm",
                    color: "#e5e7eb",
                    flex: 5,
                    wrap: true,
                  },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "text",
                    text: "วันที่",
                    size: "sm",
                    color: "#9ca3af",
                    flex: 2,
                  },
                  {
                    type: "text",
                    text: `${dateStr} ${timeStr}`,
                    size: "sm",
                    color: "#e5e7eb",
                    flex: 5,
                  },
                ],
              },
            ],
          },
          {
            type: "text",
            text: "ขอบคุณที่แจ้งล่วงหน้าครับ 🙏",
            size: "xs",
            color: "#9ca3af",
          },
        ],
      },
    },
  };
}

// -------------------------
// ส่ง Flex เช้าเข้า group
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
          },
        ],
      },
    },
  };

  await client.pushMessage(groupId, message);
  console.log("Sent morning prompt to group", groupId);
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
// handleEvent
// -------------------------
async function handleEvent(event) {
  console.log("event:", JSON.stringify(event, null, 2));

  // ถ้าเป็น postback จากปุ่ม แจ้งลา/แจ้งเข้าสาย
  if (event.type === "postback") {
    return handlePostback(event);
  }

  // รับเฉพาะข้อความ text
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // เช็คว่าคนนี้กำลังกรอกฟอร์มอยู่หรือเปล่า
  const { data: formState, error: formErr } = await supabase
    .from("leave_form_states")
    .select("*")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (formErr) {
    console.error("leave_form_states select error:", formErr);
  }

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
        "รับชื่อเรียบร้อยแล้ว ✅\n\nขั้นที่ 2/2 : กรุณาพิมพ์สาเหตุที่ลา/เข้าสาย\nเช่น: ป่วยเป็นไข้, รถติด, ไปหาหมอ ฯลฯ"
      );
    }

    // STEP 2: รอเหตุผล
    if (formState.step === "waiting_reason") {
      const reason = text;
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

      // หา student จาก line_links ถ้ามี
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
        line_user_id: userId,
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

      // ลบ state แล้ว
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

      // ส่ง Flex สรุป
      return client.replyMessage(
        replyToken,
        buildSuccessFlex({
          typeText,
          name: formState.temp_name,
          reason,
          dateStr,
          timeStr,
        })
      );
    }

    // step แปลก → เคลียร์ทิ้ง
    await supabase
      .from("leave_form_states")
      .delete()
      .eq("line_user_id", userId);

    return replyText(
      replyToken,
      "เกิดข้อผิดพลาดกับแบบฟอร์ม ให้ลองกดปุ่มแจ้งลา/แจ้งเข้าสายใหม่อีกครั้งนะครับ"
    );
  }

  // ถ้าไม่ได้อยู่ในโหมดฟอร์ม แล้วพิมพ์ "แจ้งลา"/"แจ้งเข้าสาย"
  if (text === "แจ้งลา" || text === "แจ้งเข้าสาย") {
    return replyText(
      replyToken,
      "ให้กดปุ่ม Flex ที่ครูส่งในห้องเพื่อเริ่มกรอกฟอร์มอีกครั้งนะครับ 🙏"
    );
  }

  return null;
}

// -------------------------
// handlePostback
// -------------------------
async function handlePostback(event) {
  const data = event.postback.data;
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (action === "leave_today" || action === "late_today") {
    const type = action === "leave_today" ? "leave" : "late";

    // สร้าง/อัปเดตสถานะฟอร์ม
    await supabase.from("leave_form_states").upsert({
      line_user_id: userId,
      step: "waiting_name",
      temp_name: null,
      type,
    });

    const typeText =
      type === "leave" ? "แบบฟอร์มลาเรียน" : "แบบฟอร์มแจ้งเข้าสาย";

    return client.replyMessage(replyToken, buildAskNameFlex(typeText));
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
