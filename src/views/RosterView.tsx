import { useState } from "react";

interface RosterResponse {
  path: string;
  students: { name: string; idCard: string; certNo?: string; examNo?: string }[];
  errors: string[];
}

export default function RosterView({ onGoTasks }: { onGoTasks: () => void }) {
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const doImport = async () => {
    setBusy(true);
    try {
      const r = (await window.api.importRoster()) as RosterResponse | null;
      if (r) setRoster(r);
    } finally {
      setBusy(false);
    }
  };

  const doTemplate = async () => {
    const p = await window.api.downloadTemplate();
    if (p) alert(`模板已保存:${p}`);
  };

  return (
    <>
      <div className="card">
        <div className="row">
          <button className="btn" onClick={doImport} disabled={busy}>
            导入名册(XLSX / JSON)
          </button>
          <button className="btn ghost" onClick={doTemplate}>
            下载名册模板
          </button>
          <span className="muted">
            必填列:姓名、身份证号;选填列:证书编号、准考证号
          </span>
        </div>
      </div>

      {roster && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <b>{roster.path}</b>
              <span className="muted" style={{ marginLeft: 8 }}>
                共 {roster.students.length} 名学生
                {roster.errors.length > 0 && `,${roster.errors.length} 条异常`}
              </span>
            </div>
            <button className="btn" onClick={onGoTasks}>
              前往查询任务 →
            </button>
          </div>

          {roster.errors.length > 0 && (
            <div className="mt8" style={{ color: "var(--fail)", fontSize: 13 }}>
              {roster.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <table className="tbl mt16">
            <thead>
              <tr>
                <th>#</th>
                <th>姓名</th>
                <th>身份证号</th>
                <th>证书编号</th>
                <th>准考证号</th>
              </tr>
            </thead>
            <tbody>
              {roster.students.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{s.name}</td>
                  <td>{s.idCard}</td>
                  <td>{s.certNo ?? "-"}</td>
                  <td>{s.examNo ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
