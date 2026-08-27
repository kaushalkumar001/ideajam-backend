# IdeaJam 2026 - Backend API & Mailer Service

Production-ready backend for IdeaJam 2026 hackathon registration, database storage, and automated Nodemailer notification.

## Features
- **Express.js Server**: REST API with CORS, Morgan logging, and validation.
- **MongoDB + Mongoose**: Full schema for Team Name, Team Leader, and 2-5 Members with unique registration code (`IJ26-XXXXXX`).
- **Nodemailer Automation**:
  - Automatically dispatches high-aesthetic, branded HTML confirmation emails to the **Team Leader** (with full pass and team roster).
  - Simultaneously dispatches customized welcome emails to **all individual team members**.
  - Safe fallback mode if email credentials are not set during local testing.
- **Duplicate Prevention**: Protects against duplicate team names and leader email registrations.

---

## 🛠️ Setup & Running

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables (`.env`)
Create/Edit `.env` file in the `backend/` folder:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/ideajam2026

# Nodemailer Setup
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-character-app-password
EMAIL_FROM_NAME="IdeaJam 2026 Team"
EMAIL_FROM_ADDRESS=noreply@ideajam2026.com

CLIENT_URL=http://localhost:5173
```

> **Note for Gmail Users:**  
> 1. Go to your Google Account > Security > Enable 2-Step Verification.  
> 2. Create an **App Password** (Select "Mail" and device).  
> 3. Paste the generated 16-character password into `EMAIL_PASS`.

### 3. Start Server
```bash
# Production start
npm start

# Development mode with hot-reload
npm run dev
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/register` | Register team, save to MongoDB, and send automated emails to leader & all members |
| `GET` | `/api/registrations` | Fetch all registered teams (for admin view/export) |
| `GET` | `/api/registrations/:id` | Fetch single registration details by ID or registration code |
| `GET` | `/api/health` | Service health status |

---

## 🧪 Testing the API
You can run the built-in test script to verify registration & emails:
```bash
node test_register.js
```
