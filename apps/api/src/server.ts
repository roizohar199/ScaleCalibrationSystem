import express from "express";
import { createServer } from "http";
import { initSocket } from "./socket.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import { loadEnv } from "./config/loadEnv.js";

// טוען ENV לפני כל ה-imports "כבדים"
try {
  loadEnv();
} catch (error: any) {
  console.error("❌ Failed to load environment:", error.message);
  process.exit(1);
}

import { authRouter } from "./modules/auth/router.js";
import { customersRouter } from "./modules/customers/router.js";
import { scalesRouter } from "./modules/scales/router.js";
import { calibrationsRouter } from "./modules/calibrations/router.js";
import { approvalsRouter } from "./modules/approvals/router.js";
import { certificatesRouter } from "./modules/certificates/router.js";
import { importsRouter } from "./modules/imports/router.js";
import { documentsRouter } from "./modules/imports/documents.js";
import { tolerancesRouter } from "./modules/tolerances/router.js";
import { scaleModelsRouter } from "./modules/scale-models/router.js";
import { auditRouter } from "./modules/audit/router.js";
import { oimlRouter } from "./modules/oiml/router.js";
import { pdfRouter } from "./modules/pdf/routes.js";

const app = express();

const CLIENT_ORIGINS = process.env.CLIENT_ORIGIN 
  ? process.env.CLIENT_ORIGIN.split(',').map(origin => origin.trim())
  : [
      'http://localhost:5175',
      'http://192.168.68.103:5175'
    ];

app.use(cors({
  origin: CLIENT_ORIGINS,
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/auth", authRouter);

app.use("/api/customers", customersRouter);
app.use("/api/scales", scalesRouter);
app.use("/api/calibrations", calibrationsRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/certificates", certificatesRouter);
app.use("/api/imports", importsRouter);
app.use("/api/imports", documentsRouter);
app.use("/api/tolerances", tolerancesRouter);
app.use("/api/scale-models", scaleModelsRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/oiml", oimlRouter);
app.use("/api/pdf", pdfRouter);

// Error handler כדי שלא "ימות" בלי מידע
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("🔥 API ERROR:", err);
  res.status(500).json({ message: "Internal server error", error: err?.message });
});

const port = Number(process.env.PORT || 4010);
const server = createServer(app);

// initialize socket.io
initSocket(server);

server.listen(port, () => {
  console.log(`✅ API listening on http://localhost:${port}`);
});
