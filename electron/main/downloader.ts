import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { DownloadProgress } from "./types.js";

export interface DownloadResult {
  filePath: string;
  originalName: string;
}

const ensurePdfExtension = (urlPath: string) => {
  if (urlPath.toLowerCase().endsWith(".pdf")) {
    return urlPath;
  }
  return `${urlPath}.pdf`;
};

export const downloadPdfFromUrl = async (
  url: string,
  notify?: (progress: DownloadProgress) => void
): Promise<DownloadResult> => {
  const parsed = new URL(url);
  const fileName = ensurePdfExtension(
    basename(parsed.pathname) || `document-${Date.now()}.pdf`
  );
  const tempPath = join(tmpdir(), `babeldoc-${randomUUID()}-${fileName}`);

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`下载失败：${response.status} ${response.statusText}`);
  }

  const totalBytes =
    Number(response.headers.get("content-length") ?? 0) || undefined;
  const fileStream = createWriteStream(tempPath);

  let receivedBytes = 0;
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        fileStream.write(Buffer.from(value));
        notify?.({ receivedBytes, totalBytes });
      }
    }
  } catch (error) {
    fileStream.close();
    await unlink(tempPath).catch(() => undefined);
    throw error instanceof Error ? error : new Error(String(error));
  }

  fileStream.close();
  return {
    filePath: tempPath,
    originalName: fileName,
  };
};
