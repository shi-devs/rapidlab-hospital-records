import { env } from "cloudflare:workers";

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;

function runtimeValue(key: string) {
  return (env as unknown as Record<string, string | undefined>)[key]?.trim() ?? "";
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createVerificationCode() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return random.toString().padStart(6, "0");
}

export function createCodeSalt() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

export function verificationTimes(now = new Date()) {
  return {
    expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000),
    resendAfter: new Date(now.getTime() + OTP_RESEND_SECONDS * 1000),
  };
}

export async function hashVerificationCode(email: string, code: string, salt: string) {
  const secret = runtimeValue("OTP_HASH_SECRET");
  if (!secret) throw new Error("OTP_HASH_SECRET is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${email}:${code}:${salt}`),
  );
  return bytesToHex(new Uint8Array(signature));
}

export function verificationCodeMatches(candidate: string, expected: string) {
  if (candidate.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function sendVerificationEmail(email: string, name: string, code: string) {
  const apiKey = runtimeValue("BREVO_API_KEY");
  const senderEmail = runtimeValue("BREVO_SENDER_EMAIL");
  if (!apiKey || !senderEmail) throw new Error("Email delivery is not configured");

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: "RapidLab", email: senderEmail },
      to: [{ email, name }],
      subject: `${code} is your RapidLab verification code`,
      textContent: `Your RapidLab verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. If you did not request this account, ignore this email.`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#173b30"><h1 style="font-size:24px">Verify your RapidLab email</h1><p>Hello ${escapeHtml(name)},</p><p>Enter this code to finish creating your staff account:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#eef5ed;padding:18px 22px;border-radius:12px;text-align:center">${code}</p><p>This code expires in ${OTP_TTL_MINUTES} minutes. If you did not request this account, you can ignore this email.</p></div>`,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error("Brevo verification email failed", response.status, detail);
    throw new Error("Verification email could not be sent");
  }
}

export async function sendAccessRemovedEmail(email: string, name: string, hospitalName: string) {
  const apiKey = runtimeValue("BREVO_API_KEY");
  const senderEmail = runtimeValue("BREVO_SENDER_EMAIL");
  if (!apiKey || !senderEmail) throw new Error("Email delivery is not configured");

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: "RapidLab", email: senderEmail },
      to: [{ email, name }],
      subject: `Your RapidLab access to ${hospitalName} was removed`,
      textContent: `Hello ${name}, your RapidLab login and membership for ${hospitalName} have been removed by a Hospital Admin. You can no longer access that hospital workspace. Patient records and uploaded reports you created remain securely stored with the hospital for clinical continuity and audit history.`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;color:#173b30"><h1 style="font-size:24px">Hospital access removed</h1><p>Hello ${escapeHtml(name)},</p><p>A Hospital Admin removed your RapidLab login and membership for <strong>${escapeHtml(hospitalName)}</strong>.</p><p>You can no longer access that hospital workspace. Patient records and uploaded reports you created remain securely stored with the hospital for clinical continuity and audit history.</p><p style="color:#6c7f76">If you believe this was a mistake, contact your Hospital Admin.</p></div>`,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error("Brevo access removal email failed", response.status, detail);
    throw new Error("Access removal email could not be sent");
  }
}

export async function sendAccountDeletedEmail(email: string, name: string, hospitalName: string) {
  const apiKey = runtimeValue("BREVO_API_KEY");
  const senderEmail = runtimeValue("BREVO_SENDER_EMAIL");
  if (!apiKey || !senderEmail) throw new Error("Email delivery is not configured");

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: "RapidLab", email: senderEmail },
      to: [{ email, name }],
      subject: "Your RapidLab staff account was deleted",
      textContent: `Hello ${name}, your RapidLab staff account and access to ${hospitalName} were deleted at your request. You can no longer sign in with this account. Patient records and uploaded reports you created remain securely stored with the hospital for clinical continuity and audit history.`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;color:#173b30"><h1 style="font-size:24px">Staff account deleted</h1><p>Hello ${escapeHtml(name)},</p><p>Your RapidLab staff account and access to <strong>${escapeHtml(hospitalName)}</strong> were deleted at your request.</p><p>You can no longer sign in with this account. Patient records and uploaded reports you created remain securely stored with the hospital for clinical continuity and audit history.</p><p style="color:#6c7f76">If you did not request this, contact your Hospital Admin.</p></div>`,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error("Brevo account deletion email failed", response.status, detail);
    throw new Error("Account deletion email could not be sent");
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}
