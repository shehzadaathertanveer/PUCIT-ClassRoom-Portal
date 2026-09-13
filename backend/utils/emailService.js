const nodemailer = require("nodemailer");

const sendStyledEmail = async ({
  to,
  subject,
  title,
  bodyText,
  details = [],
  otpCode = null,
}) => {
  if (!to) return;
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

  try {
    // Transporter with forced IPv4 family fix for Render
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      family: 4, // <-- FORCES IPv4 AND FIXES RENDER ENETUNREACH ERROR
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      connectionTimeout: 10000,
      socketTimeout: 10000,
    });

    await transporter.sendMail({
      from: '"PUCIT Portal System" <no-reply@pucit.edu.pk>',
      to,
      subject: `[PUCIT Portal] ${subject}`,
      html: htmlContent,
    });
  } catch (err) {
    console.error("Failed to send styled email notification:", err.message);
  }
};

module.exports = sendStyledEmail;