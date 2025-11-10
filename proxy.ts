// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PLAIN_PASSWORD = process.env.PLAIN_PASSWORD;

function unauthorized(message = "Unauthorized") {
  return new NextResponse(message, {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Restricted"' },
  });
}

export function proxy(req: NextRequest) {
  if (!PLAIN_PASSWORD) {
    return new NextResponse("Password not set in env var", { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return unauthorized();

  const [scheme, credentials] = authHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "basic" || !credentials) return unauthorized();

  let decoded: string;
  try {
    decoded =
      typeof atob === "function"
        ? atob(credentials)
        : Buffer.from(credentials, "base64").toString("utf8");
  } catch {
    return unauthorized();
  }

  const hasColon = decoded.includes(":");
  const password = hasColon ? decoded.split(":").slice(1).join(":") : decoded;

  if (password === PLAIN_PASSWORD) return NextResponse.next();

  return unauthorized();
}

export const config = {
  matcher: ["/:path*"],
};
