import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const statusColorMap: Record<string, string> = {
  success: "text-emerald-500",
  error: "text-destructive",
  running: "text-amber-500",
  pending: "text-muted-foreground",
};

const Topbar = () => {
  const activeView = useAppStore((state) => state.activeView);
  const environmentStatuses = useAppStore((state) => state.environmentStatuses);

  const subtitle =
    {
      start: "快速提交论文翻译任务并查看实时日志",
      history: "追溯翻译记录，快速检索目标论文",
      settings: "配置 LLM 接口、BabelDOC 参数以及应用主题",
    }[activeView] ?? "";

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card/60 px-6 backdrop-blur">
      <div>
        <h2 className="text-lg font-semibold leading-tight capitalize">
          {activeView === "start"
            ? "开始翻译"
            : activeView === "history"
            ? "翻译历史"
            : "设置"}
        </h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-4 text-xs">
        {Object.values(environmentStatuses).map((status) => (
          <div key={status.stage} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex h-2 w-2 rounded-full",
                status.status === "success"
                  ? "bg-emerald-500"
                  : status.status === "error"
                  ? "bg-destructive"
                  : status.status === "running"
                  ? "bg-amber-500"
                  : "bg-muted-foreground"
              )}
            />
            <span className="font-medium capitalize">
              {status.stage === "uv-bin-dir" ? "BabelDOC 路径" : status.stage}
            </span>
            <span className={cn(statusColorMap[status.status])}>
              {status.status === "success"
                ? "就绪"
                : status.status === "error"
                ? "失败"
                : status.status === "running"
                ? "检测中"
                : "待检测"}
            </span>
          </div>
        ))}
      </div>
    </header>
  );
};

export default Topbar;
