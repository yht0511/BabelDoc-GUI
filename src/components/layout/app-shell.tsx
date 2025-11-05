import type { PropsWithChildren } from "react";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

const AppShell = ({ children }: PropsWithChildren) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <section className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-muted/20 px-8 py-6">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </section>
    </div>
  );
};

export default AppShell;
