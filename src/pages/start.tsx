import { useMemo, useState } from "react";
import electron from "../lib/electron";
import { useAppStore } from "@/stores/app-store";
import type {
  DocumentInsight,
  PathSuggestionResult,
  TranslationQueueItem,
} from "@/types/ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Loader2,
  Upload,
  Link as LinkIcon,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

type SuggestionState = {
  job: TranslationQueueItem | null;
  insight: DocumentInsight | null;
  suggestion: PathSuggestionResult | null;
  inputValue: string;
  rationale?: string;
};

const statusMeta: Record<
  TranslationQueueItem["status"],
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  } & { description?: string }
> = {
  queued: {
    label: "排队中",
    variant: "secondary",
    description: "等待空闲的翻译进程",
  },
  running: {
    label: "运行中",
    variant: "default",
    description: "正在调用 BabelDOC 进行翻译",
  },
  "llm-path": {
    label: "整理路径",
    variant: "default",
    description: "准备推荐智能归档路径",
  },
  "awaiting-user": {
    label: "待保存",
    variant: "secondary",
    description: "等待确认保存位置",
  },
  success: {
    label: "已保存",
    variant: "default",
    description: "翻译结果已存入目标目录",
  },
  failed: {
    label: "失败",
    variant: "destructive",
    description: "翻译或保存过程中出现错误",
  },
};

const StartPage = () => {
  const queue = useAppStore((state) => state.queue);
  const downloads = useAppStore((state) => state.downloads);
  const upsertQueueItem = useAppStore((state) => state.upsertQueueItem);
  const environmentStatuses = useAppStore((state) => state.environmentStatuses);
  const environmentSummary = useAppStore((state) => state.environmentSummary);
  const isEnvironmentChecking = useAppStore(
    (state) => state.isEnvironmentChecking
  );
  const resetEnvironmentStatuses = useAppStore(
    (state) => state.resetEnvironmentStatuses
  );
  const setEnvironmentChecking = useAppStore(
    (state) => state.setEnvironmentChecking
  );
  const setEnvironmentSummary = useAppStore(
    (state) => state.setEnvironmentSummary
  );

  const [urlInput, setUrlInput] = useState("");
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    "files" | "url" | "environment" | null
  >(null);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [suggestionState, setSuggestionState] = useState<SuggestionState>({
    job: null,
    insight: null,
    suggestion: null,
    inputValue: "",
  });

  const sortedQueue = useMemo(
    () =>
      queue
        .slice()
        .sort((a, b) =>
          a.createdAt && b.createdAt
            ? b.createdAt.localeCompare(a.createdAt)
            : 0
        ),
    [queue]
  );

  const handleSelectFiles = async () => {
    if (!electron) {
      setPageError("当前环境未检测到 electronAPI，无法选择文件。");
      return;
    }
    setPageError(null);
    setPageMessage(null);
    setLoadingAction("files");
    try {
      const selections = await electron.dialog.selectPdf();
      if (!selections || selections.length === 0) {
        return;
      }
      const response = await electron.translation.enqueueFiles(selections);
      response.forEach((item) => upsertQueueItem(item));
      setPageMessage(`已加入 ${response.length} 个翻译任务。`);
    } catch (error) {
      console.error("Failed to enqueue files", error);
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEnqueueUrl = async () => {
    if (!electron) {
      setPageError("当前环境未检测到 electronAPI，无法下载链接。");
      return;
    }
    if (!urlInput.trim()) {
      setPageError("请输入有效的 PDF 链接或 arXiv 地址。");
      return;
    }
    setPageError(null);
    setPageMessage(null);
    setLoadingAction("url");
    try {
      const downloadId = crypto.randomUUID();
      const result = await electron.translation.enqueueFromDownload(
        urlInput.trim(),
        downloadId
      );
      upsertQueueItem(result.job);
      setPageMessage(`已开始下载并排队：${result.job.originalName}`);
      setUrlInput("");
    } catch (error) {
      console.error("Failed to enqueue download", error);
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleOpenPath = async (path?: string) => {
    if (!electron || !path) return;
    try {
      await electron.app.openPath(path);
    } catch (error) {
      console.error("Failed to open path", error);
      setPageError("无法打开指定路径，请在 Finder/Explorer 中手动查看。");
    }
  };

  const handleOpenFile = async (filePath?: string) => {
    if (!electron || !filePath) return;
    console.log("Opening file:", filePath);
    try {
      const result = await electron.app.openFile(filePath);
      console.log("Open file result:", result);
      if (!result) {
        setPageError("无法打开文件，请检查文件是否存在。");
      }
    } catch (error) {
      console.error("Failed to open file", error);
      setPageError("无法打开文件，请手动查看。");
    }
  };

  const ensureEnvironment = async () => {
    if (!electron) return;
    setLoadingAction("environment");
    setPageError(null);
    setPageMessage(null);
    try {
      setEnvironmentChecking(true);
      resetEnvironmentStatuses();
      await electron.environment.reset();
      const summary = await electron.environment.ensure();
      setEnvironmentSummary(summary);
      setPageMessage("环境检查完成。");
    } catch (error) {
      console.error("Environment ensure failed", error);
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingAction(null);
      setEnvironmentChecking(false);
    }
  };

  const handleSuggestAndSave = async (job: TranslationQueueItem) => {
    if (!electron) return;
    setSuggestionState({
      job,
      insight: null,
      suggestion: null,
      inputValue: "",
    });
    setSuggestionLoading(true);
    setSuggestionOpen(true);
    try {
      const [suggestion, insight] = await Promise.all([
        electron.translation.suggestPath(job.id),
        electron.translation.refreshInsight(job.id),
      ]);
      setSuggestionState({
        job,
        suggestion,
        insight,
        inputValue:
          suggestion?.suggestedPath ?? environmentSummary?.babeldocPath ?? "",
        rationale: suggestion?.rationale,
      });
    } catch (error) {
      console.error("Failed to fetch suggestion", error);
      setPageError(error instanceof Error ? error.message : String(error));
      setSuggestionState((prev) => ({
        ...prev,
        job,
        suggestion: null,
        inputValue: environmentSummary?.babeldocPath ?? "",
      }));
    } finally {
      setSuggestionLoading(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!electron || !suggestionState.job) return;
    const destination = suggestionState.inputValue.trim();
    if (!destination) {
      setPageError("请填写有效的保存路径，或选择一个文件夹。");
      return;
    }
    setSaveLoading(true);
    setPageError(null);
    try {
      await electron.translation.saveOutput(
        suggestionState.job.id,
        destination
      );
      setPageMessage("翻译结果已保存。");
      setSuggestionOpen(false);
    } catch (error) {
      console.error("Failed to save translation", error);
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleChooseManualDirectory = async () => {
    if (!electron) return;
    try {
      const directory = await electron.dialog.selectDirectory();
      if (directory) {
        setSuggestionState((prev) => ({
          ...prev,
          inputValue: directory,
        }));
      }
    } catch (error) {
      console.error("Failed to select directory", error);
      setPageError(error instanceof Error ? error.message : String(error));
    }
  };

  const renderEnvironmentStatus = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          环境自检
          {isEnvironmentChecking && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </CardTitle>
        <CardDescription>
          应用会自动检测 Python、uv 与 BabelDOC 状态，必要时可重新检查。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {Object.values(environmentStatuses).map((status) => (
            <div
              key={status.stage}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
            >
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-sm font-medium capitalize">
                  {status.stage === "uv-bin-dir"
                    ? "BabelDOC 路径"
                    : status.stage}
                </p>
                {status.message && (
                  <p className="text-xs text-muted-foreground font-mono overflow-x-auto whitespace-nowrap scrollbar-thin">
                    {status.message}
                  </p>
                )}
              </div>
              <Badge
                variant={
                  status.status === "success"
                    ? "default"
                    : status.status === "error"
                    ? "destructive"
                    : "secondary"
                }
                className="flex-shrink-0"
              >
                {status.status === "success"
                  ? "就绪"
                  : status.status === "error"
                  ? "失败"
                  : status.status === "running"
                  ? "检测中"
                  : "等待"}
              </Badge>
            </div>
          ))}
        </div>
        {environmentSummary && (
          <div className="space-y-2 rounded-md bg-muted/20 p-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground/80 flex-shrink-0">
                Python:
              </span>
              <code className="font-mono text-muted-foreground overflow-x-auto whitespace-nowrap flex-1 scrollbar-thin">
                {environmentSummary.pythonPath}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground/80 flex-shrink-0">
                uv:
              </span>
              <code className="font-mono text-muted-foreground overflow-x-auto whitespace-nowrap flex-1 scrollbar-thin">
                {environmentSummary.uvPath}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground/80 flex-shrink-0">
                BabelDOC:
              </span>
              <code className="font-mono text-muted-foreground overflow-x-auto whitespace-nowrap flex-1 scrollbar-thin">
                {environmentSummary.babeldocPath}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground/80 flex-shrink-0">
                工具目录:
              </span>
              <code className="font-mono text-muted-foreground overflow-x-auto whitespace-nowrap flex-1 scrollbar-thin">
                {environmentSummary.uvBinDir}
              </code>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={ensureEnvironment}
            disabled={loadingAction === "environment"}
          >
            <RefreshCw
              className={cn(
                "mr-2 h-4 w-4",
                loadingAction === "environment" && "animate-spin"
              )}
            />
            重新检测环境
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderQueueItem = (job: TranslationQueueItem) => {
    const meta = statusMeta[job.status] ?? statusMeta["queued"];
    const progress = Math.min(Math.max(job.progress ?? 0, 0), 100);
    const downloadProgress = job.downloadId
      ? downloads[job.downloadId]
      : undefined;
    const percent = downloadProgress?.totalBytes
      ? Math.round(
          (downloadProgress.receivedBytes /
            (downloadProgress.totalBytes || 1)) *
            100
        )
      : undefined;

    return (
      <Card key={job.id} className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold">
              {job.originalName}
            </CardTitle>
            <CardDescription>
              {meta.description ?? ""}
              {job.status === "success" &&
                job.outputDir &&
                ` · ${job.outputDir}`}
              {job.status === "failed" && job.error && ` · ${job.error}`}
            </CardDescription>
          </div>
          <Badge
            variant={meta.variant}
            className="flex-shrink-0 whitespace-nowrap"
          >
            {meta.label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                队列来源：
                {job.sourceType === "download" ? "链接下载" : "本地文件"}
              </span>
              {job.createdAt && (
                <span>加入时间：{formatDateTime(job.createdAt)}</span>
              )}
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-all duration-500",
                  job.status === "failed" && "bg-destructive"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            {downloadProgress && (
              <div className="text-xs text-muted-foreground">
                下载进度：
                {downloadProgress.totalBytes
                  ? `${percent ?? 0}% (${Math.round(
                      downloadProgress.receivedBytes / 1024
                    )} KB / ${Math.round(
                      (downloadProgress.totalBytes ?? 0) / 1024
                    )} KB)`
                  : `${Math.round(downloadProgress.receivedBytes / 1024)} KB`}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>日志输出</span>
              <span className="text-xs text-muted-foreground">实时更新</span>
            </div>
            <ScrollArea className="h-40 rounded-md border border-border/60 bg-background/60">
              <div className="space-y-1 p-3">
                {job.logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    尚无日志输出。
                  </p>
                ) : (
                  job.logs.slice(-200).map((line, index) => (
                    <p
                      key={`${job.id}-log-${index}`}
                      className="whitespace-pre-wrap text-xs"
                    >
                      {line}
                    </p>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex flex-wrap gap-2">
            {job.status === "awaiting-user" && (
              <Button
                onClick={() => handleSuggestAndSave(job)}
                disabled={suggestionLoading}
              >
                <Upload
                  className={cn(
                    "mr-2 h-4 w-4",
                    suggestionLoading && "animate-spin"
                  )}
                />
                保存翻译结果
              </Button>
            )}
            {job.status === "success" && (job.savePath || job.outputDir) && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => handleOpenPath(job.savePath || job.outputDir)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  打开所在位置
                </Button>
                {job.savePath && (
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenFile(job.savePath)}
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    打开双语对照
                  </Button>
                )}
              </>
            )}
            {job.status === "failed" && job.outputDir && (
              <Button
                variant="outline"
                onClick={() => handleOpenPath(job.outputDir)}
              >
                查看临时结果
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">开始翻译</h1>
        <p className="text-muted-foreground">
          选择本地 PDF 或粘贴 arXiv/论文链接，系统会自动排队处理翻译，并通过 LLM
          智能推荐归档路径。
        </p>
      </header>

      {(pageMessage || pageError) && (
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

      <section className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              添加待翻译文档
            </CardTitle>
            <CardDescription>
              支持批量选择 PDF
              或粘贴链接，所有任务会自动排队并串行执行，避免速率限制。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="flex-1"
                onClick={handleSelectFiles}
                disabled={loadingAction === "files"}
              >
                <Upload
                  className={cn(
                    "mr-2 h-4 w-4",
                    loadingAction === "files" && "animate-spin"
                  )}
                />
                选择 PDF 文件
              </Button>
              <div className="flex flex-col gap-2 sm:flex-1">
                <div className="flex gap-2">
                  <Input
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                    placeholder="https://arxiv.org/abs/... 或其他 PDF 链接"
                  />
                  <Button
                    onClick={handleEnqueueUrl}
                    disabled={loadingAction === "url"}
                  >
                    <LinkIcon
                      className={cn(
                        "mr-2 h-4 w-4",
                        loadingAction === "url" && "animate-spin"
                      )}
                    />
                    下载并翻译
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  链接将自动下载到临时目录，成功后同样进入任务队列。
                </p>
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">翻译任务队列</h2>
                <span className="text-xs text-muted-foreground">
                  共 {queue.length} 项任务
                </span>
              </div>
              <div className="space-y-4">
                {sortedQueue.length === 0 ? (
                  <div className="rounded-md border border-dashed border-muted-foreground/50 p-6 text-center text-sm text-muted-foreground">
                    暂无翻译任务，立即添加一个吧。
                  </div>
                ) : (
                  sortedQueue.map((job) => renderQueueItem(job))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-6">
          {renderEnvironmentStatus()}
          <Card>
            <CardHeader>
              <CardTitle>使用小贴士</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>• 翻译日志会保留最近 500 行，方便定位问题。</p>
              <p>• 链接任务完成后会自动清理临时文件，请及时保存。</p>
              <p>• 保存时可根据 LLM 推荐路径调整，支持自定义新目录。</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog open={suggestionOpen} onOpenChange={setSuggestionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择翻译结果的保存位置</DialogTitle>
            <DialogDescription>
              {suggestionState.job?.originalName ?? ""} ·{" "}
              {suggestionState.insight?.title ?? "文档信息加载中"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {suggestionLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在从 LLM 获取推荐路径…
              </div>
            ) : (
              <>
                {suggestionState.rationale && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                    {suggestionState.rationale}
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    推荐保存路径
                  </label>
                  <Input
                    value={suggestionState.inputValue}
                    onChange={(event) =>
                      setSuggestionState((prev) => ({
                        ...prev,
                        inputValue: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleChooseManualDirectory}
                  >
                    选择其他文件夹
                  </Button>
                  {suggestionState.job?.outputDir && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleOpenPath(
                          suggestionState.job?.outputDir ?? undefined
                        )
                      }
                    >
                      查看临时输出
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuggestionOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleConfirmSave}
              disabled={saveLoading || suggestionLoading}
            >
              {saveLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saveLoading ? "保存中…" : "确认保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StartPage;
