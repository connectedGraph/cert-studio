/**
 * 产出目录管理:每学生一目录。
 * <outRoot>/<姓名>_<身份证后4位>/
 *   cert.json
 *   <专业><级别>_<证书编号>.pdf
 *   <专业><级别>_<证书编号>.png
 */
import fs from "node:fs";
import path from "node:path";
import { CertRecord } from "./certClient";

const EXAM_WAYS = ["现场考试", "视频考试", "音基考试", "AI智慧考试"];

export function examWayText(way: number): string {
  return EXAM_WAYS[way] ?? `方式${way}`;
}

export function seasonText(isSummer: string): string {
  const map: Record<string, string> = {
    "3": "春季",
    "1": "夏季",
    "2": "秋季",
    "0": "冬季",
    "4": "暑假",
    "5": "寒假",
    "9": "",
  };
  return map[isSummer] ?? isSummer;
}

export interface StudentDirInfo {
  dir: string;
  certJsonPath: string;
}

export function studentDirName(name: string, idCard: string): string {
  // 目录名只保留身份证后 4 位,避免完整证件号出现在目录树上
  const tail = idCard ? idCard.slice(-4) : "unknown";
  return `${name}_${tail}`;
}

export function ensureStudentDir(outRoot: string, name: string, idCard: string): StudentDirInfo {
  const dir = path.join(outRoot, studentDirName(name, idCard));
  fs.mkdirSync(dir, { recursive: true });
  return { dir, certJsonPath: path.join(dir, "cert.json") };
}

export function saveCertJson(dir: string, payload: unknown): string {
  const p = path.join(dir, "cert.json");
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), "utf-8");
  return p;
}

export function certFileName(rec: CertRecord, ext: "pdf" | "png"): string {
  const cleanMajor = rec.major_name.replace(/[\\/:*?"<>|]/g, "");
  return `${cleanMajor}${rec.level}级_${rec.cert_no}.${ext}`;
}

export async function saveCertAssets(
  dir: string,
  rec: CertRecord,
  pdfBuf: Buffer,
  pngBuf: Buffer
): Promise<{ pdfPath: string; pngPath: string }> {
  const pdfPath = path.join(dir, certFileName(rec, "pdf"));
  const pngPath = path.join(dir, certFileName(rec, "png"));
  fs.writeFileSync(pdfPath, pdfBuf);
  fs.writeFileSync(pngPath, pngBuf);
  return { pdfPath, pngPath };
}

export interface StoredCert {
  dir: string;
  studentName: string;
  record: CertRecord;
  pdfPath: string;
  pngPath: string;
}

/** 扫描输出根目录,重建图墙索引(读每目录 cert.json) */
export function scanOutput(outRoot: string): StoredCert[] {
  if (!fs.existsSync(outRoot)) return [];
  const result: StoredCert[] = [];
  for (const entry of fs.readdirSync(outRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(outRoot, entry.name);
    const certJsonPath = path.join(dir, "cert.json");
    if (!fs.existsSync(certJsonPath)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(certJsonPath, "utf-8")) as {
        data?: CertRecord[];
      };
      const name = payload.data?.[0]?.student_name ?? entry.name;
      for (const rec of payload.data ?? []) {
        const pdfPath = path.join(dir, certFileName(rec, "pdf"));
        const pngPath = path.join(dir, certFileName(rec, "png"));
        if (fs.existsSync(pdfPath) && fs.existsSync(pngPath)) {
          result.push({ dir, studentName: name, record: rec, pdfPath, pngPath });
        }
      }
    } catch {
      // 损坏的 cert.json 跳过
    }
  }
  return result;
}
