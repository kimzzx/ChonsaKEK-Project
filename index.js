// index.js — Stable LIFF Leave Form

const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(express.json());

// ---------- CONFIG ----------
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------- WEBHOOK (ให้ Verify ผ่าน) ----------
app.post("/webhook", line.middleware(config), (req, res) => {
  return res.json({ ok: true });
});

// ---------- LIFF FORM ----------
app.get("/leave", (req, res) => {
  const type = req.query.type === "late" ? "late" : "leave";
  const today = new Date().toISOString().slice(0, 10);

  res.send(`
<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>แบบฟอร์มแจ้ง${type === "leave" ? "ลา" : "สาย"}</title>
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>
body{font-family:sans-serif;background:#0f172a;color:#e5e7eb;margin:0;padding:16px}
.card{max-width:420px;margin:auto;background:#020617;padding:20px;border-radius:16px}
label{font-size:.85rem;margin-top:12px;display:block}
input,textarea,select{width:100%;padding:10px;border-radius:10px;border:none;margin-top:4px}
button{margin-top:16px;width:100%;padding:12px;border-radius:999px;border:none;background:#22c55e;color:#022c22;font-weight:bold}
.hint{font-size:.75rem;color:#9ca3af}
</style>
</head>
<body>
<div class="card">
<h2>แจ้ง${type === "leave" ? "ลาเรียน" : "เข้าสาย"}</h2>

<label>ชื่อ-นามสกุล</label>
<input id="name">

<label>สาเหตุ</label>
<textarea id="reason"></textarea>

<label>วันที่ลา</label>
<input type="date" id="date" value="${today}" disabled>
<div class="hint">ล็อกเป็นวันปัจจุบัน</div>

<label>รูปแบบการลา</label>
<select id="duration_type">
  <option value="full">เต็มวัน</option>
  <option value="half_am">ครึ่งวัน (เช้า)</option>
  <option value="half_pm">ครึ่งวัน (บ่าย)</option>
</select>

<label>จำนวนวัน</label>
<input type="number" id="days" step="0.5" value="1">

<button onclick="submitForm()">ส่งข้อมูล</button>
<p id="msg"></p>
</div>

<script>
const LIFF_ID = "${process.env.LIFF_LEAVE_ID}";
liff.init({ liffId: LIFF_ID });

async function submitForm(){
  const body = {
    name: document.getElementById("name").value,
    reason: document.getElementById("reason").value,
    type: "${type}",
    leave_date: document.getElementById("date").value,
    duration_type: document.getElementById("duration_type").value,
    days: document.getElementById("days").value
  };

  const res = await fetch("/api/leave", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });

  if(res.ok){
    document.getElementById("msg").innerText = "บันทึกเรียบร้อย ✅";
    setTimeout(()=>liff.closeWindow(),1000);
  }else{
    document.getElementById("msg").innerText = "บันทึกไม่สำเร็จ ❌";
  }
}
</script>
</body>
</html>
`);
});

// ---------- API SAVE ----------
app.post("/api/leave", async (req, res) => {
  const { name, reason, type, leave_date, duration_type, days } = req.body;

  if (!name || !reason) {
    return res.status(400).json({ error: "missing" });
  }

  const { error } = await supabase.from("leave_requests").insert({
    leave_date,
    type,
    duration_type,
    days,
    reason: `ชื่อ: ${name}\nสาเหตุ: ${reason}`,
    leave_at: new Date().toISOString(),
  });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "db" });
  }

  res.json({ ok: true });
});

// ---------- CRON SEND FLEX ----------
app.get("/cron/morning", async (req, res) => {
  await client.pushMessage(process.env.LINE_GROUP_ID, {
    type: "flex",
    altText: "เช็คชื่อ",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "เช็คชื่อวันนี้ 📝", weight: "bold" },
          {
            type: "button",
            style: "primary",
            action: {
              type: "uri",
              label: "แจ้งลา",
              uri: `https://liff.line.me/${process.env.LIFF_LEAVE_ID}?type=leave`
            }
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "uri",
              label: "แจ้งสาย",
              uri: `https://liff.line.me/${process.env.LIFF_LEAVE_ID}?type=late`
            }
          }
        ]
      }
    }
  });
  res.send("ok");
});

// ---------- START ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("running on", PORT));
