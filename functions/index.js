const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// ตั้งค่า Transport สำหรับส่งอีเมล (เช่น Gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'wpowpoi38@gmail.com', // อีเมลระบบของคุณ
        pass: 'kfcpfseenhujckvm'     // App Password จาก Google Account
    }
});

// ฟังก์ชัน: แจ้งเตือนเมื่อเข้าสู่ระบบ
exports.sendLoginAlert = functions.https.onRequest(async (req, res) => {
    // กำหนด CORS
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const { email, ip } = req.query;
    if (!email || !ip) return res.status(400).send("Missing parameters");

    const mailOptions = {
        from: 'e-LIS System <no-reply@elis-system.com>',
        to: email,
        subject: 'แจ้งเตือนการเข้าสู่ระบบ e-LIS',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #1e3a8a;">การเข้าสู่ระบบบัญชีของคุณ</h2>
                <p>เรียนผู้ใช้งาน,</p>
                <p>มีการเข้าสู่ระบบบัญชี e-LIS ของคุณในเวลาล่าสุด</p>
                <ul>
                    <li><b>IP Address:</b> ${ip}</li>
                    <li><b>เวลา:</b> ${new Date().toLocaleString('th-TH')}</li>
                </ul>
                <hr>
                <p style="color: red;">หากคุณไม่ได้เป็นคนเข้าสู่ระบบ โปรดคลิกปุ่มด้านล่างเพื่อระงับการใช้งานทันที</p>
                <a href="https://us-central1-elis-system.cloudfunctions.net/lockAccount?email=${email}" 
                   style="background-color: #ef4444; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">
                   ล็อกการใช้งานบัญชี
                </a>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).send({ success: true, message: "Email sent" });
    } catch (error) {
        res.status(500).send({ error: error.toString() });
    }
});

// ฟังก์ชัน: ล็อกบัญชี (ทำงานเมื่อผู้ใช้กดปุ่มในอีเมล)
exports.lockAccount = functions.https.onRequest(async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).send("No email provided");

    try {
        // ค้นหา UID ผ่าน Auth
        const userRecord = await admin.auth().getUserByEmail(email);
        
        // อัพเดทสถานะ IsLocked ใน Realtime Database
        await admin.database().ref(`users/${userRecord.uid}`).update({ isLocked: true });
        
        // ลบ Session ปัจจุบัน (Revoke Token)
        await admin.auth().revokeRefreshTokens(userRecord.uid);

        res.send(`
            <h1 style="color: red; text-align: center; margin-top: 50px;">
                บัญชีของคุณถูกล็อกโดยระบบแล้ว
            </h1>
            <p style="text-align: center;">กรุณาติดต่อผู้ดูแลระบบเพื่อทำการปลดล็อก</p>
        `);
    } catch (error) {
        res.status(500).send("Error locking account: " + error.message);
    }
});

// ฟังก์ชัน: แจ้งเตือนสถานะเมื่อมีการเปลี่ยนแปลงที่ /requests/{reqId} (Realtime DB Trigger)
exports.onStatusChange = functions.database.ref('/requests/{requestId}')
    .onUpdate(async (change, context) => {
        const before = change.before.val();
        const after = change.after.val();

        if (before.status === after.status) return null; // ไม่เปลี่ยนไม่ต้องส่ง

        const statusLabels = ['','รอดำเนินการ','กำลังตรวจสอบ','เอกสารครบ','อนุมัติ','ไม่อนุมัติ'];
        
        const mailOptions = {
            from: 'e-LIS System <no-reply@elis-system.com>',
            to: after.userEmail,
            subject: `อัพเดทสถานะสินเชื่อ: ${after.loanName}`,
            html: `
                <h3>แจ้งเตือนสถานะคำขอสินเชื่อ (e-LIS)</h3>
                <p><b>เลขที่คำขอ:</b> ${after.refCode}</p>
                <p><b>สถานะปัจจุบัน:</b> <span style="color: blue;">${statusLabels[after.status]}</span></p>
                <p><b>หมายเหตุจากเจ้าหน้าที่:</b> ${after.statusRemark || '-'}</p>
            `
        };

        return transporter.sendMail(mailOptions);
    });
