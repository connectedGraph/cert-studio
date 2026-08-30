/**
 * XLSX/JSON 名册读写。
 * 名册列定义:姓名(必填)、身份证号(必填)、证书编号(选填)、准考证号(选填)
 */
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

export interface RosterStudent {
  name: string;
  idCard: string;
  certNo?: string;
  examNo?: string;
}

export interface RosterParseResult {
  students: RosterStudent[];
  errors: string[]; // 行级错误描述
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v && v.result != null) return String(v.result).trim();
    return "";
  }
  return String(v).trim();
}

export async function parseRoster(filePath: string): Promise<RosterParseResult> {
  const ext = path.extname(filePath).toLowerCase();
  const errors: string[] = [];
  const students: RosterStudent[] = [];

  if (ext === ".json") {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Array<
      Record<string, unknown>
    >;
    raw.forEach((row, i) => {
      const name = String(row["姓名"] ?? row["name"] ?? "").trim();
      const idCard = String(row["身份证号"] ?? row["id_card"] ?? "").trim();
      if (!name || !idCard) {
        errors.push(`第 ${i + 1} 条:缺姓名或身份证号`);
        return;
      }
      students.push({
        name,
        idCard,
        certNo: String(row["证书编号"] ?? row["cert_no"] ?? "").trim() || undefined,
        examNo: String(row["准考证号"] ?? row["exam_no"] ?? "").trim() || undefined,
      });
    });
    return { students, errors };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) return { students, errors: ["XLSX 无工作表"] };

  // 首行为表头,建立列索引
  const headerRow = ws.getRow(1);
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, col) => {
    const text = cellText(cell.value);
    if (text) colMap[text] = col;
  });

  const colOf = (...names: string[]): number | undefined => {
    for (const n of names) {
      if (colMap[n] != null) return colMap[n];
    }
    return undefined;
  };

  const cName = colOf("姓名", "name");
  const cId = colOf("身份证号", "证件号码", "id_card");
  const cCert = colOf("证书编号", "cert_no");
  const cExam = colOf("准考证号", "exam_no");

  if (cName == null || cId == null) {
    errors.push('缺少必需列:需包含"姓名"与"身份证号"列');
    return { students, errors };
  }

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = cellText(row.getCell(cName).value);
    const idCard = cellText(row.getCell(cId).value);
    if (!name && !idCard) return; // 空行
    if (!name || !idCard) {
      errors.push(`第 ${rowNumber} 行:缺姓名或身份证号`);
      return;
    }
    students.push({
      name,
      idCard,
      certNo: cCert != null ? cellText(row.getCell(cCert).value) || undefined : undefined,
      examNo: cExam != null ? cellText(row.getCell(cExam).value) || undefined : undefined,
    });
  });

  return { students, errors };
}

export interface ExportRow {
  姓名: string;
  专业: string;
  级别: number | string;
  证书编号: string;
  准考证号: string;
  发证日期: string;
  考试时间: string;
  考试方式: string;
  等次: string;
  状态: string;
}

export async function exportSummary(rows: ExportRow[], filePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("证书汇总");
  ws.columns = Object.keys(rows[0] ?? ({} as ExportRow)).map((header) => ({
    header,
    key: header,
    width: 18,
  }));
  for (const r of rows) {
    ws.addRow(r as unknown as ExcelJS.CellValue[]);
  }
  // 表头样式
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(filePath);
}

export async function exportRosterTemplate(filePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("名册");
  ws.columns = [
    { header: "姓名", key: "name", width: 16 },
    { header: "身份证号", key: "idCard", width: 24 },
    { header: "证书编号", key: "certNo", width: 24 },
    { header: "准考证号", key: "examNo", width: 24 },
  ];
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(filePath);
}
