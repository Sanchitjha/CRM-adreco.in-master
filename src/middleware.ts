import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = [
  "/login",
  "/api/health",
  "/api/cron/digest",
  "/api/integrations/zoho/webhook",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/integrations");

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/",