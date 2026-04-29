import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RealValue AI",
  description: "AI-powered financial assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
