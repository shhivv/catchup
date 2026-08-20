const PASSWORD = process.env.CATCHUP_PASSWORD || "catchup";
const API_KEY = process.env.CATCHUP_API_KEY || "catchup-extension-key";

export function verifyPassword(password: string): boolean {
  return password === PASSWORD;
}

export function verifyApiKey(key: string): boolean {
  return key === API_KEY;
}

export function verifyRequest(request: Request): boolean {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && verifyApiKey(apiKey)) return true;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && verifyApiKey(auth.slice(7))) return true;

  return false;
}
