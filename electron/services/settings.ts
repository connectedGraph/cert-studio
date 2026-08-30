/**
 * 轻量设置持久化(JSON 文件,存于 userData)。
 * 只存:输出目录、接收邮箱。不存任何名册数据。
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

interface Settings {
  outRoot?: string;
  email?: string;
}

const file = () => path.join(app.getPath("userData"), "settings.json");

let cache: Settings | null = null;

export function loadSettings(): Settings {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), "utf-8")) as Settings;
  } catch {
    cache = {};
  }
  return cache!;
}

export function saveSettings(patch: Partial<Settings>): void {
  cache = { ...loadSettings(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cache, null, 2), "utf-8");
}

export function outRootDir(): string {
  return loadSettings().outRoot ?? "";
}

export function certEmail(): string {
  return loadSettings().email ?? "";
}
