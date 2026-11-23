import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = [
  "/login",
  "/api/health",
  "/api/cron/digest",
  "/api/integrations/zoho/webhook",
];

/** Where someone with a temporary password is kept until they have chosen their own. */
const CHANGE_PASSWORD_PATH = "/change-password";

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
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  if (isLoggedIn && req.auth?.user.mustChangePassword && !isPublic && pathname !== CHANGE_PASSWORD_PATH) {
    return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, req.nextUrl.origin));
  }
});

export const config = {
  // The app's own icons, manifest and logo are fetched by a phone, and by the sign-in page, without a sign-in, so they must
  // not be sent to the login page. A new file that the sign-in page shows has to be added here (src/proxy.test.ts checks).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-icon.png|icons/|adreco-logo.png).*)"],
};
