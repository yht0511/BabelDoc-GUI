import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import pdfParse from "pdf-parse";
import log from "electron-log";
import type { AppSettings, PathSuggestionResult } from "./types.js";

interface DocumentInsight {
  title: string;
  authors?: string;
  abstractSnippet: string;
}

const FOLDER_DEPTH_LIMIT = 3;
const FOLDER_CHILD_LIMIT = 20;

const safeJoin = (...segments: string[]) => join(...segments.filter(Boolean));

const buildFolderTree = (root: string, depth = 0): string => {
  if (depth >= FOLDER_DEPTH_LIMIT) {
    return "";
  }

  if (!existsSync(root)) {
    return "";
  }

  const indent = "  ".repeat(depth + 1);
  const entries = readdirSync(root).slice(0, FOLDER_CHILD_LIMIT);
  const lines: string[] = [];

  for (const entry of entries) {
    const fullPath = join(root, entry);
    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        lines.push(`${indent}- ${entry}/`);
        lines.push(buildFolderTree(fullPath, depth + 1));
      }
    } catch (error) {
      log.warn(`[llm] failed to stat ${fullPath}`, error);
    }
  }

  return lines.filter(Boolean).join("\n");
};

const sanitizeText = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001F]+/g, " ")
    .trim();

export const deriveDocumentInsight = async (
  filePath: string
): Promise<DocumentInsight> => {
  log.info(`[llm] deriveDocumentInsight called with: ${filePath}`);
  try {
    // 检查路径是否存在且为文件（不是目录）
    if (!existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`路径不是文件: ${filePath}`);
    }

    log.info(`[llm] Reading PDF file: ${filePath} (${stats.size} bytes)`);
    const buffer = await readFile(filePath);
    log.info(`[llm] Parsing PDF buffer with pdf-parse`);
    const pdfData = await pdfParse(buffer);
    log.info(`[llm] PDF parsed successfully, extracting metadata`);
    const meta = pdfData.info ?? {};
    log.info(`[llm] PDF metadata:`, JSON.stringify(meta, null, 2));

    let title = sanitizeText(
      meta.Title ?? pdfData.metadata?.get("dc:title") ?? ""
    );

    const authors = sanitizeText(
      meta.Author ??
        pdfData.metadata?.get("dc:creator") ??
        pdfData.metadata?.get("Author") ??
        ""
    );

    const abstractSnippet = sanitizeText(pdfData.text.slice(0, 2000)).slice(
      0,
      600
    );

    // 如果元数据中没有标题，尝试从文本内容中提取
    if (!title) {
      // 尝试多种标题模式：
      // 1. 连续的大写字母单词（如 "GATEDDELTANETWORK"）
      const allCapsMatch = abstractSnippet.match(/\b([A-Z]{5,50})\b/);
      // 2. 首字母大写的多个单词（如 "Deep Learning Networks"）
      const titleCaseMatch = abstractSnippet.match(
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){2,10})\b/
      );
      // 3. 大写单词组合（如 "GATED DELTA NETWORK"）
      const capsWordsMatch = abstractSnippet.match(
        /\b([A-Z]+(?:\s+[A-Z]+){1,5})\b/
      );

      if (allCapsMatch) {
        title = allCapsMatch[1];
        log.info(`[llm] Extracted all-caps title from content: "${title}"`);
      } else if (capsWordsMatch) {
        title = capsWordsMatch[1];
        log.info(`[llm] Extracted caps-words title from content: "${title}"`);
      } else if (titleCaseMatch) {
        title = titleCaseMatch[1];
        log.info(`[llm] Extracted title-case title from content: "${title}"`);
      } else {
        title = "未命名文档";
      }
    }

    log.info(`[llm] Final title: "${title}", authors: "${authors}"`);
    log.info(
      `[llm] Abstract snippet (first 100 chars): ${abstractSnippet.slice(
        0,
        100
      )}`
    );

    return {
      title: title || "未命名文档",
      authors: authors || undefined,
      abstractSnippet,
    };
  } catch (error) {
    log.error("[llm] failed to parse pdf", error);
    return {
      title: "未命名文档",
      abstractSnippet: "(无法提取摘要)",
    };
  }
};

const composePrompt = (
  insight: DocumentInsight,
  settings: AppSettings,
  folderTree: string
): string => {
  const folderBlock = folderTree
    ? `\n${folderTree}`
    : "  (当前目录为空，可自由创建新目录)";
  return `你是一个专业的学术文献管理员，负责为 PDF 文档设计最佳的归档路径。

## 文档信息
- **标题**: ${insight.title}
- **摘要/内容片段**: ${insight.abstractSnippet}

## 当前文件夹结构
${settings.documentRoot}/
${folderBlock}

## 任务要求
1. **路径层次**: 必须创建完整的学科分类层次（2-3级），从宏观领域到具体子领域
   - 示例: Computer_Science → Machine_Learning → Transformers
   - 示例: Physics → Quantum_Mechanics → Quantum_Computing

2. **目录命名规范**:
   - 使用英文
   - 使用下划线连接多个单词 (例如: Natural_Language_Processing)
   - 首字母大写 (例如: Deep_Learning 而非 deep_learning)
   - 避免使用特殊字符和空格

3. **路径选择策略**:
   - **优先复用**: 如果现有目录结构中已有合适的分类，优先使用
   - **禁止扁平化存储**: 
     * ❌ 错误：如果存在 "Computer_Science/Machine_Learning/"，不能将文件放在 "Computer_Science/" 下
     * ✅ 正确：必须放在 "Computer_Science/Machine_Learning/Deep_Learning" 或其他三级目录
     * **规则：文件必须存储在叶子节点（没有子目录的最深层目录）**
   - **创建新路径**: 如果现有分类不合适，创建新的完整层次路径
   - **保持一致性**: 新建目录应与现有目录风格保持一致

4. **学科领域参考** (常见一级分类):
   - Computer_Science (计算机科学)
   - Mathematics (数学)
   - Physics (物理学)
   - Biology (生物学)
   - Chemistry (化学)
   - Engineering (工程学)
   - Economics (经济学)
   - Medicine (医学)

## 严格禁止的行为示例
假设现有结构:
${settings.documentRoot}/
  - Computer_Science/
    - Machine_Learning/
    - Computer_Vision/
  - Physics/
    - Quantum_Mechanics/

❌ **错误**: ${settings.documentRoot}/Computer_Science  (Computer_Science 下已有子目录，不能直接存储文件)
❌ **错误**: ${settings.documentRoot}/Physics  (Physics 下已有子目录，不能直接存储文件)
✅ **正确**: ${settings.documentRoot}/Computer_Science/Machine_Learning/Reinforcement_Learning
✅ **正确**: ${settings.documentRoot}/Computer_Science/Natural_Language_Processing/LLM
✅ **正确**: ${settings.documentRoot}/Physics/Quantum_Mechanics/Quantum_Computing

## 输出要求
**仅返回完整的绝对路径，不要有任何解释或额外文字**

正确示例:
- ${settings.documentRoot}/Computer_Science/Machine_Learning/Reinforcement_Learning
- ${settings.documentRoot}/Physics/Astrophysics/Black_Holes
- ${settings.documentRoot}/Biology/Genetics/CRISPR_Technology

错误示例:
- "我建议放在这个路径: /path/to/folder" (包含多余文字)
- ${settings.documentRoot}/Computer_Science (层次不够完整，且该目录下已有子目录)
- ${settings.documentRoot}/AI/ML (缩写不规范)

现在请为这篇文档建议路径:`;
};

const normaliseBaseUrl = (baseUrl: string) => {
  if (!baseUrl) return "";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};

export const requestPathSuggestion = async (
  settings: AppSettings,
  filePath: string
): Promise<PathSuggestionResult> => {
  if (
    !settings.openaiBaseUrl ||
    !settings.openaiModel ||
    !settings.openaiApiKey
  ) {
    throw new Error("请先在设置中填写 LLM 接口地址、模型与 API Key。");
  }

  const insight = await deriveDocumentInsight(filePath);
  const folderTree = buildFolderTree(settings.documentRoot, 0);
  const prompt = composePrompt(insight, settings, folderTree);

  const payload = {
    model: settings.openaiModel,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "你是一个严谨的图书管理员，擅长为学术文档规划最合适的归档位置。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };
  log.info(`[llm] Sending request to LLM with model ${settings.openaiModel}`);

  const url = `${normaliseBaseUrl(settings.openaiBaseUrl)}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openaiApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM 请求失败：${response.status} ${errorText}`);
  }

  const data = await response.json();
  let suggestion = data?.choices?.[0]?.message?.content?.trim();

  if (!suggestion) {
    throw new Error("LLM 未返回有效的目录建议，请稍后重试。");
  }

  // 清理路径：移除可能的引号和多余的空白
  suggestion = suggestion
    .replace(/^["']|["']$/g, "") // 移除首尾引号
    .replace(/\s+/g, " ") // 规范化空格
    .trim();

  log.info(`[llm] Cleaned suggestion path: ${suggestion}`);

  return {
    suggestedPath: suggestion,
    rationale: `基于标题《${insight.title}》与摘要片段，模型给出的最优路径。`,
  };
};
