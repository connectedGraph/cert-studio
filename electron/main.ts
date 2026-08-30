/**
 * Electron 主进程:窗口、IPC、生命周期。
 * 安全:contextIsolation 开启,渲染层仅经 preload 暴露的 API 通信。
 */
import { app, BrowserWindow, ipcMain, dialog, clipboard, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import { CertQueue, QueueEvent, setOutRoot } from "./services/queue";
import { outRootDir, saveSettings, certEmail } from "./services/settings";
import { parseRoster, exportSummary, exportRosterTemplate, ExportRow } from "./services/roster";
import { scanOutput } from "./services/store";

let win: BrowserWindow | null = null;
let queue: CertQueue | null = null;

const isDev = !app.isPackaged;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    title: "Cert Studio - 考级证书助手",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5188");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------- IPC ----------

ipcMain.handle("settings:get", () => ({
  outRoot: outRootDir(),
  email: certEmail(),
}));

ipcMain.handle("settings:set", (_e, patch: { outRoot?: string; email?: string }) => {
  saveSettings(patch);
  if (patch.outRoot) setOutRoot(patch.outRoot);
  return { outRoot: outRootDir(), email: certEmail() };
});

ipcMain.handle("settings:chooseOutRoot", async () => {
  const r = await dialog.showOpenDialog(win!, {
    properties: ["openDirectory", "createDirectory"],
    title: "选择证书输出目录",
  });
  if (r.canceled || !r.filePaths[0]) return null;
  saveSettings({ outRoot: r.filePaths[0] });
  setOutRoot(r.filePaths[0]);
  return r.filePaths[0];
});

ipcMain.handle("roster:import", async () => {
  const r = await dialog.showOpenDialog(win!, {
    properties: ["openFile"],
    title: "导入名册",
    filters: [
      { name: "名册", extensions: ["xlsx", "json"] },
    ],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const parsed = await parseRoster(r.filePaths[0]);
  lastRoster = parsed.students;
  return { path: r.filePaths[0], ...parsed };
});

ipcMain.handle("roster:downloadTemplate", async () => {
  const r = await dialog.showSaveDialog(win!, {
    title: "保存名册模板",
    defaultPath: "名册模板.xlsx",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (r.canceled || !r.filePath) return null;
  await exportRosterTemplate(r.filePath);
  return r.filePath;
});

// 上次导入的名册(内存态,启动批量用)
let lastRoster: { name: string; idCard: string; certNo?: string; examNo?: string }[] = [];

ipcMain.handle("queue:startFromRoster", () => {
  if (!outRootDir()) {
    return { ok: false, error: "请先在「设置」页选择输出目录" };
  }
  if (lastRoster.length === 0) {
    return { ok: false, error: "请先在「名册」页导入学生名单" };
  }
  setOutRoot(outRootDir());
  queue = new CertQueue(win!);
  void queue.enqueue(lastRoster);
  return { ok: true };
});

ipcMain.handle("queue:start", (_e, students: { name: string; idCard: string; certNo?: string; examNo?: string }[]) => {
  if (!outRootDir()) {
    return { ok: false, error: "请先设置输出目录" };
  }
  setOutRoot(outRootDir());
  queue = new CertQueue(win!);
  void queue.enqueue(students);
  return { ok: true };
});

ipcMain.handle("queue:stop", () => {
  queue?.stop();
  return { ok: true };
});

ipcMain.handle("queue:list", () => queue?.getTasks() ?? []);

ipcMain.handle("captcha:resolved", () => {
  queue?.resolveCaptcha();
  return { ok: true };
});

ipcMain.handle("certs:scan", () => scanOutput(outRootDir()));

ipcMain.handle("certs:copyImage", async (_e, pngPath: string) => {
  try {
    const { ClipboardItem } = await import("electron");
    const buf = fs.readFileSync(pngPath);
    // Electron 44: clipboard.write(ClipboardItem[]),MIME image/png
    const blob = new Blob([new Uint8Array(buf)], { type: "image/png" });
    await clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

ipcMain.handle("certs:openPdf", (_e, pdfPath: string) => {
  if (!fs.existsSync(pdfPath)) return { ok: false, error: "文件不存在" };
  void shell.openPath(pdfPath);
  return { ok: true };
});

ipcMain.handle("certs:openFolder", (_e, dir: string) => {
  void shell.openPath(dir);
  return { ok: true };
});

ipcMain.handle("export:summary", async (_e, rows: ExportRow[]) => {
  const r = await dialog.showSaveDialog(win!, {
    title: "导出证书汇总",
    defaultPath: "证书汇总.xlsx",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (r.canceled || !r.filePath) return null;
  await exportSummary(rows, r.filePath);
  return r.filePath;
});

// 队列事件 → 渲染层(渲染层也可经 queue:event 通道收到)
export type { QueueEvent };
