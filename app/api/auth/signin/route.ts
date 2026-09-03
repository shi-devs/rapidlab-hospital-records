import { createSession, getAccountByEmail, isValidEmail, normalizeEmail, verifyPassword } from "@/lib/auth";
import { getStaffContextForEmail } from "@/lib/access";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { email?: string; password?: string };
    const email = normalizeEmail(payload.email ?? "");
    const password = payload.password ?? "";
    if (!isValidEmail(email) || !password) return Response.json({ error: "Enter your email and password" }, { status: 400 });

    const account = await getAccountByEmail(email);
    if (!account || !(await verifyPassword(password, account))) {
      return Response.json({ error: "Incorrect email or password" }, { status: 401 });
    }

    await createSession(email);
    const context = await getStaffContextForEmail(email);
    return Response.json({ user: context.user, profile: context.profile });
  } catch {
    return Response.json({ error: "Could not sign in. Please try again." }, { status: 500 });
  }
}
