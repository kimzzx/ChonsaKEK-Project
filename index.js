require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();

// --- LINE webhook ---
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// สำหรับ cron / scheduler ไว้ยิงตอน 05:00 / 09:00
app.use(express.json());

app.post("/cron/morning", async (req, res) => {
  try {
    await sendMorningPrompt();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

app.post("/cron/summary", async (req, res) => {
  try {
    await sendNineAMSummary();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

// endpoint ไว้รองรับ ESP32 ส่งข้อมูลสแกนมา (optional)
app.post("/api/attendance", async (req, res) => {
  try {
    const { student_id, status, scanned_at } = req.body;
    if (!student_id) return res.status(400).json({ error: "student_id required" });

    const now = scanned_at ? new Date(scanned_at) : new Date();

    const { data: log, error } = await supabase
      .from("attendance_logs")
      .insert({
        student_id,
        status: status || "present",
        scanned_at: now.toISOString(),
        room: "ม.6/1",
      })
      .select()
      .single();

    if (error) throw error;

    await notifyAttendanceToGroup(log);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

// ----------------- Handler หลักของ LINE Bot -----------------

async function handleEvent(event) {
  const client = new line.Client(config);

  // ลอง log groupId ถ้ามึงอยากรู้
  if (event.source.type === "group") {
    console.log("GroupId:", event.source.groupId);
  }

  // postback (จากปุ่ม แจ้งลา / แจ้งเข้าสาย)
  if (event.type === "postback") {
    return handlePostback(event);
  }

  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // --------- คำสั่งพิเศษ ---------

  if (text.startsWith("ลงทะเบียน")) {
    const parts = text.split(/\s+/);
    const code = parts[1];

    if (!code) {
      return replyText(replyToken, "ใช้รูปแบบ: ลงทะเบียน เลขที่\nตัวอย่าง: ลงทะเบียน 01");
    }

    const { data: stu, error } = await supabase
      .from("students")
      .select("id, full_name")
      .eq("student_code", code)
      .eq("class_name", "ม.6/1")
      .single();

    if (error || !stu) {
      return replyText(replyToken, "ไม่พบเลขที่นี้ในห้อง ม.6/1");
    }

    await supabase.from("line_links").upsert({
      line_user_id: userId,
      student_id: stu.id,
      role: "student",
    });

    return replyText(
      replyToken,
      `เชื่อม LINE กับ ${stu.full_name} (เลขที่ ${code}) เรียบร้อย ✅`
    );
  }

  // หา student จาก line_links
  const { data: link } = await supabase
    .from("line_links")
    .select("student_id, students(full_name, student_code)")
    .eq("line_user_id", userId)
    .single();

  if (!link) {
    return replyText(
      replyToken,
      "ยังไม่ได้ลงทะเบียนกับระบบ\nพิมพ์: ลงทะเบียน <เลขที่>\nตัวอย่าง: ลงทะเบียน 01"
    );
  }

  const studentId = link.student_id;
  const fullName = link.students.full_name;
  const studentCode = link.students.student_code;

  // เช็คชื่อวันนี้
  if (text === "เช็คชื่อวันนี้") {
    const msg = await getTodayStatusMessage(studentId, fullName);
    return replyText(replyToken, msg);
  }

  // ประวัติ 7 วัน
  if (text === "ประวัติ 7 วัน") {
    const msg = await getSevenDaysHistoryMessage(studentId, fullName);
    return replyText(replyToken, msg);
  }

  // เหตุผลลา / เหตุผลเข้าสาย
  if (text.startsWith("เหตุผลลา") || text.startsWith("เหตุผลเข้าสาย")) {
    const isLeave = text.startsWith("เหตุผลลา");
    const reason = text.split(/\s+/).slice(1).join(" ");
    const today = new Date().toISOString().slice(0, 10);

    const type = isLeave ? "leave" : "late";

    // อัพเดตรายการ leave_requests ล่าสุดของวันนี้ ถ้าไม่มีให้สร้างใหม่
    const { data: existing } = await supabase
      .from("leave_requests")
      .select("id")
      .eq("student_id", studentId)
      .eq("leave_date", today)
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("leave_requests")
        .update({ reason })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("leave_requests").insert({
        student_id: studentId,
        leave_date: today,
        type,
        reason,
      });
    }

    return replyText(
      replyToken,
      `บันทึกเหตุผล${isLeave ? "ลา" : "เข้าสาย"} ของ ${fullName} แล้ว ✅`
    );
  }

  // default help
  const helpMsg =
    "คำสั่งที่ใช้ได้:\n" +
    "- ลงทะเบียน <เลขที่>\n" +
    "- เช็คชื่อวันนี้\n" +
    "- ประวัติ 7 วัน\n" +
    "- (หลังจากกดปุ่ม) เหตุผลลา <ข้อความ>\n" +
    "- (หลังจากกดปุ่ม) เหตุผลเข้าสาย <ข้อความ>";
  return replyText(replyToken, helpMsg);
}

// ----------------- postback handler (ปุ่มลา/เข้าสาย) -----------------

async function handlePostback(event) {
  const data = event.postback.data; // เช่น "action=leave_today"
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  const { data: link } = await supabase
    .from("line_links")
    .select("student_id, students(full_name, student_code)")
    .eq("line_user_id", userId)
    .single();

  if (!link) {
    return replyText(
      replyToken,
      "ยังไม่ได้ลงทะเบียนกับระบบ\nพิมพ์: ลงทะเบียน <เลขที่>"
    );
  }

  const studentId = link.student_id;
  const fullName = link.students.full_name;
  const studentCode = link.students.student_code;
  const today = new Date().toISOString().slice(0, 10);

  if (action === "leave_today") {
    await supabase.from("leave_requests").insert({
      student_id: studentId,
      leave_date: today,
      type: "leave",
      reason: null,
    });

    return replyText(
      replyToken,
      `บันทึกว่า ${studentCode} ${fullName} ลาวันนี้แล้ว 📝\nถ้าอยากระบุเหตุผล พิมพ์: เหตุผลลา ป่วย/ธุระ ฯลฯ`
    );
  }

  if (action === "late_today") {
    await supabase.from("leave_requests").insert({
      student_id: studentId,
      leave_date: today,
      type: "late",
      reason: null,
    });

    return replyText(
      replyToken,
      `บันทึกว่า ${studentCode} ${fullName} จะแจ้งเข้าสายแล้ว ⏰\nถ้าอยากระบุเหตุผล พิมพ์: เหตุผลเข้าสาย รถติด ฯลฯ`
    );
  }

  return null;
}

// ----------------- helper: ตอบข้อความ -----------------

function replyText(token, text) {
  const client = new line.Client(config);
  return client.replyMessage(token, { type: "text", text });
}

// ----------------- ฟังก์ชันสำหรับเช็คชื่อ -----------------

async function getTodayStatusMessage(studentId, fullName) {
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = `${today}T00:00:00+07:00`;
  const endOfDay = `${today}T23:59:59+07:00`;

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("scanned_at, status")
    .eq("student_id", studentId)
    .gte("scanned_at", startOfDay)
    .lte("scanned_at", endOfDay)
    .order("scanned_at", { ascending: true });

  if (!logs || logs.length === 0) {
    return `${fullName}\nวันนี้ยังไม่มีการเช็คชื่อในระบบ`;
  }

  const first = logs[0];
  const t = new Date(first.scanned_at);
  const timeStr = t.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${fullName}\nมาเรียนวันนี้ เวลา ${timeStr}\nสถานะ: ${first.status}`;
}

async function getSevenDaysHistoryMessage(studentId, fullName) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("scanned_at, status")
    .eq("student_id", studentId)
    .gte("scanned_at", sevenDaysAgo.toISOString())
    .order("scanned_at", { ascending: true });

  if (!logs || logs.length === 0) {
    return `ไม่มีประวัติการมาเรียนใน 7 วันที่ผ่านมา`;
  }

  let msg = `ประวัติ 7 วันของ ${fullName}\n`;
  for (const log of logs) {
    const d = new Date(log.scanned_at);
    const dateStr = d.toLocaleDateString("th-TH");
    const timeStr = d.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
    msg += `• ${dateStr} ${timeStr} - ${log.status}\n`;
  }
  return msg;
}

// ----------------- ฟังก์ชันส่งปุ่มตอนตี 5 -----------------

async function sendMorningPrompt() {
  const client = new line.Client(config);
  const groupId = process.env.LINE_GROUP_ID;

  const morningMessage = {
    type: "text",
    text: "เช้านี้ถ้าจะลา/เข้าสาย กดปุ่มด้านล่างนี้ได้เลยนะครับ 👇",
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "📝 แจ้งลา",
            data: "action=leave_today",
          },
        },
        {
          type: "action",
          action: {
            type: "postback",
            label: "⏰ แจ้งเข้าสาย",
            data: "action=late_today",
          },
        },
      ],
    },
  };

  await client.pushMessage(groupId, morningMessage);
}

// ----------------- ฟังก์ชันสรุปตอน 9 โมง -----------------

async function sendNineAMSummary() {
  const client = new line.Client(config);
  const groupId = process.env.LINE_GROUP_ID;

  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = `${today}T00:00:00+07:00`;
  const endOfDay = `${today}T23:59:59+07:00`;

  const { data: students } = await supabase
    .from("students")
    .select("id, student_code, full_name")
    .eq("class_name", "ม.6/1")
    .order("student_code", { ascending: true });

  const { data: leaves } = await supabase
    .from("leave_requests")
    .select("student_id, type")
    .eq("leave_date", today);

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("student_id, scanned_at, status")
    .gte("scanned_at", startOfDay)
    .lte("scanned_at", endOfDay);

  const leaveMap = {};
  leaves?.forEach((l) => {
    leaveMap[l.student_id] = l.type;
  });

  const logMap = {};
  logs?.forEach((log) => {
    const sid = log.student_id;
    if (!logMap[sid] || log.scanned_at < logMap[sid].scanned_at) {
      logMap[sid] = log;
    }
  });

  const arrLeave = [];
  const arrLateReported = [];
  const arrLateNotReported = [];
  const arrPresent = [];
  const arrAbsent = [];

  for (const stu of students || []) {
    const leaveType = leaveMap[stu.id] || null;
    const log = logMap[stu.id] || null;

    if (leaveType === "leave") {
      arrLeave.push(stu);
      continue;
    }

    if (!log) {
      if (leaveType === "late") {
        arrLateReported.push({ ...stu, notArrivedYet: true });
      } else {
        arrAbsent.push(stu);
      }
      continue;
    }

    const t = new Date(log.scanned_at);
    const timeStr = t.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (log.status === "late") {
      if (leaveType === "late") {
        arrLateReported.push({ ...stu, timeStr });
      } else {
        arrLateNotReported.push({ ...stu, timeStr });
      }
    } else {
      arrPresent.push({ ...stu, timeStr });
    }
  }

  let msg = `สรุปการมาเรียนห้อง ม.6/1 วันที่ ${today}\n`;

  msg += `\n✅ มาเรียนปกติ (${arrPresent.length} คน)\n`;
  arrPresent.forEach((s) => {
    msg += `- ${s.student_code} ${s.full_name} เวลา ${s.timeStr}\n`;
  });

  msg += `\n⏰ มาสายที่แจ้งไว้แล้ว (${arrLateReported.length} คน)\n`;
  arrLateReported.forEach((s) => {
    msg += `- ${s.student_code} ${s.full_name}${
      s.notArrivedYet ? " (ยังไม่มา)" : " เวลา " + s.timeStr
    }\n`;
  });

  msg += `\n⚠️ มาสายแต่ไม่แจ้ง (${arrLateNotReported.length} คน)\n`;
  arrLateNotReported.forEach((s) => {
    msg += `- ${s.student_code} ${s.full_name} เวลา ${s.timeStr}\n`;
  });

  msg += `\n📝 ลา (${arrLeave.length} คน)\n`;
  arrLeave.forEach((s) => {
    msg += `- ${s.student_code} ${s.full_name}\n`;
  });

  msg += `\n❌ ไม่มา ไม่ลา (${arrAbsent.length} คน)\n`;
  arrAbsent.forEach((s) => {
    msg += `- ${s.student_code} ${s.full_name}\n`;
  });

  await client.pushMessage(groupId, { type: "text", text: msg });
}

// ----------------- แจ้งเข้า group ตอนมีการสแกน (ใช้กับ /api/attendance) -----------------

async function notifyAttendanceToGroup(log) {
  const client = new line.Client(config);
  const groupId = process.env.LINE_GROUP_ID;

  const { data: stu } = await supabase
    .from("students")
    .select("student_code, full_name")
    .eq("id", log.student_id)
    .single();

  if (!stu) return;

  const t = new Date(log.scanned_at);
  const timeStr = t.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  let statusText = "มาเรียน";
  if (log.status === "late") statusText = "มาสาย";

  const text = `${stu.student_code} ${stu.full_name}\n${statusText} เวลา ${timeStr}`;

  await client.pushMessage(groupId, { type: "text", text });
}

// ----------------- start server -----------------

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("LINE bot running on port " + port);
});
