import { useEffect, useMemo, useState } from "react";
import electron from "../lib/electron";
import { useAppStore } from "@/stores/app-store";
import type { AppSettings, ThemePreference } from "@/types/ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Check,
  Cog,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  {
    value: "system",
    label: "跟随系统",
    description: "根据 macOS / Windows 外观自动切换",
  },
  {
    value: "light",
    label: "浅色模式",
    description: "适合明亮环境，阅读更清晰",
  },
  { value: "dark", label: "深色模式", description: "降低对比度，在夜间更护眼" },
];

const SettingsPage = () => {
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const setThemePreference = useAppStore((state) => state.setThemePreference);
  const environmentSummary = useAppStore((state) => state.environmentSummary);
  const setEnvironmentSummary = useAppStore(
    (state) => state.setEnvironmentSummary
  );
  const resetEnvironmentStatuses = useAppStore(
    (state) => state.resetEnvironmentStatuses
  );
  const setEnvironmentChecking = useAppStore(
    (state) => state.setEnvironmentChecking
  );

  const [form, setForm] = useState<AppSettings | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnsuringEnv, setIsEnsuringEnv] = useState(false);
  const [pendingDialog, setPendingDialog] = useState<"api" | null>(null);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const isDirty = useMemo(() => {
    if (!settings || !form) return false;
    return JSON.stringify(settings) !== JSON.stringify(form);
  }, [settings, form]);

  const handleFieldChange = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleBabeldocChange = <K extends keyof AppSettings["babeldoc"]>(
    key: K,
    value: AppSettings["babeldoc"][K]
  ) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            babeldoc: {
              ...prev.babeldoc,
              [key]: value,
            },
          }
        : prev
    );
  };

  const validateForm = () => {
    if (!form) return "设置尚未加载完成。";
    if (!form.openaiBaseUrl.trim()) {
      return "请填写 OpenAI Base URL。";
    }
    if (!form.openaiModel.trim()) {
      return "请选择或填写模型名称。";
    }
    if (!form.documentRoot.trim()) {
      return "请设置翻译结果保存目录。";
    }
    return null;
  };

  const handleSave = async () => {
    if (!electron) {
      setPageError("当前环境未检测到 electronAPI，无法保存设置。");
      return;
    }
    const validationError = validateForm();
    if (validationError) {
      setPageError(validationError);
      return;
    }
    if (!form) return;

    setIsSaving(true);
    setPageError(null);
    setPageMessage(null);
    try {
      const updated = await electron.settings.update(form);
      setSettings(updated);
      setThemePreference(updated.theme);
      setForm(updated);
      setPageMessage("设置已保存。");
    } catch (error) {
      console.error("Failed to save settings", error);
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectDirectory = async (field: "documentRoot" | "uvBinDir") => {
    if (!electron) {
      setPageError("当前环境未检测到 electronAPI，无法选择目录。");
      return;
    }
    const directory = await electron.dialog.selectDirectory();
    if (!directory) return;
    if (field === "documentRoot") {
      handleFieldChange("documentRoot", directory);
    } else {
      handleFieldChange("uvBinDir", directory);
    }
    setPageMessage("目录已更新，记得保存设置。");
  };

  const handleOpenPath = async (target: string | undefined) => {
    if (!electron || !target) return;
    try {
      await electron.app.openPath(target);
    } catch (error) {
      console.error("Failed to open path", error);
      setPageError("无法打开指定路径，请在 Finder/Explorer 中手动查看。");
    }
  };

  const handleEnsureEnvironment = async () => {
    if (!electron) {
      setPageError("当前环境未检测到 electronAPI，无法执行环境检测。");
      return;
    }
    setIsEnsuringEnv(true);
    setPageError(null);
    setPageMessage(null);
    try {
      setEnvironmentChecking(true);
      resetEnvironmentStatuses();
      await electron.environment.reset();
      const summary = await electron.environment.ensure();
      setEnvironmentSummary(summary);
      setPageMessage("环境检测完成。");
    } catch (error) {
      console.error("Environment ensure failed", error);
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setEnvironmentChecking(false);
      setIsEnsuringEnv(false);
    }
  };

  if (!form) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
          <p className="text-muted-foreground">
            配置 LLM 接口、BabelDOC 参数、文件保存目录与界面主题。
          </p>
        </header>
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            正在加载应用设置…
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="text-muted-foreground">
          配置 LLM 接口、BabelDOC 参数、文件保存目录与界面主题。
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

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>LLM 接口</CardTitle>
              <CardDescription>
                配置 OpenAI 兼容接口的地址、密钥和模型名称。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openai-base-url">API Base URL</Label>
                <Input
                  id="openai-base-url"
                  value={form.openaiBaseUrl}
                  onChange={(event) =>
                    handleFieldChange("openaiBaseUrl", event.target.value)
                  }
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openai-api-key">API Key</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="openai-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={form.openaiApiKey}
                    onChange={(event) =>
                      handleFieldChange("openaiApiKey", event.target.value)
                    }
                    placeholder="sk-..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowApiKey((prev) => !prev)}
                  >
                    {showApiKey ? (
                      <EyeOff className="mr-2 h-4 w-4" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    {showApiKey ? "隐藏" : "显示"}
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>密钥仅存储在本地 Electron 配置文件中，请勿分享。</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto text-xs"
                    onClick={() => setPendingDialog("api")}
                  >
                    查看安全说明
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="openai-model">模型名称</Label>
                <Input
                  id="openai-model"
                  value={form.openaiModel}
                  onChange={(event) =>
                    handleFieldChange("openaiModel", event.target.value)
                  }
                  placeholder="gpt-4o-mini"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>BabelDOC 参数</CardTitle>
              <CardDescription>
                设置翻译结果保存目录、运行选项与额外标志。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="document-root">翻译结果目录</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      id="document-root"
                      value={form.documentRoot}
                      onChange={(event) =>
                        handleFieldChange("documentRoot", event.target.value)
                      }
                      className="flex-1 min-w-0 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSelectDirectory("documentRoot")}
                      className="whitespace-nowrap flex-shrink-0"
                    >
                      <FolderOpen className="mr-2 h-4 w-4" />
                      选择
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleOpenPath(form.documentRoot)}
                      className="whitespace-nowrap flex-shrink-0"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      查看
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground break-words">
                  所有翻译结果将保存到该目录下,可自定义为云盘或项目文件夹。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="uv-bin-dir">BabelDOC 安装目录</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      id="uv-bin-dir"
                      value={form.uvBinDir}
                      onChange={(event) =>
                        handleFieldChange("uvBinDir", event.target.value)
                      }
                      className="flex-1 min-w-0 font-mono text-xs"
                      placeholder="可留空自动检测"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSelectDirectory("uvBinDir")}
                      className="whitespace-nowrap flex-shrink-0"
                    >
                      <FolderOpen className="mr-2 h-4 w-4" />
                      定位
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground break-words">
                  若留空,系统会在环境检测时自动查找 uv 工具的 bin 目录。
                </p>
              </div>

              {/* <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 p-3">
                <div>
                  <p className="text-sm font-medium">输出双语对照</p>
                  <p className="text-xs text-muted-foreground">
                    启用后将附带原文与译文排版，适合对照研读。
                  </p>
                </div>
                <Switch
                  checked={form.babeldoc.bilingual}
                  onCheckedChange={(checked) =>
                    handleBabeldocChange("bilingual", checked)
                  }
                />
              </div> */}

              <div className="flex items-start justify-between gap-4 rounded-md border border-border/60 bg-muted/10 p-3">
                <div className="flex-1 space-y-0.5">
                  <Label
                    htmlFor="debug-mode"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Debug 模式
                  </Label>
                  <p className="text-xs text-muted-foreground break-words">
                    启用后可以看到详细的翻译进度,但生成的文档会包含识别框。关闭后文档更清晰,但进度更新较慢。
                  </p>
                </div>
                <Switch
                  id="debug-mode"
                  checked={form.babeldoc.debug}
                  onCheckedChange={(checked) =>
                    handleBabeldocChange("debug", checked)
                  }
                  className="flex-shrink-0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extra-flags">额外命令行参数</Label>
                <textarea
                  id="extra-flags"
                  value={form.babeldoc.extraFlags}
                  onChange={(event) =>
                    handleBabeldocChange("extraFlags", event.target.value)
                  }
                  placeholder="例如：--max-pages 20 --temperature 0.2"
                  className="min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  多个参数用空格分隔，会原样传递给 BabelDOC 命令。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>界面主题</CardTitle>
              <CardDescription>
                选择应用主题或跟随系统自动切换。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {themeOptions.map((option) => {
                const isActive = form.theme === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    className="flex h-auto w-full items-start justify-between gap-3 py-3"
                    onClick={() => handleFieldChange("theme", option.value)}
                  >
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground break-words">
                        {option.description}
                      </p>
                    </div>
                    {isActive && <Check className="h-4 w-4 flex-shrink-0" />}
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>系统状态</CardTitle>
              <CardDescription>
                查看环境检测结果并执行重新检测。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {environmentSummary ? (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  尚未获取环境概览，可点击下方按钮重新检测。
                </p>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={handleEnsureEnvironment}
                disabled={isEnsuringEnv}
              >
                <Sparkles
                  className={cn(
                    "mr-2 h-4 w-4",
                    isEnsuringEnv && "animate-spin"
                  )}
                />
                {isEnsuringEnv ? "正在检测环境…" : "重新检测环境"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>保存与应用</CardTitle>
              <CardDescription>保存更改后会立即同步到主进程。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Cog className="h-4 w-4 text-muted-foreground" />
                  <span>当前状态</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {isDirty ? "有未保存修改" : "已与主进程同步"}
                </span>
              </div>
              <Button
                type="button"
                variant="default"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
              >
                <Save
                  className={cn("mr-2 h-4 w-4", isSaving && "animate-spin")}
                />
                {isSaving ? "保存中…" : "保存设置"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog
        open={pendingDialog === "api"}
        onOpenChange={(open) => setPendingDialog(open ? "api" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key 存储说明</DialogTitle>
            <DialogDescription>
              所有密钥仅存储在本地用户配置目录中，不会上传到任何服务器。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              • 密钥会写入 Electron 内置的加密存储，位于当前用户的数据目录。
            </p>
            <p>• 如需清理，可从系统设置中打开应用数据目录并删除配置文件。</p>
            <p>• 建议使用只读或专用密钥，以便随时吊销。</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDialog(null)}>
              我已了解
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
