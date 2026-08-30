/**
 * 导出视图:从已产出目录汇总 XLSX。
 */
import { useState } from "react";

interface StoredCert {
  dir: string;
  studentName: string;
  record: {
    major_name: string;
    level: number;
    cert_no: string;
    exam_no: string;
    made_cert_ymd: string;
    apply_year: string;
    is_summer: string;
    exam_way: number;
    is_excellent: number;
    is_settlement: number;
    is_deply_cert: number;
  };
}

const EXAM_WAYS = ["现场考试", "视频考试", "音基考试", "AI智慧考试"];
const SEASONS: Record<string, string> = {
  "3": "春季", "1": "夏季", "2": "秋季", "0": "冬季", "4": "暑假", "5": "寒假", "9": "",
};

export default function ExportView() {
  const [count, setCount] = useState<number | null>(null);

  const doExport = async () => {
    const certs = (await window.api.scanCerts()) as StoredCert[];
    if (certs.length === 0) {
      alert("暂无已获取的证书数据,请先运行查询任务。");
      return;
    }
    const rows = certs.map((c) => ({
      姓名: c.studentName,
      专业: c.record.major_name,
      级别: c.record.level,
      证书编号: c.record.cert_no,
      准考证号: c.record.exam_no,
      发证日期: c.record.made_cert_ymd,
      考试时间: `${c.record.apply_year}年${SEASONS[c.record.is_summer] ?? ""}`,
      考试方式: EXAM_WAYS[c.record.exam_way] ?? String(c.record.exam_way),
      等次: c.record.is_excellent === 2 ? "优秀" : "合格",
      状态: c.record.is_deply_cert ? "已发证" : c.record.is_settlement ? "暂无证书" : "成绩未公布",
    }));
    const path = (await window.api.exportSummary(rows)) as string | null;
    if (path) {
      setCount(rows.length);
      alert(`已导出 ${rows.length} 条记录:${path}`);
    }
  };

  return (
    <div className="card">
      <div className="row">
        <button className="btn" onClick={doExport}>
          导出证书汇总 XLSX
        </button>
        <span className="muted">
          {count != null ? `上次导出 ${count} 条` : "汇总当前输出目录内全部证书记录"}
        </span>
      </div>
      <div className="mt8 muted" style={{ fontSize: 13 }}>
        列:姓名 / 专业 / 级别 / 证书编号 / 准考证号 / 发证日期 / 考试时间 / 考试方式 / 等次 / 状态
      </div>
    </div>
  );
}
