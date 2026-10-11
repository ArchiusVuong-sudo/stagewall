import type { Metadata } from "next";
import { LiveProvider } from "@/components/LiveProvider";
import { ManageView } from "@/components/ManageView";

export const metadata: Metadata = { title: "Your message - stagewall", robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <LiveProvider>
      <div className="min-h-screen bg-gradient-to-b from-[#16142b] to-[#0b0c14]">
        <ManageView token={token} />
      </div>
    </LiveProvider>
  );
}
