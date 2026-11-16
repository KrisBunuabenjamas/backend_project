# Restaurant Reservation API

Backend ระบบจองโต๊ะร้านอาหาร ใช้ Node.js, Express และ MongoDB Atlas

## ติดตั้งและรัน

ใช้ Node.js 22 ขึ้นไป

```bash
git clone https://github.com/KrisBunuabenjamas/backend_project.git
cd backend_project
npm ci
```

คัดลอก `config/config.env.example` เป็น `config/config.env` แล้วกรอกค่าของเครื่องที่ใช้งาน

```powershell
if (-not (Test-Path -LiteralPath 'config/config.env')) {
  Copy-Item config/config.env.example config/config.env
}
```

| ตัวแปร | ค่าที่ต้องใส่ |
| --- | --- |
| `MONGO_URI` | Connection string ของ MongoDB Atlas พร้อมชื่อฐานข้อมูล |
| `JWT_SECRET` | Secret แบบสุ่มอย่างน้อย 32 ตัวอักษร |
| `JWT_EXPIRE` | อายุ token เช่น `30d` |
| `JWT_COOKIE_EXPIRE` | อายุ cookie หน่วยวัน เช่น `30` |
| `PORT` | พอร์ตของ backend ค่าเริ่มต้น `5000` |
| `NODE_ENV` | `development` สำหรับรันในเครื่อง หรือ `production` เมื่อใช้ HTTPS |
| `ADMIN_NAME`, `ADMIN_TEL` | ชื่อและเบอร์โทรของ admin ที่ต้องการสร้าง |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | บัญชี admin ของแอป ใช้กับคำสั่ง `create-admin` |

สร้าง JWT secret แล้วนำค่าที่ได้ไปใส่ในไฟล์ config

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

ถ้าใช้ Atlas ให้เพิ่ม IP ของเครื่องใน IP Access List และใช้ Database User ที่มีสิทธิ์กับฐานนั้น บัญชี Database User ของ Atlas กับบัญชี admin ของแอปเป็นคนละบัญชีกัน

```bash
npm run seed
npm run create-admin
npm start
```

- `seed` เพิ่มร้านตัวอย่าง 3 ร้าน รันซ้ำได้โดยไม่ลบข้อมูลเดิม
- `create-admin` ใช้เฉพาะตอนสร้างบัญชีใหม่ หากอีเมลมีอยู่แล้วจะไม่แก้ทับบัญชีเดิม
- `npm run dev` ใช้โหมด watch ระหว่างแก้โค้ด

Swagger: http://localhost:5000/api-docs/

## API

ทุก endpoint มี prefix `/api/v1`

| Method | Path | การใช้งาน |
| --- | --- | --- |
| POST | `/auth/register` | สมัครสมาชิกด้วย name, tel, email, password |
| POST | `/auth/login` | Login ด้วย email และ password |
| GET | `/auth/logout` | Logout โดยล้าง cookie |
| GET | `/auth/me` | ข้อมูลบัญชีที่ Login อยู่ |
| GET | `/restaurants` | รายชื่อร้านอาหาร |
| GET | `/restaurants/:id` | รายละเอียดร้านอาหาร |
| POST | `/restaurants/:restaurantId/reservations` | จองโต๊ะร้านที่เลือก |
| GET | `/reservations` | สมาชิกดูของตนเอง หรือ admin ดูทั้งหมด |
| GET | `/reservations/:id` | ดูรายการ เจ้าของหรือ admin เท่านั้น |
| PUT | `/reservations/:id` | แก้รายการ เจ้าของหรือ admin เท่านั้น |
| DELETE | `/reservations/:id` | ลบรายการ เจ้าของหรือ admin เท่านั้น |

API ที่ต้อง Login รองรับ `Authorization: Bearer <token>` และ cookie `token`

ตัวอย่าง body สำหรับสร้างรายการจอง

```json
{
  "reservationDate": "2026-12-01T18:30:00+07:00"
}
```

PUT รับเฉพาะ `reservationDate` และ/หรือ `restaurant` ซึ่งเป็น ID ของร้านที่มีอยู่จริง

- 1 รายการจองแทน 1 โต๊ะ แต่ละบัญชีมีได้สูงสุด 3 รายการรวมทุกวันและทุกร้าน ลบแล้วจองใหม่ได้
- `slot` เป็นค่าภายในสำหรับบังคับเพดาน 3 รายการ ไม่ใช่เลขโต๊ะของร้าน และไม่แสดงใน response
- วันแบบ `YYYY-MM-DD` เก็บเป็นเที่ยงคืน UTC ส่วน date-time ต้องระบุ timezone
- สมัครสมาชิกได้เฉพาะ role `user` ส่วน admin สร้างผ่าน script
- Logout ล้าง cookie แต่ Bearer token ที่คัดลอกไว้ยังใช้ได้จนหมดอายุ

## ทดสอบ

```bash
npm test
npm run test:postman
```

สองคำสั่งนี้ใช้ MongoDB ชั่วคราวในเครื่อง ครั้งแรกอาจดาวน์โหลด MongoDB binary ไม่ใช้ฐาน Atlas ที่ตั้งค่าไว้ในโปรเจกต์

สำหรับนำเสนอตามลำดับอาจารย์ ให้ import `postman/Presentation.postman_collection.json` และ `postman/Presentation.postman_environment.json` แล้วเลือก environment `Restaurant Final - Presentation Local`

ตั้ง `baseUrl`, `adminEmail`, `adminPassword` ใน Current value ของเครื่อง โดยใช้ Admin ของแอป ไม่ใช่ Database User ของ Atlas และคง Initial value ของรหัสผ่านให้ว่าง เลือก Run ทั้ง collection ตามลำดับ 1 iteration, delay 500 ms และเปิด Persist responses for a session เพื่อดู JSON ย้อนหลัง

ชุดนำเสนอมี 42 requests / 148 assertions ครอบคลุมขั้น 1–12 สมัครสมาชิก ตรวจข้อมูล Login ดูร้าน CRUD การจอง ตรวจสิทธิ์สมาชิก และ Admin ชุดทดสอบสมัครบัญชีใหม่ทุกครั้งเพื่อไม่ให้ email ซ้ำ แล้วลบเฉพาะการจองของรอบนั้นเมื่อรันครบจนจบ บัญชีทดสอบยังคงอยู่ หากหยุดกลางทางอาจมีการจองทดสอบค้าง ห้ามล้างฐานข้อมูลทั้งหมด

ใช้ Newman แทน GUI ได้ขณะ backend ทำงานอยู่ โดยอ่าน credential จากไฟล์ config ที่ไม่ถูก commit:

```bash
npm run demo:presentation
```

ระบบจำกัด 100 API requests ต่อ IP ใน 10 นาที จึงไม่ควรซ้อมชุด 42 requests สามรอบติดกัน หากได้ 429 ให้รอจนหน้าต่างเวลาหมดแล้วเริ่มรอบใหม่ โดยไม่ต้องปิด rate limiter

`RestaurantReservation.postman_collection.json` เป็นชุดตรวจ API เดิม 34 requests / 109 assertions ส่วนการนำเสนอให้ใช้ชุด Presentation ด้านบน

## โครงสร้าง

```text
app.js          middleware และ routes
server.js       config การเชื่อมฐานและเปิด server
config/         database, environment example และ Swagger
models/         User, Restaurant, Reservation
routes/         auth, restaurants, reservations
controllers/    logic ของ API
middleware/     auth, validation, error handling
data/           ร้านตัวอย่าง
scripts/        seed, สร้าง admin, ทดสอบและ export Postman
postman/        collection และ environment ตัวอย่าง
tests/          integration tests
```
