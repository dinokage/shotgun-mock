import nodemailer from "nodemailer";

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
    subject: `You're invited to join ${tenantName} on Forge`,
    text: `You've been invited to join ${tenantName} on Forge as ${roleName}.\n\nAccept your invite: ${inviteUrl}\n\nThis link expires in 7 days.`,
    html: `
      <p>You've been invited to join <strong>${tenantName}</strong> on Forge as <strong>${roleName}</strong>.</p>
      <p><a href="${inviteUrl}">Accept your invite</a></p>
      <p style="color:#666;font-size:12px">This link expires in 7 days. If the button doesn't work, copy this link: ${inviteUrl}</p>
    `,
  });
}
