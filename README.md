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

## Additional Requirements (Group: Hungry)

| Method | Path | ใครใช้ได้ | การใช้งาน |
| --- | --- | --- | --- |
| GET | `/restaurants/:restaurantId/menu` | สมาชิก | เมนูที่เปิดใช้งาน (admin เห็นที่ปิดแล้วด้วย) |
| POST | `/restaurants/:restaurantId/menu` | admin | สร้างเมนู `name`, `description`, `price`, `availableForPreorder` |
| GET | `/menu-items/:id` | สมาชิก | รายละเอียดเมนู |
| PUT | `/menu-items/:id` | admin | แก้เมนู |
| PATCH | `/menu-items/:id/deactivate` | admin | ปิดเมนู (ไม่ลบจริง ข้อมูลใน pre-order เดิมยังอยู่) |
| GET | `/reservations/:id/preorder` | เจ้าของ / admin | ดู pre-order ของการจอง |
| POST | `/reservations/:id/preorder/items` | เจ้าของ | เพิ่มเมนู `{ menuItem, quantity }` ถ้ามีอยู่แล้วจะบวกจำนวนเพิ่ม |
| PUT | `/reservations/:id/preorder/items/:menuItemId` | เจ้าของ | ตั้งจำนวนใหม่ `{ quantity }` |
| DELETE | `/reservations/:id/preorder/items/:menuItemId` | เจ้าของ | ลบเมนูออกจาก pre-order |
| GET | `/preorders?date=YYYY-MM-DD` | admin | ดู pre-order ตามวันที่จอง (เวลาไทย) |
| POST | `/reservations/check-in` | admin | ตรวจรหัส `{ code }` ในวันที่จอง: reserved → checked-in |
| PATCH | `/reservations/:id/complete` | admin | ทานเสร็จ: checked-in → completed |
| POST | `/reservations/:id/review` | เจ้าของ | รีวิว `{ rating: 1-5, comment? }` เฉพาะการจองที่ completed |
| GET | `/restaurants/:restaurantId/reviews` | สมาชิก | รีวิวทั้งหมดพร้อม `averageRating` |
| GET / PUT / DELETE | `/reviews/:id` | สมาชิก / ผู้เขียนเท่านั้น | ดู แก้ ลบรีวิว |

1. **Menu items** – admin สร้าง แก้ และปิดเมนูได้ สมาชิกเห็นเฉพาะเมนูที่เปิดอยู่ การปิดเมนูไม่ลบข้อมูล pre-order เดิมจึงยังเห็นชื่อและราคาเดิม
2. **Pre-order** – เจ้าของการจองเพิ่ม แก้ ลบเมนูได้ก่อน check-in เท่านั้น จำนวนต้องเป็นจำนวนเต็ม 1–100 เมนูต้องเปิดอยู่ เปิดให้ pre-order และเป็นของร้านเดียวกับการจอง ระบบคำนวณ `totalPrice` และเก็บ `unitPrice` ตอนเพิ่มครั้งแรกไว้ (admin เปลี่ยนราคาทีหลังไม่กระทบ) ถ้าลบการจอง pre-order จะเปลี่ยนเป็น `cancelled` ถ้ามีเมนูใน pre-order อยู่จะเปลี่ยนร้านของการจองไม่ได้
3. **Review** – รีวิวได้เฉพาะการจองของตัวเองที่ `completed` แล้ว 1 การจองต่อ 1 รีวิว แก้หรือลบได้เฉพาะผู้เขียน (admin ก็แก้ไม่ได้)
4. **Check-in code** – ทุกการจองได้รหัส 10 ตัว (เช่น `3F9A0C12BE`) ใน response ตอนจองและตอนเจ้าของดูการจอง admin มองไม่เห็นรหัส admin ตรวจรหัสได้เฉพาะวันที่จอง (เวลาไทย) รหัสใช้ได้ครั้งเดียว รหัสของการจองที่ถูกลบจะใช้ไม่ได้ และเปลี่ยนสถานะได้แค่ reserved → checked-in → completed

สิ่งที่เปลี่ยนจากส่วน basic:
- การจองที่ `completed` แล้วไม่นับในเพดาน 3 รายการ (ไม่ต้องลบการจองเก่าเพื่อจองใหม่ และรีวิวยังอยู่)
- หลัง check-in สมาชิกแก้หรือลบการจองไม่ได้ (admin ยังลบได้)
- ตอน start server ระบบจะ sync index ใหม่ และเติม `status` กับ `checkInCode` ให้การจองเก่าที่ยังไม่มีให้อัตโนมัติ
- `npm run seed` เพิ่มเมนูตัวอย่างของร้านตัวอย่างด้วย

## ทดสอบ

```bash
npm test
npm run test:postman
```

สองคำสั่งนี้ใช้ MongoDB ชั่วคราวในเครื่อง ครั้งแรกอาจดาวน์โหลด MongoDB binary ไม่ใช้ฐาน Atlas ที่ตั้งค่าไว้ในโปรเจกต์

ถ้าทดสอบผ่าน Postman ให้ import ทั้ง collection และ environment ใน `postman/` แล้วตั้ง `baseUrl`, `adminEmail`, `adminPassword` เป็นค่าในเครื่อง รันทั้ง collection ตามลำดับหลัง seed ร้านและสร้าง admin แล้ว ชุดทดสอบจะสร้างบัญชีทดสอบใหม่และลบรายการจองของรอบนั้นเมื่อรันจบ

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
