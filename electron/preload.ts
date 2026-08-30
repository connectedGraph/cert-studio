/**
 * preload:经 contextBridge 暴露类型安全的最小 API 面。
 */
import { contextBridge, ipcRenderer } from "electron";

export interface QueueEventPayload {
  type: "task_update" | "captcha_needed" | "all_done";
  task?: unknown;
  key?: string;
}

const api = {
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (patch: { outRoot?: string; email?: string }) =>
    ipcRenderer.invoke("settings:set", patch),
  chooseOutRoot: () => ipcRenderer.invoke("settings:chooseOutRoot"),

  importRoster: () => ipcRenderer.invoke("roster:import"),
  getRoster: () => ipcRenderer.invoke("roster:get"),
  addRosterEntry: (entry: { name: string; idCard: string; certNo?: string; examNo?: string }) =>
    ipcRenderer.invoke("roster:add", entry),
  removeRosterEntry: (index: number) => ipcRenderer.invoke("roster:remove", index),
  clearRoster: () => ipcRenderer.invoke("roster:clear"),
  downloadTemplate: () => ipcRenderer.invoke("roster:downloadTemplate"),

  startQueueFromRoster: () => ipcRenderer.invoke("queue:startFromRoster"),
  startQueueSingle: (student: { name: string; idCard: string; certNo?: string; examNo?: string }) =>
    ipcRenderer.invoke("queue:startSingle", student),
  startQueue: (
    students: { name: string; idCard: string; certNo?: string; examNo?: string }[]
  ) => ipcRenderer.invoke("queue:start", students),
  stopQueue: () => ipcRenderer.invoke("queue:stop"),
  listTasks: () => ipcRenderer.invoke("queue:list"),

  resolveCaptcha: () => ipcRenderer.invoke("captcha:resolved"),

  scanCerts: () => ipcRenderer.invoke("certs:scan"),
  copyImage: (pngPath: string) => ipcRenderer.invoke("certs:copyImage", pngPath),
  openPdf: (pdfPath: string) => ipcRenderer.invoke("certs:openPdf", pdfPath),
  openFolder: (dir: string) => ipcRenderer.invoke("certs:openFolder", dir),

  exportSummary: (rows: unknown[]) => ipcRenderer.invoke("export:summary", rows),

  onQueueEvent: (cb: (ev: QueueEventPayload) => void) => {
    const handler = (_e: unknown, ev: QueueEventPayload) => cb(ev);
    ipcRenderer.on("queue:event", handler);
    return () => ipcRenderer.removeListener("queue:event", handler);
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
