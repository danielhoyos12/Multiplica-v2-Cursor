import { ConvexClientProvider } from "@/components/convex/convex-client-provider";

export default function ConvexDevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConvexClientProvider>{children}</ConvexClientProvider>;
}
