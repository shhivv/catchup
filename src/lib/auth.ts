import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.CATCHUP_SECRET || "change-me-in-production"
);
const PASSWORD = process.env.CATCHUP_PASSWORD || "catchup";
const API_KEY = process.env.CATCHUP_API_KEY || "catchup-extension-key";

export async function verifyPassword(password: string): Promise<boolean> {
  return password === PASSWORD;
}

export function verifyApiKey(key: string): boolean {
  return key === API_KEY;
}

export async function createSession(): Promise<string> {
  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifySession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return false;
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}
