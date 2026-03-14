import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import nodemailer from "nodemailer";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import prisma from "./db.js";
import { startResearch, getJobStatus } from "./services/agent-orchestrator.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "research-hub-dev-secret";
const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "";

// Trust first proxy hop (Render/Railway/Fly/etc.) so req.ip and secure headers are correct.
app.set("trust proxy", 1);

// OTP valid for 5 min; after verification the window lasts 10 min to call register/login
const OTP_TTL_MS = 5 * 60 * 1000;
const VERIFIED_TTL_MS = 10 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function validatePurpose(purpose) {
  return purpose === "register" || purpose === "login";
}

function issueAccessToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revoked: false,
    },
  });
  return raw;
}

async function rotateRefreshToken(oldRawToken, userId) {
  const oldHash = crypto.createHash("sha256").update(oldRawToken).digest("hex");
  await prisma.refreshToken.updateMany({
    where: { tokenHash: oldHash, userId, revoked: false },
    data: { revoked: true },
  });
  return issueRefreshToken(userId);
}

async function sendOtpEmail(email, otp, purpose) {
  const host = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!host || !user || !pass || !from) {
    return { sent: false };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user, pass },
  });

  const label = purpose === "register" ? "registration" : "login";
  await transporter.sendMail({
    from,
    to: email,
    subject: `ResearchHub ${label} OTP`,
    text: `Your ResearchHub OTP is ${otp}. It expires in 5 minutes.`,
    html: `<p>Your <strong>ResearchHub</strong> OTP is:</p><h2 style="letter-spacing:2px">${otp}</h2><p>This code expires in 5 minutes.</p>`,
  });

  return { sent: true };
}

// ── Auth Middleware ───────────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = { id: payload.userId, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request payload",
        details: parsed.error.issues.map((i) => i.message),
      });
    }
    req.validatedBody = parsed.data;
    next();
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests. Please try again later." },
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP attempts. Please wait and try again." },
});

const schemas = {
  startResearch: z.object({ query: z.string().trim().min(1).max(500) }),
  requestOtp: z.object({
    email: z.string().trim().email(),
    purpose: z.enum(["register", "login"]),
  }),
  verifyOtp: z.object({
    email: z.string().trim().email(),
    purpose: z.enum(["register", "login"]),
    otp: z.string().trim().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
  }),
  register: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    password: z.string().min(6).max(200),
  }),
  login: z.object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(200),
  }),
  refresh: z.object({ refreshToken: z.string().min(32).max(512) }),
};

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests and local dev when FRONTEND_ORIGIN is unset.
      if (!origin) return callback(null, true);
      if (!FRONTEND_ORIGIN) return callback(null, true);
      if (origin === FRONTEND_ORIGIN) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: false,
  })
);
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "glow-research-backend", timestamp: new Date().toISOString() });
});

// ── Research Routes (require valid JWT) ───────────────────────────────────────

app.post("/api/research/start", authMiddleware, validateBody(schemas.startResearch), (req, res) => {
  try {
    const { query } = req.validatedBody;
    const jobId = startResearch(query, req.user.id);
    return res.json({ ok: true, jobId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/research/status/:jobId", authMiddleware, async (req, res) => {
  const { jobId } = req.params;
  const job = await getJobStatus(jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired" });
  return res.json({ ok: true, job });
});

app.post("/api/research/synthesize/:jobId", authMiddleware, async (req, res) => {
  const { jobId } = req.params;
  const job = await getJobStatus(jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired" });
  if (job.status !== "completed" || !job.result) {
    return res.status(409).json({ error: "Synthesis is not ready yet" });
  }
  const synthesis =
    typeof job.result?.synthesis?.summary === "string"
      ? job.result.synthesis.summary
      : typeof job.result?.synthesis === "string"
      ? job.result.synthesis
      : "";
  return res.json({ ok: true, synthesis });
});

// GET /api/research/history — authenticated user's completed research jobs
app.get("/api/research/history", authMiddleware, async (req, res) => {
  try {
    const jobs = await prisma.researchJob.findMany({
      where: { userId: req.user.id, status: "completed" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, query: true, result: true, createdAt: true },
    });
    const items = jobs.map((j) => ({
      id: j.id,
      query: j.query,
      viewedAt: j.createdAt.toISOString(),
      result: j.result ? JSON.parse(j.result) : null,
    }));
    return res.json({ ok: true, items });
  } catch (err) {
    console.error("[History]", err);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ── OTP Routes ────────────────────────────────────────────────────────────────

app.post("/api/auth/request-otp", authLimiter, otpLimiter, validateBody(schemas.requestOtp), async (req, res) => {
  try {
    const email = req.validatedBody.email.toLowerCase();
    const purpose = req.validatedBody.purpose;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (purpose === "login" && !existingUser) {
      return res.status(404).json({ error: "No account found for this email" });
    }
    if (purpose === "register" && existingUser) {
      return res.status(409).json({ error: "Account already exists for this email" });
    }

    const otp = generateOtp();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    await prisma.otpToken.upsert({
      where: { email_purpose: { email, purpose } },
      create: { email, purpose, otpHash, expiresAt: new Date(Date.now() + OTP_TTL_MS), verified: false },
      update: { otpHash, expiresAt: new Date(Date.now() + OTP_TTL_MS), verified: false },
    });

    const mailResult = await sendOtpEmail(email, otp, purpose);
    if (!mailResult.sent) {
      console.log(`[DEV OTP] ${purpose} ${email}: ${otp}`);
      const isProd = process.env.NODE_ENV === "production";
      if (isProd) {
        return res.status(500).json({ error: "SMTP is not configured" });
      }
      return res.json({ ok: true, message: "OTP generated (dev mode — SMTP not configured).", dev_otp: otp });
    }
    return res.json({ ok: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error("[Request OTP]", err);
    return res.status(500).json({ error: "Failed to send OTP" });
  }
});

app.post("/api/auth/verify-otp", authLimiter, otpLimiter, validateBody(schemas.verifyOtp), async (req, res) => {
  try {
    const email = req.validatedBody.email.toLowerCase();
    const purpose = req.validatedBody.purpose;
    const otp = req.validatedBody.otp;

    const record = await prisma.otpToken.findUnique({ where: { email_purpose: { email, purpose } } });
    if (!record || record.verified) return res.status(400).json({ error: "OTP expired or not requested" });
    if (new Date() > record.expiresAt) return res.status(400).json({ error: "OTP expired" });

    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (record.otpHash !== otpHash) return res.status(401).json({ error: "Invalid OTP" });

    await prisma.otpToken.update({
      where: { email_purpose: { email, purpose } },
      data: { verified: true, expiresAt: new Date(Date.now() + VERIFIED_TTL_MS) },
    });
    return res.json({ ok: true, message: "OTP verified" });
  } catch (err) {
    console.error("[Verify OTP]", err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

async function consumeVerifiedOtp(email, purpose) {
  const record = await prisma.otpToken.findUnique({ where: { email_purpose: { email, purpose } } });
  if (!record || !record.verified || new Date() > record.expiresAt) return false;
  await prisma.otpToken.delete({ where: { email_purpose: { email, purpose } } });
  return true;
}

// ── Auth Routes ───────────────────────────────────────────────────────────────

app.post("/api/auth/register", authLimiter, validateBody(schemas.register), async (req, res) => {
  try {
    const name = req.validatedBody.name;
    const email = req.validatedBody.email.toLowerCase();
    const password = req.validatedBody.password;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Account already exists" });

    if (!(await consumeVerifiedOtp(email, "register"))) {
      return res.status(401).json({ error: "OTP verification required" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, name: true, email: true },
    });

    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);

    return res.json({ ok: true, user, token: accessToken, refreshToken });
  } catch (err) {
    console.error("[Register]", err);
    return res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", authLimiter, validateBody(schemas.login), async (req, res) => {
  try {
    const email = req.validatedBody.email.toLowerCase();
    const password = req.validatedBody.password;

    const stored = await prisma.user.findUnique({ where: { email } });
    if (!stored) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, stored.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    if (!(await consumeVerifiedOtp(email, "login"))) {
      return res.status(401).json({ error: "OTP verification required" });
    }

    const user = { id: stored.id, name: stored.name, email: stored.email };
    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    return res.json({ ok: true, user, token: accessToken, refreshToken });
  } catch (err) {
    console.error("[Login]", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/refresh", authLimiter, validateBody(schemas.refresh), async (req, res) => {
  try {
    const raw = req.validatedBody.refreshToken;
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    const tokenRecord = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!tokenRecord || tokenRecord.revoked || new Date() > tokenRecord.expiresAt) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: tokenRecord.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) return res.status(401).json({ error: "User not found" });

    const nextRefreshToken = await rotateRefreshToken(raw, user.id);
    const nextAccessToken = issueAccessToken(user);

    return res.json({ ok: true, token: nextAccessToken, refreshToken: nextRefreshToken, user });
  } catch (err) {
    console.error("[Refresh]", err);
    return res.status(500).json({ error: "Failed to refresh session" });
  }
});

app.post("/api/auth/logout", validateBody(schemas.refresh), async (req, res) => {
  try {
    const raw = req.validatedBody.refreshToken;
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[Logout]", err);
    return res.status(500).json({ error: "Logout failed" });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
