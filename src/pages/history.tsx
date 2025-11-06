import { useMemo, useState } from "react";
import electron from "../lib/electron";
import { useAppStore } from "@/stores/app-store";
import type { TranslationJobStatus, TranslationRecord } from "@/types/ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatDateTime } from "@/lib/utils";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Info,
  ListFilter,
  Search,
  Trash2,
} from "lucide-react";

const statusMeta: Record<
  TranslationJobStatus,
  {
    label: string;
    description: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  queued: {
    label: "排队中",
    description: "仍在队列等待翻译",
    variant: "secondary",
  },
  running: {
    label: "运行中",
    description: "正在处理或等待输出",
    variant: "default",
  },
  "llm-path": {
    label: "整理路径",
    description: "正在生成智能归档建议",
    variant: "default",
  },
  "awaiting-user": {
    label: "待保存",
    description: "等待确认保存目录",
    variant: "secondary",
  },
  success: {
    label: "已完成",
    description: "翻译结果已保存",
    variant: "default",
  },
  failed: {
    label: "失败",
    description: "翻译过程中出现错误",
    variant: "destructive",
  },
};

const statusOptions: Array<{ value: TranslationJobStatus; label: string }> = [
  { value: "queued", label: statusMeta.queued.label },
  { value: "running", label: statusMeta.running.label },
  { value: "llm-path", label: statusMeta["llm-path"].label },
  { value: "awaiting-user", label: statusMeta["awaiting-user"].label },
  { value: "success", label: statusMeta.success.label },
  { value: "failed", label: statusMeta.failed.label },
];

const HistoryPage = () => {
  const history = useAppStore((state) => state.history);
  const removeHistory = useAppStore((state) => state.removeHistory);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | TranslationJobStatus
  >("all");
  const [selectedRecord, setSelectedRecord] =
    useState<TranslationRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    return history.reduce((acc, record) => {
      acc[record.status] = (acc[record.status] ?? 0) + 1;
      return acc;
    }, {} as Record<TranslationJobStatus, number>);
  }, [history]);

  const filteredRecords = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return history.filter((record) => {
      const statusMatch =
        statusFilter === "all" || record.status === statusFilter;
      if (!statusMatch) return false;
      if (!keyword) return true;
      const haystack = [
        record.title,
        record.authors,
        record.abstractSnippet,
        record.sourcePath,
        record.translatedPath,
        record.savePath,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [history, searchTerm, statusFilter]);

  const handleOpenRecord = async (record: TranslationRecord) => {
    if (!electron) {
      setPageError("当前环境未检测到 electronAPI，无法打开文件。");
      return;
    }
    const target =
      record.savePath ?? record.translatedPath ?? record.sourcePath;
    if (!target) {
      setPageError("该记录没有可打开的路径。");
      return;
    }
    setOpeningId(record.id);
    setPageError(null);
    setPageMessage(null);
    try {
      const result = await electron.history.open(target);
      if (!result) {
        throw new Error("系统未能打开目标位置，请手动检查。");
      }
    } catch (error) {
      console.error("Failed to open history record", error);
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningId(null);
    }
  };

  const handleOpenFile = async (record: TranslationRecord) => {
    if (!electron) {
      setPageError("当前环境未检测到 electronAPI，无法打开文件。");
      return;
    }
    const target = record.savePath ?? record.translatedPath;
    if (!target) {
      setPageError("该记录没有可打开的翻译文件。");
      return;
    }
    console.log("Opening file:", target);
    setOpeningId(record.id);
    setPageError(null);
    setPageMessage(null);
    try {
      const result = await electron.app.openFile(target);
      console.log("Open file result:", result);
      if (!result) {
        throw new Error("系统未能打开文件，请手动检查。");
      }
    } catch (error) {
      console.error("Failed to open file", error);
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningId(null);
    }
  };

  const handleRemoveRecord = async (record: TranslationRecord) => {
    if (!electron) {
      setPageError("当前环境未检测到 electronAPI，无法删除历史记录。");
      return;
    }
    setRemovingId(record.id);
    setPageError(null);
    setPageMessage(null);
    try {
      await electron.history.remove(record.id);
      removeHistory(record.id);
      setPageMessage(`已删除历史记录：${record.title}`);
    } catch (error) {
      console.error("Failed to remove history record", error);
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setRemovingId(null);
    }
  };

  const openDetail = (record: TranslationRecord) => {
    setSelectedRecord(record);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setTimeout(() => setSelectedRecord(null), 200);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">翻译历史</h1>
        <p className="text-muted-foreground">
          浏览历史记录、快速搜索并重新打开已翻译的文件。
        </p>
      </header>

      {(pageError || pageMessage) && (
        <div
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            pageError
              ? "border-destructive/60 bg-destructive/10 text-destructive"
              : "border-emerald-500/60 bg-emerald-500/10 text-emerald-600"
          )}
        >
          {pageError ?? pageMessage}
        </div>
      )}

      <section className="space-y-4 rounded-lg border border-border/60 bg-muted/10 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">总计 {history.length}</Badge>
            {statusOptions.map((option) => (
              <Badge
                key={option.value}
                variant={statusCounts[option.value] ? "outline" : "secondary"}
                className="capitalize"
              >
                {option.label} · {statusCounts[option.value] ?? 0}
              </Badge>
            ))}
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="搜索标题、作者或路径"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <ListFilter className="hidden h-4 w-4 text-muted-foreground sm:block" />
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as "all" | TranslationJobStatus
                  )
                }
              >
                <option value="all">全部状态</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {filteredRecords.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center text-sm text-muted-foreground">
              <Info className="h-8 w-8 text-muted-foreground/70" />
              <p>暂无符合条件的历史记录。</p>
              {history.length === 0 && (
                <p>开始翻译文档后，这里会展示完整的翻译档案。</p>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredRecords.map((record) => {
            const meta = statusMeta[record.status] ?? statusMeta.success;
            return (
              <Card key={record.id} className="overflow-hidden">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold">
                      {record.title}
                    </CardTitle>
                    <CardDescription>
                      {record.authors ?? "未知作者"}
                    </CardDescription>
                  </div>
                  <Badge variant={meta.variant} className="capitalize">
                    {meta.label}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {record.abstractSnippet && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {record.abstractSnippet}
                    </p>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-muted-foreground tracking-wide">
                        创建时间
                      </p>
                      <p className="text-sm font-medium">
                        {formatDateTime(record.createdAt)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-muted-foreground tracking-wide">
                        最近更新
                      </p>
                      <p className="text-sm font-medium">
                        {formatDateTime(record.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-muted-foreground tracking-wide">
                        原文件
                      </p>
                      <div className="rounded-md bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
                        {record.sourcePath}
                      </div>
                    </div>
                    {record.savePath ? (
                      <div className="space-y-1">
                        <p className="text-xs uppercase text-muted-foreground tracking-wide">
                          保存位置
                        </p>
                        <div className="rounded-md bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
                          {record.savePath}
                        </div>
                      </div>
                    ) : record.translatedPath ? (
                      <div className="space-y-1">
                        <p className="text-xs uppercase text-muted-foreground tracking-wide">
                          临时输出目录
                        </p>
                        <div className="rounded-md bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
                          {record.translatedPath}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenRecord(record)}
                      disabled={openingId === record.id}
                    >
                      <ExternalLink
                        className={cn(
                          "mr-2 h-4 w-4",
                          openingId === record.id && "animate-spin"
                        )}
                      />
                      打开所在位置
                    </Button>
                    {(record.savePath || record.translatedPath) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenFile(record)}
                        disabled={openingId === record.id}
                      >
                        <BookOpen
                          className={cn(
                            "mr-2 h-4 w-4",
                            openingId === record.id && "animate-spin"
                          )}
                        />
                        打开双语对照
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDetail(record)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      查看详情
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveRecord(record)}
                      disabled={removingId === record.id}
                    >
                      <Trash2
                        className={cn(
                          "mr-2 h-4 w-4",
                          removingId === record.id && "animate-spin"
                        )}
                      />
                      删除记录
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => (open ? setDetailOpen(true) : closeDetail())}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedRecord?.title ?? "历史详情"}</DialogTitle>
            <DialogDescription>
              {selectedRecord?.authors ?? "未知作者"}
            </DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge
                  variant={statusMeta[selectedRecord.status].variant}
                  className="capitalize"
                >
                  {statusMeta[selectedRecord.status].label}
                </Badge>
                <span>
                  创建于 {formatDateTime(selectedRecord.createdAt)} · 更新于{" "}
                  {formatDateTime(selectedRecord.updatedAt)}
                </span>
              </div>
              {selectedRecord.abstractSnippet && (
                <div className="rounded-md bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                  {selectedRecord.abstractSnippet}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground tracking-wide">
                    原文件
                  </p>
                  <div className="rounded-md bg-muted/30 px-3 py-2 text-xs font-mono break-all text-muted-foreground">
                    {selectedRecord.sourcePath}
                  </div>
                </div>
                {selectedRecord.savePath && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground tracking-wide">
                      保存位置
                    </p>
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-xs font-mono break-all text-muted-foreground">
                      {selectedRecord.savePath}
                    </div>
                  </div>
                )}
                {selectedRecord.translatedPath && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground tracking-wide">
                      翻译输出
                    </p>
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-xs font-mono break-all text-muted-foreground">
                      {selectedRecord.translatedPath}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">日志</p>
                <ScrollArea className="h-48 rounded-md border border-border/60 bg-background/60">
                  <div className="space-y-1 p-3 text-xs">
                    {selectedRecord.logs.length === 0 ? (
                      <p className="text-muted-foreground">尚无日志记录。</p>
                    ) : (
                      selectedRecord.logs.map((line, index) => (
                        <p key={`log-${index}`} className="whitespace-pre-wrap">
                          {line}
                        </p>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeDetail}>
              关闭
            </Button>
            {selectedRecord && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    selectedRecord && handleOpenRecord(selectedRecord)
                  }
                  disabled={openingId === selectedRecord.id}
                >
                  <ExternalLink
                    className={cn(
                      "mr-2 h-4 w-4",
                      openingId === selectedRecord.id && "animate-spin"
                    )}
                  />
                  打开所在位置
                </Button>
                {(selectedRecord.savePath || selectedRecord.translatedPath) && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      selectedRecord && handleOpenFile(selectedRecord)
                    }
                    disabled={openingId === selectedRecord.id}
                  >
                    <BookOpen
                      className={cn(
                        "mr-2 h-4 w-4",
                        openingId === selectedRecord.id && "animate-spin"
                      )}
                    />
                    打开双语对照
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HistoryPage;
