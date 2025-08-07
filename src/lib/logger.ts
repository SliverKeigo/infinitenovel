import pino from "pino";

// A basic pino logger instance without transport to avoid worker threads in Next.js
const logger = pino({
  level: "info",
});

export default logger;
