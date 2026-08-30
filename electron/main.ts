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
  roster = parsed.students;
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

// 名册管理(内存态):导入与手动添加统一存放,可增删
let roster: { name: string; idCard: string; certNo?: string; examNo?: string }[] = [];

type RosterEntry = { name: string; idCard: string; certNo?: string; examNo?: string };

ipcMain.handle("roster:get", () => roster);

ipcMain.handle("roster:add", (_e, entry: RosterEntry) => {
  const name = (entry.name || "").trim();
  const idCard = (entry.idCard || "").trim();
  if (!name || !idCard) {
    return { ok: false, error: "姓名与身份证号必填", roster };
  }
  if (!roster.some((s) => s.name === name && s.idCard === idCard)) {
    roster = [
      ...roster,
      {
        name,
        idCard,
        certNo: entry.certNo?.trim() || undefined,
        examNo: entry.examNo?.trim() || undefined,
      },
    ];
  }
  return { ok: true, roster };
});

ipcMain.handle("roster:remove", (_e, index: number) => {
  roster = roster.filter((_, i) => i !== index);
  return { ok: true, roster };
});

ipcMain.handle("roster:clear", () => {
  roster = [];
  return { ok: true, roster };
});

ipcMain.handle("queue:startFromRoster", () => {
  if (!outRootDir()) {
    return { ok: false, error: "请先在「设置」页选择输出目录" };
  }
  if (roster.length === 0) {
    return { ok: false, error: "名册为空:请导入或手动添加学生" };
  }
  if (queue?.isRunning) {
    return { ok: false, error: "已有查询任务在运行" };
  }
  setOutRoot(outRootDir());
  queue = new CertQueue(win!);
  void queue.enqueue(roster);
  return { ok: true };
});

ipcMain.handle("queue:startSingle", (_e, student: RosterEntry) => {
  if (!outRootDir()) {
    return { ok: false, error: "请先在「设置」页选择输出目录" };
  }
  if (queue?.isRunning) {
    return { ok: false, error: "已有查询任务在运行,请等其结束后再试" };
  }
  const name = (student.name || "").trim();
  const idCard = (student.idCard || "").trim();
  if (!name || !idCard) {
    return { ok: false, error: "姓名与身份证号必填" };
  }
  setOutRoot(outRootDir());
  queue = new CertQueue(win!);
  void queue.enqueue([
    {
      name,
      idCard,
      certNo: student.certNo?.trim() || undefined,
      examNo: student.examNo?.trim() || undefined,
    },
  ]);
  return { ok: true };
});

ipcMain.handle("queue:start", (_e, students: RosterEntry[]) => {
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

// ---------- 分发记录 ----------
// 记录"哪张证书何时发给了谁的家长",存于输出目录 distributions.json

interface DistRecord {
  ts: string;
  studentName: string;
  major: string;
  level: number | string;
  certNo: string;
}

function distFile(): string {
  return path.join(outRootDir(), "distributions.json");
}

function readDist(): DistRecord[] {
  try {
    return JSON.parse(fs.readFileSync(distFile(), "utf-8")) as DistRecord[];
  } catch {
    return [];
  }
}

ipcMain.handle("dist:markSent", (_e, rec: Omit<DistRecord, "ts">) => {
  if (!outRootDir()) return { ok: false, error: "未设置输出目录" };
  const all = readDist();
  if (!all.some((r) => r.certNo === rec.certNo)) {
    all.push({ ...rec, ts: new Date().toISOString() });
    fs.writeFileSync(distFile(), JSON.stringify(all, null, 2), "utf-8");
  }
  return { ok: true };
});

ipcMain.handle("dist:list", () => readDist());

ipcMain.handle("dist:export", async () => {
  const all = readDist();
  if (all.length === 0) {
    return { ok: false, error: "暂无分发记录:在证书图墙右键「标记为已发送」后即会记录" };
  }
  const r = await dialog.showSaveDialog(win!, {
    title: "导出分发记录",
    defaultPath: "分发记录.xlsx",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (r.canceled || !r.filePath) return { ok: false };
  const wb = new (await import("exceljs")).Workbook();
  const ws = wb.addWorksheet("分发记录");
  ws.columns = [
    { header: "发送时间", key: "ts", width: 22 },
    { header: "学生", key: "studentName", width: 14 },
    { header: "专业", key: "major", width: 16 },
    { header: "级别", key: "level", width: 8 },
    { header: "证书编号", key: "certNo", width: 24 },
  ];
  for (const rec of all) {
    ws.addRow({ ...rec, ts: rec.ts.replace("T", " ").slice(0, 19) });
  }
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(r.filePath);
  return { ok: true, path: r.filePath, count: all.length };
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
