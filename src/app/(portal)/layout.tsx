import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";

/**
 * Authenticated portal layout.
 * Server component that checks for a valid session cookie.
 * Redirects to /login if no valid session exists.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    redirect("/login");
  }

  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) {
    redirect("/login");
  }

  const userId = await validateSession(sessionToken, redisUrl);
  if (!userId) {
    redirect("/login");
  }

  return (
    <div>
      <nav style={{ padding: "1rem", borderBottom: "1px solid #eee" }}>
        <span style={{ fontWeight: "bold" }}>RealValue AI</span>
      </nav>
      <main style={{ padding: "1rem" }}>{children}</main>
    </div>
  );
}
