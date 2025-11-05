import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useAppStore, type ViewKey } from "@/stores/app-store";
import {
  FileText,
  History as HistoryIcon,
  Settings as SettingsIcon,
  PanelsTopLeft,
} from "lucide-react";

interface SidebarNavItem {
  key: ViewKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
}

const NAV_ITEMS: SidebarNavItem[] = [
  {
    key: "start",
    label: "开始翻译",
    description: "添加 PDF 或链接并监控翻译队列",
    icon: FileText,
  },
  {
    key: "history",
    label: "翻译历史",
    description: "回顾已完成任务并快速检索",
    icon: HistoryIcon,
  },
  {
    key: "settings",
    label: "设置",
    description: "管理 LLM、BabelDOC 与界面选项",
    icon: SettingsIcon,
  },
];

const Sidebar = () => {
  const activeView = useAppStore((state) => state.activeView);
  const setActiveView = useAppStore((state) => state.setActiveView);

  return (
    <aside className="flex h-full w-72 flex-col border-r bg-card/40">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <PanelsTopLeft className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">BabelDOC GUI</p>
          <p className="text-xs text-muted-foreground">智能学术翻译工作台</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveView(item.key)}
              className={cn(
                "group flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted/60 text-foreground"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              <span className="text-xs text-muted-foreground group-hover:text-muted-foreground/80">
                {item.description}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="border-t px-6 py-4 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Teclab</p>
        <p>BY 杨浩天</p>
      </div>
    </aside>
  );
};

export default Sidebar;
