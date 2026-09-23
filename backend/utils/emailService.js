const https = require("https");
const nodemailer = require("nodemailer");
const PlatformSetting = require("../models/platformSettingSchema");

// ---------------------------------------------------------------------------
// Daily email quota accounting (24-hour rolling window).
//
//   DAILY_QUOTA         total emails allowed per rolling 24h (default 300).
//   IMPORTANT_THRESHOLD once this many emails were sent, ONLY important mail
//                       (OTP codes, account termination, teacher decisions)
//                       is delivered; routine notifications are silently
//                       dropped for the rest of the day. (default 220)
//
// The counter lives in the PlatformSetting collection so restarts do not
// reset it. The window resets on the first send after `startedAt + 24h`.
// ---------------------------------------------------------------------------
const DAILY_QUOTA = Number(process.env.EMAIL_DAILY_QUOTA) || 300;
const IMPORTANT_THRESHOLD = Number(process.env.EMAIL_IMPORTANT_THRESHOLD) || 220;
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

const getEmailQuotaState = async () => {
  const now = Date.now();
  const doc = await PlatformSetting.findOne({ key: "emailQuota" }).lean();

  if (!doc) {
    await PlatformSetting.create({ key: "emailQuota", value: { sent: 0, startedAt: now } });
    return { sent: 0, startedAt: now };
  }

  const startedAt = doc.value?.startedAt || now;
  if (now - startedAt >= QUOTA_WINDOW_MS) {
    await PlatformSetting.updateOne(
      { key: "emailQuota" },
      { $set: { value: { sent: 0, startedAt: now } } }
    );
    return { sent: 0, startedAt: now };
  }

  return { sent: doc.value?.sent || 0, startedAt };
};

const recordEmailSent = async () => {
  await PlatformSetting.updateOne({ key: "emailQuota" }, { $inc: { "value.sent": 1 } });
};

const getEmailQuotaStatus = async () => {
  const { sent, startedAt } = await getEmailQuotaState();
  const remaining = Math.max(DAILY_QUOTA - sent, 0);
  return {
    sent,
    dailyQuota: DAILY_QUOTA,
    importantThreshold: IMPORTANT_THRESHOLD,
    remaining,
    importantOnly: sent >= IMPORTANT_THRESHOLD,
    resetAt: new Date(startedAt + QUOTA_WINDOW_MS).toISOString(),
  };
};

// ---------------------------------------------------------------------------
// Multi-provider styled email utility.
//
// Delivery order (first success wins):
//   1. Brevo Transactional API (api.brevo.com)  — used when a Brevo API key is
//      configured. `family: 4` forces IPv4, fixing Render's ENETUNREACH issue.
//   2. Gmail SMTP via nodemailer                — uses EMAIL_USER + EMAIL_PASS
//      (A Gmail App Password). `family: 4` is forced here too.
//
// Never throws. Returns true if ANY provider delivered the email, otherwise
// logs every failure loudly and returns false so callers can surface the issue.
// ---------------------------------------------------------------------------

const buildHtml = ({ subject, title, bodyText, details = [], otpCode = null }) => {
  const timestamp = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  let otpBoxesHtml = "";
  if (otpCode) {
    const digits = otpCode.toString().padStart(6, "0").split("");
    otpBoxesHtml = `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
        <tr>
          ${digits
            .map(
              (digit) => `
            <td align="center" style="width: 44px; height: 52px; background-color: #27272a; border: 1px solid #3f3f46; border-radius: 8px; font-size: 22px; font-weight: 700; color: #ffffff; font-family: monospace; text-align: center; vertical-align: middle; padding: 0 4px;">
              ${digit}
            </td>
          `,
            )
            .join('<td style="width: 8px;"></td>')}
        </tr>
      </table>
    `;
  }

  const detailsHtml =
    details.length > 0
      ? `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; margin: 24px 0;">
      <tr>
        <td style="padding: 16px 20px;">
          ${details
            .map(
              (d) => `
            <div style="font-size: 13px; color: #a1a1aa; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
              <strong style="color: #f4f4f5; font-weight: 600;">${d.label}:</strong> <span style="color: #e4e4e7; font-weight: 500;">${d.value}</span>
            </div>
          `,
            )
            .join("")}
        </td>
      </tr>
    </table>
  `
      : "";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 0; color: #f4f4f5;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #09090b;">
        <tr>
          <td align="center">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #121215; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">

              <!-- Header Bar -->
              <tr>
                <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #27272a;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #f4f4f5; background: #27272a; padding: 6px 12px; border-radius: 6px; display: inline-block;">
                          PUCIT Classroom Portal
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 8px; font-size: 11px; color: #a1a1aa; font-weight: 500;">
                        Secure Academic Ecosystem
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Main Content Area -->
              <tr>
                <td style="padding: 32px;">
                  <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #f4f4f5; letter-spacing: -0.025em;">
                    ${title}
                  </h2>
                  <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                    ${bodyText}
                  </p>

                  ${otpBoxesHtml}
                  ${detailsHtml}

                  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #27272a; font-size: 12px; color: #71717a; line-height: 1.5;">
                    Automated secure notification.<br>
                    <span>Timestamp: ${timestamp}</span>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 16px 32px; background-color: #09090b; border-top: 1px solid #27272a; text-align: center;">
                  <p style="margin: 0; font-size: 11px; color: #71717a;">
                    Independent Academic Tool • Administered by <strong style="color: #a1a1aa;">Shehzada Ather</strong>
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return htmlContent;
};

// Single Brevo Transactional API request (api.brevo.com/v3/smtp/email)
const brevoRequest = (apiKey, payload) => {
  const options = {
    hostname: "api.brevo.com",
    path: "/v3/smtp/email",
    method: "POST",
    family: 4, // Force IPv4: fixes Render ENETUNREACH / IPv6 resolution issues
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
    },
    timeout: 12000,
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, statusCode: res.statusCode });
        } else {
          resolve({ ok: false, statusCode: res.statusCode, responseBody: data });
        }
      });
    });

    req.on("error", (err) => {
      resolve({ ok: false, statusCode: 0, errorMessage: err.message });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, statusCode: 0, errorMessage: "connection timed out" });
    });

    req.write(payload);
    req.end();
  });
};

// Brevo Transactional Email API (api.brevo.com/v3/smtp/email)
const sendViaBrevo = async (to, subject, htmlContent) => {
  // Accept either env var name for backward compatibility. We attempt each
  // candidate that is present; invalid keys fail fast with 401 and we fall back.
  const apiKeyCandidates = [
    process.env.BREVO_API_KEY,
    process.env.BREVO_SMTP_PASS,
  ].filter(Boolean);
  const senderEmail = process.env.EMAIL_USER;

  if (apiKeyCandidates.length === 0) {
    return { ok: false, reason: "No BREVO_API_KEY/BREVO_SMTP_PASS configured" };
  }
  if (!senderEmail) {
    return { ok: false, reason: "No EMAIL_USER configured" };
  }

  const payload = JSON.stringify({
    sender: {
      name: "PUCIT Portal System",
      email: senderEmail,
    },
    to: [{ email: to }],
    subject: `[PUCIT Portal] ${subject}`,
    htmlContent: htmlContent,
  });

  let lastDetail = null;
  for (const apiKey of apiKeyCandidates) {
    const result = await brevoRequest(apiKey, payload);
    if (result.ok) {
      return { ok: true, via: "Brevo API" };
    }
    lastDetail = result.responseBody || result.errorMessage || `HTTP ${result.statusCode}`;
  }

  return {
    ok: false,
    reason: "Brevo API request failed for all configured keys",
    responseBody: lastDetail,
  };
};

// Gmail SMTP via nodemailer (works with a Gmail App Password)
const sendViaGmail = async (to, subject, htmlContent) => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    return { ok: false, reason: "No EMAIL_USER/EMAIL_PASS configured" };
  }

  const transporter = nodemailer.createTransport({
    service: "Gmail",
    family: 4,
    auth: { user, pass },
    connectionTimeout: 10000,
    socketTimeout: 12000,
  });

  await transporter.sendMail({
    from: `"PUCIT Portal System" <${user}>`,
    to,
    subject: `[PUCIT Portal] ${subject}`,
    html: htmlContent,
  });

  return { ok: true, via: "Gmail SMTP" };
};

const sendStyledEmail = async ({ to, subject, title, bodyText, details, otpCode, importance = "normal" }) => {
  if (!to) return false;

  const isImportant = importance === "important";
  const { sent } = await getEmailQuotaState();

  if (sent >= DAILY_QUOTA) {
    console.log(`[emailService] DAILY EMAIL QUOTA EXHAUSTED (${sent}/${DAILY_QUOTA}). Blocked "${subject}" -> ${to}.`);
    return false;
  }

  if (!isImportant && sent >= IMPORTANT_THRESHOLD) {
    console.log(`[emailService] Quota ${sent}/${DAILY_QUOTA} hit important-reserve (${IMPORTANT_THRESHOLD}); dropped routine notification "${subject}" -> ${to}.`);
    return true;
  }

  const htmlContent = buildHtml({ subject, title, bodyText, details, otpCode });
  const failures = [];

  // Attempt 1: Brevo API
  try {
    const brevoResult = await sendViaBrevo(to, subject, htmlContent);
    if (brevoResult.ok) {
      await recordEmailSent();
      console.log(`[emailService] Delivered "${subject}" to ${to} via ${brevoResult.via}.`);
      return true;
    }
    if (brevoResult.responseBody) {
      console.error(`[emailService] Brevo error for "${subject}" -> ${to}:`, brevoResult.responseBody);
    } else {
      console.error(`[emailService] Brevo attempt failed for "${subject}" -> ${to}: ${brevoResult.reason}`);
    }
    failures.push(`Brevo: ${brevoResult.reason}`);
  } catch (err) {
    console.error(`[emailService] Brevo attempt threw for "${subject}" -> ${to}:`, err.message);
    failures.push(`Brevo: ${err.message}`);
  }

  // Attempt 2: Gmail SMTP fallback
  try {
    const gmailResult = await sendViaGmail(to, subject, htmlContent);
    if (gmailResult.ok) {
      await recordEmailSent();
      console.log(`[emailService] Delivered "${subject}" to ${to} via ${gmailResult.via}.`);
      return true;
    }
    console.error(`[emailService] Gmail SMTP attempt failed for "${subject}" -> ${to}: ${gmailResult.reason}`);
    failures.push(`Gmail SMTP: ${gmailResult.reason}`);
  } catch (err) {
    console.error(`[emailService] Gmail SMTP attempt threw for "${subject}" -> ${to}:`, err.message);
    failures.push(`Gmail SMTP: ${err.message}`);
  }

  console.error(`[emailService] ALL senders FAILED for "${subject}" -> ${to}. ${failures.join(" | ")}`);
  return false;
};

module.exports = sendStyledEmail;
module.exports.getEmailQuotaStatus = getEmailQuotaStatus;