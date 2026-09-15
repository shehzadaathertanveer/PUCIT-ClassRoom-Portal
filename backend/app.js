const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const AppError = require("./utils/appError");
const authController = require("./controller/authController"); 
const authRoutes = require("./routes/authRoutes");
const classroomRoutes = require("./routes/classroomRoutes");
const marksRoutes = require("./routes/marksRoutes");
const labRoutes = require("./routes/labRoutes");
const labMarkRoutes = require("./routes/labMarkRoutes");

const app = express();

app.set("trust proxy", 1);

// Security & Parsing
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true,
  }),
);

const limiter = rateLimit({
  max: 300,
  windowMs: 15 * 60 * 1000,
  message: "Too many requests from this IP, please try again in 15 minutes!",
});
app.use("/api", limiter);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// =============================================================================
// RENDER PINGER HEALTH CHECK (Placed before maintenance mode so pinger stays green)
// =============================================================================
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "awake", timestamp: new Date() });
});

// 🛑 GLOBAL MAINTENANCE MODE INTERCEPTOR
app.use(authController.checkMaintenanceMode);

// Route Export Safety Validations
if (typeof authRoutes !== "function") {
  throw new Error(
    "CRASH SOURCE FOUND: ./routes/authRoutes.js is not exporting a router properly!",
  );
}
if (typeof classroomRoutes !== "function") {
  throw new Error(
    "CRASH SOURCE FOUND: ./routes/classroomRoutes.js is not exporting a router properly!",
  );
}
if (typeof marksRoutes !== "function") {
  throw new Error(
    "CRASH SOURCE FOUND: ./routes/marksRoutes.js is not exporting a router properly!",
  );
}
if (typeof labRoutes !== "function") {
  throw new Error(
    "CRASH SOURCE FOUND: ./routes/labRoutes.js is not exporting a router properly!",
  );
}
if (typeof labMarkRoutes !== "function") {
  throw new Error(
    "CRASH SOURCE FOUND: ./routes/labMarkRoutes.js is not exporting a router properly!",
  );
}

// Mount API v1 Routes
// =============================================================================
// MOUNT API ROUTES (Dual-supported for both /api/v1 and /api prefixes)
// =============================================================================

// v1 Mounts
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/classrooms", classroomRoutes);
app.use("/api/v1/marks", marksRoutes);
app.use("/api/v1/classroommarks", marksRoutes);
app.use("/api/v1/labrooms", labRoutes);
app.use("/api/v1/labmarks", labMarkRoutes);

// Legacy / Direct /api Fallback Mounts (Prevents 404s if frontend base URL omits /v1)
app.use("/api/auth", authRoutes);
app.use("/api/classrooms", classroomRoutes);
app.use("/api/marks", marksRoutes);
app.use("/api/classroommarks", marksRoutes);
app.use("/api/labrooms", labRoutes);
app.use("/api/labmarks", labMarkRoutes);

// Handle Unhandled Routes (Fixed for Express 5 path-to-regexp compatibility)
app.all(/(.*)/, (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// =============================================================================
// GLOBAL ERROR HANDLER (Consolidated to prevent request hanging)
// =============================================================================
app.use((err, req, res, next) => {
  console.error("ERROR 💥", err);

  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((el) => el.message);
    err.statusCode = 400;
    err.message = `Invalid input data: ${errors.join(". ")}`;
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    err.statusCode = 400;
    err.message = `A record with that ${field} already exists!`;
  }

  if (err.name === "CastError") {
    err.statusCode = 400;
    err.message = `Invalid ${err.path}: ${err.value}`;
  }

  if (err.name === "JsonWebTokenError") {
    err.statusCode = 401;
    err.message = "Invalid token. Please log in again!";
  }

  if (err.name === "TokenExpiredError") {
    err.statusCode = 401;
    err.message = "Your token has expired! Please log in again.";
  }

  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

module.exports = app;


