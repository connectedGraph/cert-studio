/**
 * 批量任务队列:单线程、限速、验证码人工协调。
 *
 * 流程(每个待查学生):
 *   取票 → 弹验证码(人工拖动) → 查询 → 存 cert.json → 逐证书触发 PDF 并轮询下载
 * 查询失败(票据过期/未验证)自动取新票重试,上限 SEARCH_RETRIES 次。
 *
 * 合规:验证码不做任何自动识别;学生间隔随机抖动,不对抗站点风控。
 */
import { BrowserWindow } from "electron";
import {
  getCaptchaCheckKey,
  searchCert,
  requestPdf,
  downloadOss,
  SearchResult,
} from "./certClient";
import {
  ensureStudentDir,
  saveCertJson,
  saveCertAssets,
  seasonText,
  examWayText,
} from "./store";
import { RosterStudent } from "./roster";
import { certEmail } from "./settings";

export type TaskStatus =
  | "pending"
  | "waiting_captcha"
  | "searching"
  | "fetching_pdf"
  | "done"
  | "failed";

export interface StudentTask {
  id: number;
  student: RosterStudent;
  status: TaskStatus;
  message?: string;
  certCount?: number;
}

type Listener = (event: QueueEvent) => void;

export type QueueEvent =
  | { type: "task_update"; task: StudentTask }
  | { type: "captcha_needed"; key: string; task: StudentTask }
  | { type: "all_done" };

const SEARCH_RETRIES = 3;
const PDF_POLL_INTERVAL_MS = 30_000;
const PDF_MAX_WAIT_MS = 10 * 60_000;
const STUDENT_GAP_MS_MIN = 3_000;
const STUDENT_GAP_MS_MAX = 8_000;

let running = false;
let stopRequested = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitterGap = () =>
  STUDENT_GAP_MS_MIN + Math.floor(Math.random() * (STUDENT_GAP_MS_MAX - STUDENT_GAP_MS_MIN));

export class CertQueue {
  private tasks: StudentTask[] = [];
  private listeners = new Set<Listener>();
  /** 渲染层确认验证码完成的 resolver */
  private captchaResolve: ((key: string) => void) | null = null;

  constructor(private win: BrowserWindow) {}

  onEvent(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(ev: QueueEvent) {
    for (const l of this.listeners) l(ev);
    // 同时广播给渲染层
    if (!this.win.isDestroyed()) {
      this.win.webContents.send("queue:event", ev);
    }
  }

  private update(task: StudentTask) {
    this.emit({ type: "task_update", task: { ...task } });
  }

  /** 渲染层在验证码 iframe 收到 on_captcha_success 后调用 */
  resolveCaptcha(): void {
    this.captchaResolve?.(this.pendingKey);
  }

  private pendingKey = "";

  /** 等待渲染层人工完成验证码;渲染层转发 on_captcha_success 后 resolve */
  private waitCaptcha(key: string, task: StudentTask): Promise<void> {
    this.pendingKey = key;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.captchaResolve = null;
        reject(new Error("验证码等待超时(3 分钟)"));
      }, 180_000);
      this.captchaResolve = () => {
        clearTimeout(timer);
        this.captchaResolve = null;
        resolve();
      };
      this.emit({ type: "captcha_needed", key, task: { ...task } });
    });
  }

  async enqueue(students: RosterStudent[]): Promise<void> {
    if (running) throw new Error("已有任务在运行");
    running = true;
    stopRequested = false;
    this.tasks = students.map((student, i) => ({
      id: i,
      student,
      status: "pending" as TaskStatus,
    }));
    for (const t of this.tasks) this.update(t);

    try {
      for (const task of this.tasks) {
        if (stopRequested) {
          task.status = "failed";
          task.message = "已手动停止";
          this.update(task);
          continue;
        }
        await this.runStudent(task);
        if (!stopRequested && task !== this.tasks[this.tasks.length - 1]) {
          await sleep(jitterGap());
        }
      }
    } finally {
      running = false;
      this.emit({ type: "all_done" });
    }
  }

  stop(): void {
    stopRequested = true;
  }

  get isRunning(): boolean {
    return running;
  }

  getTasks(): StudentTask[] {
    return this.tasks.map((t) => ({ ...t }));
  }

  private async runStudent(task: StudentTask): Promise<void> {
    const { name, idCard, certNo, examNo } = task.student;

    let lastMsg = "";
    for (let attempt = 1; attempt <= SEARCH_RETRIES; attempt++) {
      if (stopRequested) {
        task.status = "failed";
        task.message = "已手动停止";
        this.update(task);
        return;
      }

      // 1) 取票
      task.status = "waiting_captcha";
      task.message =
        attempt > 1 ? `第 ${attempt} 次取票(上次:${lastMsg})` : "等待人工验证码";
      this.update(task);

      let key: string;
      try {
        key = await getCaptchaCheckKey();
      } catch (e) {
        lastMsg = (e as Error).message;
        continue;
      }

      // 2) 人工验证码
      try {
        await this.waitCaptcha(key, task);
      } catch (e) {
        task.status = "failed";
        task.message = (e as Error).message;
        this.update(task);
        return;
      }

      // 3) 查询
      task.status = "searching";
      task.message = "查询中";
      this.update(task);
      const result: SearchResult = await searchCert({
        name,
        idCard: idCard || undefined,
        certNo: certNo || undefined,
        examNo: examNo || undefined,
        captchaCheckKey: key,
      });

      if (result.error === 0 && result.data) {
        await this.fetchPdfs(task, result);
        return;
      }
      lastMsg = result.msg ?? `error=${result.error}`;
      // error=5 请求过期 / 非 JSON(500) → 换新票重试;其他错误直接判失败
      if (result.error !== 5 && result.error !== -1) {
        task.status = "failed";
        task.message = lastMsg;
        this.update(task);
        return;
      }
    }

    task.status = "failed";
    task.message = `重试 ${SEARCH_RETRIES} 次仍失败:${lastMsg}`;
    this.update(task);
  }

  private async fetchPdfs(task: StudentTask, result: SearchResult): Promise<void> {
    const data = result.data!;
    const email = certEmail() || undefined;
    const { dir } = ensureStudentDir(outRootDir, task.student.name, task.student.idCard);
    saveCertJson(dir, result);

    task.status = "fetching_pdf";
    task.certCount = data.length;
    task.message = `已存 ${data.length} 条记录,生成 PDF 中`;
    this.update(task);

    let okCount = 0;
    for (const rec of data) {
      if (!rec.cert_no || !rec.is_deply_cert) continue;
      const season = `${rec.apply_year}${rec.is_summer}`;
      try {
        const asset = await this.pollPdf({
          certNo: rec.cert_no,
          season,
          idCard: task.student.idCard,
          email,
        });
        if (!asset.pdf_url || !asset.preview_img) continue;
        const [pdfBuf, pngBuf] = await Promise.all([
          downloadOss(asset.pdf_url),
          downloadOss(asset.preview_img),
        ]);
        await saveCertAssets(dir, rec, pdfBuf, pngBuf);
        okCount++;
      } catch (e) {
        task.message = `证书 ${rec.cert_no} PDF 获取失败:${(e as Error).message}`;
        this.update(task);
      }
      await sleep(2_000); // 证书间轻限速
    }

    task.status = "done";
    task.message = `完成:${okCount}/${data.length} 个 PDF`;
    this.update(task);
  }

  private async pollPdf(params: {
    certNo: string;
    season: string;
    idCard: string;
    email?: string;
  }): Promise<{ pdf_url?: string; preview_img?: string }> {
    const deadline = Date.now() + PDF_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      const res = await requestPdf({ ...params });
      if (res.error === 0 && res.pdf_url) {
        return { pdf_url: res.pdf_url, preview_img: res.preview_img };
      }
      // 后台生成中 → 等到 pdf_complete_time(留 2s 余量),否则固定间隔
      const completeAt = res.pdf_complete_time ? Number(res.pdf_complete_time) * 1000 : 0;
      const wait = Math.max(completeAt - Date.now() + 2_000, 15_000);
      await sleep(Math.min(wait, PDF_POLL_INTERVAL_MS));
    }
    throw new Error("PDF 等待超时(10 分钟)");
  }
}

// ---- 全局输出目录(主进程设置,queue 使用) ----
let outRootDir = "";

export function setOutRoot(dir: string): void {
  outRootDir = dir;
}

export function getOutRoot(): string {
  return outRootDir;
}
