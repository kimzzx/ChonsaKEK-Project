// index.js (LIFF ฟอร์มแจ้งลา/สาย + จำนวนวัน/ครึ่งวัน + ไม่พัง Railway)

const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// ---------- Express ----------
const app = express();
app.use(express.json());

// ---------- LINE ----------
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// ---------- Supabase ----------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------- Webhook (ทำให้ Verify ผ่าน) ----------
app.post("/webhook", line.middleware(config), (req, res) => {
  console.log("Webhook body:", JSON.stringify(req.body, null, 2));
  return res.json({ status: "ok" });
});

// ---------- หน้า LIFF ฟอร์ม ----------
app.get("/leave", (req, res) => {
  const type = req.query.type === "late" ? "late" : "leave";

  const badge = type === "leave" ? "แจ้งลาเรียน" : "แจ้งเข้าสาย";
  const title = type === "leave" ? "แบบฟอร์มลาเรียน" : "แบบฟอร์มแจ้งเข้าสาย";
  const btnText = type === "leave" ? "ส่งใบลา" : "ส่งแจ้งเข้าสาย";

  const liffId = process.env.LIFF_LEAVE_ID || "";

  res.send(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root{
      --bg:#0b1220;
      --card:#0a1020;
      --card2:#070b16;
      --border:rgba(148,163,184,.28);
      --text:#e5e7eb;
      --muted:#a1a1aa;
      --good:#22c55e;
      --bad:#fb7185;
    }
    *{box-sizing:border-box}
    body{
      margin:0; padding:0;
      font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
      background: radial-gradient(1200px 600px at 10% 10%, rgba(99,102,241,.22), transparent 55%),
                  radial-gradient(1000px 500px at 90% 20%, rgba(34,197,94,.16), transparent 55%),
                  var(--bg);
      color:var(--text);
      min-height:100vh;
      display:flex;
      justify-content:center;
      align-items:flex-start;
    }
    .card{
      width:100%;
      max-width:460px;
      margin:18px;
      padding:22px 18px 26px;
      border-radius:18px;
      background: linear-gradient(145deg, var(--card2), var(--card));
      border:1px solid var(--border);
      box-shadow: 0 18px 55px rgba(0,0,0,.45);
    }
    .badge{
      display:inline-block;
      font-size:.78rem;
      padding:5px 10px;
      border-radius:999px;
      background: rgba(34,197,94,.12);
      border:1px solid rgba(34,197,94,.35);
      color:#86efac;
      margin-bottom:10px;
    }
    h1{margin:6px 0 2px; font-size:1.25rem}
    .sub{margin:0 0 14px; font-size:.86rem; color:var(--muted); line-height:1.35}
    .row{display:grid; grid-template-columns:1fr 1fr; gap:10px}
    label{display:block; font-size:.85rem; margin:0 0 5px; color:#cbd5e1}
    input, textarea, select{
      width:100%;
      padding:11px 12px;
      border-radius:12px;
      border:1px solid rgba(148,163,184,.45);
      background: rgba(2,6,23,.55);
      color:var(--text);
      outline:none;
    }
    textarea{min-height:96px; resize:vertical}
    .field{margin:10px 0}
    .hint{font-size:.76rem; color:var(--muted); margin-top:6px}
    .btn{
      width:100%;
      margin-top:12px;
      padding:12px 14px;
      border:none;
      border-radius:999px;
      font-weight:700;
      cursor:pointer;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      color:#052e1a;
      box-shadow: 0 16px 40px rgba(34,197,94,.26);
    }
    .btn:disabled{opacity:.55; cursor:not-allowed; box-shadow:none}
    .msg{margin-top:10px; font-size:.88rem}
    .ok{color:#86efac}
    .err{color:var(--bad)}
    .mini{font-size:.78rem; color:var(--muted); margin-top:8px}
    .divider{height:1px; background:rgba(148,163,184,.18); margin:14px 0}
  </style>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <div class="card">
    <div class="badge">${badge}</div>
    <h1>${title}</h1>
    <p class="sub">กรอกข้อมูลให้ครบ แล้วกดส่ง ระบบจะบันทึกเข้า Supabase อัตโนมัติ</p>

    <div class="field">
      <label>ชื่อ-นามสกุลนักเรียน</label>
      <input id="name" placeholder="เช่น วิชญะ คุ้มฉัยยา" />
    </div>

    <div class="field">
      <label>สาเหตุ</label>
      <textarea id="reason" placeholder="ป่วยเป็นไข้ / รถติด / ไปหาหมอ ฯลฯ"></textarea>
    </div>

    <div class="divider"></div>

    <div class="field">
      <label>รูปแบบการลา</label>
      <select id="duration_type">
        <option value="full">เต็มวัน</option>
        <option value="half_am">ครึ่งวัน (เช้า)</option>
        <option value="half_pm">ครึ่งวัน (บ่าย)</option>
      </select>
      <div class="hint">ถ้า “ครึ่งวัน” แนะนำจำนวนวันเป็น 0.5</div>
    </div>

    <div class="row">
      <div class="field">
        <label>จำนวนวัน</label>
        <input id="days" type="number" min="0.5" step="0.5" value="1" />
      </div>
      <div class="field">
        <label>ประเภท</label>
        <select id="type" disabled>
          <option value="${type}">${type === "leave" ? "ลาเรียน" : "แจ้งเข้าสาย"}</option>
        </select>
      </div>
    </div>

    <div class="row">
      <div class="field">
        <label>วันที่เริ่ม</label>
        <input id="start_date" type="date" />
      </div>
      <div class="field">
        <label>วันที่สิ้นสุด (ถ้ามี)</label>
        <input id="end_date" type="date" />
      </div>
    </div>
    <div class="hint">ถ้าลา 1 วัน ใส่วันเริ่มอย่างเดียวก็พอ</div>

    <button class="btn" id="submitBtn">${btnText}</button>
    <div class="msg" id="msg"></div>
    <div class="mini" id="who"></div>
  </div>

  <script>
    const LIFF_ID = "${liffId}";
    const qType = "${type}";

    function todayISO(){
      const d = new Date();
      const off = d.getTimezoneOffset();
      const local = new Date(d.getTime() - off*60*1000);
      return local.toISOString().slice(0,10);
    }

    async function initLiff(){
      const msg = document.getElementById("msg");
      if(!LIFF_ID){
        msg.textContent = "ยังไม่ได้ตั้งค่า LIFF_LEAVE_ID ใน Railway Variables";
        msg.className = "msg err";
        return;
      }

      try{
        await liff.init({ liffId: LIFF_ID });

        // ถ้าเปิดนอก LINE แล้วไม่ได้ login ให้ login
        if(!liff.isLoggedIn()){
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        document.getElementById("who").textContent =
          "ผู้ส่ง: " + (profile.displayName || "-") + " (" + profile.userId.slice(0,8) + "…)";

        // ตั้งค่า default dates
        document.getElementById("start_date").value = todayISO();

      }catch(e){
        console.error(e);
        msg.textContent = "โหลด LIFF ไม่ได้ (เช็ค LIFF settings / endpoint / scope)";
        msg.className = "msg err";
      }
    }

    document.getElementById("submitBtn").addEventListener("click", async () => {
      const btn = document.getElementById("submitBtn");
      const msg = document.getElementById("msg");

      const name = document.getElementById("name").value.trim();
      const reason = document.getElementById("reason").value.trim();
      const duration_type = document.getElementById("duration_type").value;
      const days = parseFloat(document.getElementById("days").value || "0");
      const start_date = document.getElementById("start_date").value;
      const end_date = document.getElementById("end_date").value;

      if(!name || !reason){
        msg.textContent = "กรุณากรอกชื่อและสาเหตุให้ครบ";
        msg.className = "msg err";
        return;
      }
      if(!start_date){
        msg.textContent = "กรุณาเลือกวันที่เริ่ม";
        msg.className = "msg err";
        return;
      }
      if(!days || days < 0.5){
        msg.textContent = "จำนวนวันต้องอย่างน้อย 0.5";
        msg.className = "msg err";
        return;
      }

      btn.disabled = true;
      msg.textContent = "กำลังบันทึกข้อมูล...";
      msg.className = "msg";

      try{
        const profile = liff.isLoggedIn() ? await liff.getProfile() : null;

        const res = await fetch("/api/leave-from-liff", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            type: qType,
            name,
            reason,
            duration_type,
            days,
            start_date,
            end_date: end_date || null,
            line_user_id: profile ? profile.userId : null,
            line_display_name: profile ? profile.displayName : null
          })
        });

        const data = await res.json();
        if(!res.ok) throw new Error(data.error || "save failed");

        msg.textContent = "✅ บันทึกเรียบร้อย ขอบคุณครับ";
        msg.className = "msg ok";

        setTimeout(() => {
          if(window.liff && liff.isInClient()) liff.closeWindow();
        }, 900);

      }catch(e){
        console.error(e);
        msg.textContent = "❌ บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";
        msg.className = "msg err";
        btn.disabled = false;
      }
    });

    initLiff();
  </script>
</body>
</html>`);
});

// ---------- API รับข้อมูลจาก LIFF แล้วบันทึกลง Supabase ----------
app.post("/api/leave-from-liff", async (req, res) => {
  try {
    const {
      type,
      name,
      reason,
      duration_type,
      days,
      start_date,
      end_date,
      line_user_id,
      line_display_name
    } = req.body;

    if (!type || !name || !reason || !duration_type || !days || !start_date) {
      return res.status(400).json({ error: "missing fields" });
    }

    const now = new Date();
    const leaveDate = String(start_date).slice(0, 10);

    const durationText =
      duration_type === "full" ? "เต็มวัน" :
      duration_type === "half_am" ? "ครึ่งวัน(เช้า)" :
      duration_type === "half_pm" ? "ครึ่งวัน(บ่าย)" : duration_type;

    // ✅ ไม่พึ่งคอลัมน์ใหม่: เก็บรายละเอียดทั้งหมดไว้ใน reason เดิม
    let fullReason = "";
    fullReason += "ชื่อ: " + name + "\\n";
    fullReason += "สาเหตุ: " + reason + "\\n";
    fullReason += "รูปแบบ: " + durationText + "\\n";
    fullReason += "จำนวนวัน: " + days + "\\n";
    fullReason += "วันที่เริ่ม: " + leaveDate + "\\n";
    if (end_date) fullReason += "วันที่สิ้นสุด: " + String(end_date).slice(0, 10) + "\\n";
    if (line_display_name) fullReason += "ผู้แจ้ง (LINE): " + line_display_name + "\\n";
    if (line_user_id) fullReason += "LINE userId: " + line_user_id + "\\n";

    const payload = {
      leave_date: leaveDate,        // ใช้ start_date เป็น leave_date
      type: type,                   // leave / late
      reason: fullReason,
      leave_at: now.toISOString(),
    };

    const { error } = await supabase.from("leave_requests").insert(payload);

    if (error) {
      console.error("supabase insert error:", error);
      return res.status(500).json({ error: "supabase insert failed" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("api/leave-from-liff error:", err);
    return res.status(500).json({ error: "server error" });
  }
});

// ---------- Health check ----------
app.get("/", (req, res) => {
  res.send("LINE bot is running");
});

// ---------- ส่ง Flex เข้า group ให้กดเข้า LIFF ----------
app.get("/cron/morning", async (req, res) => {
  try {
    const LIFF_ID = process.env.LIFF_LEAVE_ID;
    if (!LIFF_ID) return res.status(500).send("LIFF_LEAVE_ID not set");

    const message = {
      type: "flex",
      altText: "เช็คชื่อเช้านี้",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "เช็คชื่อเช้านี้ 📝", weight: "bold", size: "lg" },
            { type: "text", text: "ถ้าจะลา หรือจะเข้าสาย ให้กดปุ่มด้านล่าง", wrap: true, size: "sm", margin: "md" }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              action: { type: "uri", label: "📝 แจ้งลา", uri: "https://liff.line.me/" + LIFF_ID + "?type=leave" }
            },
            {
              type: "button",
              style: "secondary",
              action: { type: "uri", label: "⏰ แจ้งเข้าสาย", uri: "https://liff.line.me/" + LIFF_ID + "?type=late" }
            }
          ]
        }
      }
    };

    await client.pushMessage(process.env.LINE_GROUP_ID, message);
    return res.send("ok");
  } catch (err) {
    console.error("cron/morning error:", err);
    return res.status(500).send("error");
  }
});

// ---------- Start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("LINE bot running on port", PORT);
});
