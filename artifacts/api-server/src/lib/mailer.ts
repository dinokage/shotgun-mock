import nodemailer from "nodemailer";

// Every value interpolated into an HTML email body below ultimately traces
// back to a name someone typed into the app (tenant name, role name,
// project/episode/shot name via describeScope) -- none of it is truly
// "system-generated" the way a UUID or the SMTP-configured URLs are.
// Escaping before interpolation stops a `<a href="evil">` planted in one of
// those names from rendering as a real, clickable link in an email a real
// client receives.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Strips newlines from a value headed into an email subject line -- a
// literal \n/\r in a mail header lets it inject additional headers (e.g. a
// spoofed Bcc), the email equivalent of HTTP response splitting.
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

// SMTP credentials come from the environment only -- never hardcoded here.
// A missing SMTP_PASSWORD is a real deploy-config error, not something to
// silently no-op past, so sendInviteEmail throws rather than swallowing it.
function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD missing)",
    );
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendInviteEmail(params: {
  to: string;
  inviteUrl: string;
  roleName: string;
  tenantName: string;
}) {
  const { to, inviteUrl, roleName, tenantName } = params;
  const fromName = process.env.SMTP_FROM_NAME || "Forge";
  const fromAddress = process.env.SMTP_USER;
  const transport = getTransport();
  await transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: sanitizeHeaderValue(`You're invited to join ${tenantName} on Forge`),
    text: `You've been invited to join ${tenantName} on Forge as ${roleName}.\n\nAccept your invite: ${inviteUrl}\n\nThis link expires in 7 days.`,
    html: `
      <p>You've been invited to join <strong>${escapeHtml(tenantName)}</strong> on Forge as <strong>${escapeHtml(roleName)}</strong>.</p>
      <p><a href="${inviteUrl}">Accept your invite</a></p>
      <p style="color:#666;font-size:12px">This link expires in 7 days. If the button doesn't work, copy this link: ${inviteUrl}</p>
    `,
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}) {
  const { to, name, resetUrl, expiresInMinutes } = params;
  const fromName = process.env.SMTP_FROM_NAME || "Forge";
  const fromAddress = process.env.SMTP_USER;
  const transport = getTransport();
  await transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: sanitizeHeaderValue("Reset your Forge password"),
    text: `Hi ${name},\n\nSomeone asked to reset the password on your Forge account.\n\nReset it here: ${resetUrl}\n\nThis link works once and expires in ${expiresInMinutes} minutes. If you didn't ask for this, you can ignore this email -- your password stays as it is.`,
    html: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Someone asked to reset the password on your Forge account.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p style="color:#666;font-size:12px">This link works once and expires in ${expiresInMinutes} minutes. If the button doesn't work, copy this link: ${resetUrl}</p>
      <p style="color:#666;font-size:12px">If you didn't ask for this, you can ignore this email — your password stays as it is.</p>
    `,
  });
}

export async function sendClientAccessEmail(params: {
  to: string;
  reviewUrl: string;
  code: string;
  tenantName: string;
  scopeLabel: string;
}) {
  const { to, reviewUrl, code, tenantName, scopeLabel } = params;
  const fromName = process.env.SMTP_FROM_NAME || "Forge";
  const fromAddress = process.env.SMTP_USER;
  const transport = getTransport();
  await transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: sanitizeHeaderValue(`${tenantName} shared ${scopeLabel} with you for review`),
    text: `${tenantName} has shared ${scopeLabel} with you for review on Forge.\n\nReview it here: ${reviewUrl}\n\nYour access code: ${code}\n\nKeep this code private -- anyone with it can view the shared content.`,
    html: `
      <p><strong>${escapeHtml(tenantName)}</strong> has shared <strong>${escapeHtml(scopeLabel)}</strong> with you for review on Forge.</p>
      <p><a href="${reviewUrl}">Review it here</a></p>
      <p>Your access code: <strong style="font-size:18px;letter-spacing:2px">${escapeHtml(code)}</strong></p>
      <p style="color:#666;font-size:12px">Keep this code private -- anyone with it can view the shared content. If the button doesn't work, copy this link: ${reviewUrl}</p>
    `,
  });
}
