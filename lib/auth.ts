import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { authAccounts, authSessions } from "@/db/schema";

const SESSION_COOKIE = "rapidlab_session";
const SESSION_DAYS = 7;
// Cloudflare Workers currently caps a single PBKDF2 operation at 100,000
// iterations. Keeping the stored count explicit lets us raise it later without
// invalidating passwords created today.
const PASSWORD_ITERATIONS = 100_000;

export type AuthenticatedUser = { email: string };

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return new Uint8Array();
  return new Uint8Array(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

function randomHex(length: number) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(length)));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function derivePasswordHash(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function validatePassword(value: string) {
  if (value.length < 10) return "Use at least 10 characters for your password";
  if (value.length > 128) return "Password must be 128 characters or fewer";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Include at least one letter and one number";
  return null;
}

export async function makePasswordCredential(password: string) {
  const salt = randomHex(16);
  return {
    passwordSalt: salt,
    passwordHash: await derivePasswordHash(password, salt, PASSWORD_ITERATIONS),
    passwordIterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password: string, account: { passwordHash: string; passwordSalt: string; passwordIterations: number }) {
  const candidate = await derivePasswordHash(password, account.passwordSalt, account.passwordIterations);
  return constantTimeEqual(candidate, account.passwordHash);
}

export async function createSession(email: string) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getDb().insert(authSessions).values({ tokenHash, email, expiresAt, createdAt: now });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(authSessions).where(eq(authSessions.tokenHash, await sha256(token)));
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = new Date();
  const [session] = await getDb().select({ email: authSessions.email })
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now)))
    .limit(1);
  if (!session) return null;
  return { email: normalizeEmail(session.email) };
}

export async function getAccountByEmail(email: string) {
  const [account] = await getDb().select().from(authAccounts).where(eq(authAccounts.email, normalizeEmail(email))).limit(1);
  return account ?? null;
}
