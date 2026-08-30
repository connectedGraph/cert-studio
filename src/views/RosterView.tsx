/**
 * 名册视图:导入 XLSX/JSON 与手动添加统一管理,支持单行删除、单人临时查询。
 */
import { useEffect, useState } from "react";

interface RosterEntry {
  name: string;
  idCard: string;
  certNo?: string;
  examNo?: string;
}

export default function RosterView({ onGoTasks }: { onGoTasks: () => void }) {
  const [students, setStudents] = useState<RosterEntry[]>([]);
  const [importInfo, setImportInfo] = useState<{ path: string; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  // 手动添加表单
  const [name, setName] = useState("");
  const [idCard, setIdCard] = useState("");
  const [certNo, setCertNo] = useState("");
  const [examNo, setExamNo] = useState("");
  const [formMsg, setFormMsg] = useState("");

  useEffect(() => {
    void (async () => {
      setStudents((await window.api.getRoster()) as RosterEntry[]);
    })();
  }, []);

  const doImport = async () => {
    setBusy(true);
    try {
      const r = (await window.api.importRoster()) as
        | { path: string; students: RosterEntry[]; errors: string[] }
        | null;
      if (r) {
        setStudents(r.students);
        setImportInfo({ path: r.path, errors: r.errors });
      }
    } finally {
      setBusy(false);
    }
  };

  const doTemplate = async () => {
    const p = await window.api.downloadTemplate();
    if (p) alert(`模板已保存:${p}`);
  };

  const doAdd = async (alsoQuery: boolean) => {
    setFormMsg("");
    const r = (await window.api.addRosterEntry({
      name,
      idCard,
      certNo: certNo || undefined,
      examNo: examNo || undefined,
    })) as { ok: boolean; error?: string; roster: RosterEntry[] };
    if (!r.ok) {
      setFormMsg(r.error ?? "添加失败");
      return;
    }
    setStudents(r.roster);
    setName("");
    setIdCard("");
    setCertNo("");
    setExamNo("");
    if (alsoQuery) {
      const q = (await window.api.startQueueSingle({ name, idCard })) as {
        ok: boolean;
        error?: string;
      };
      if (!q.ok) {
        setFormMsg(q.error ?? "启动查询失败");
        return;
      }
      onGoTasks();
    }
  };

  const doRemove = async (index: number) => {
    const r = (await window.api.removeRosterEntry(index)) as { roster: RosterEntry[] };
    setStudents(r.roster);
  };

  const doClear = async () => {
    if (!students.length) return;
    if (!confirm(`清空名册中的 ${students.length} 条记录?(不影响已下载的证书)`)) return;
    const r = (await window.api.clearRoster()) as { roster: RosterEntry[] };
    setStudents(r.roster);
    setImportInfo(null);
  };

  return (
    <>
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>手动添加 / 临时查询</h3>
        <div className="row">
          <input
            className="input"
            placeholder="姓名 *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: 140 }}
          />
          <input
            className="input"
            placeholder="身份证号 *"
            value={idCard}
            onChange={(e) => setIdCard(e.target.value)}
            style={{ width: 220 }}
          />
          <input
            className="input"
            placeholder="证书编号(选填)"
            value={certNo}
            onChange={(e) => setCertNo(e.target.value)}
            style={{ width: 200 }}
          />
          <input
            className="input"
            placeholder="准考证号(选填)"
            value={examNo}
            onChange={(e) => setExamNo(e.target.value)}
            style={{ width: 200 }}
          />
        </div>
        <div className="row mt8">
          <button className="btn ghost" onClick={() => doAdd(false)}>
            加入名册
          </button>
          <button className="btn" onClick={() => doAdd(true)}>
            立即查询此人
          </button>
          <span className="muted">
            「立即查询此人」直接进入查询任务(需完成一次人工验证码)
          </span>
        </div>
        {formMsg && <div className="mt8" style={{ color: "var(--fail)" }}>{formMsg}</div>}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <button className="btn" onClick={doImport} disabled={busy}>
              导入名册(XLSX / JSON)
            </button>
            <button className="btn ghost" onClick={doTemplate}>
              下载名册模板
            </button>
          </div>
          <button className="btn ghost" onClick={doClear} disabled={students.length === 0}>
            清空名册
          </button>
        </div>
        {importInfo && (
          <div className="mt8 muted" style={{ fontSize: 13 }}>
            已导入:{importInfo.path}
            {importInfo.errors.length > 0 && (
              <span style={{ color: "var(--fail)" }}>
                {importInfo.errors.length} 条异常
              </span>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>名册({students.length})</b>
          {students.length > 0 && (
            <button className="btn" onClick={onGoTasks}>
              批量查询全部 →
            </button>
          )}
        </div>

        {students.length === 0 ? (
          <div className="muted mt8">名册为空。手动添加,或导入 XLSX/JSON 文件。</div>
        ) : (
          <table className="tbl mt8">
            <thead>
              <tr>
                <th>#</th>
                <th>姓名</th>
                <th>身份证号</th>
                <th>证书编号</th>
                <th>准考证号</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={`${s.name}-${s.idCard}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{s.name}</td>
                  <td>{s.idCard}</td>
                  <td>{s.certNo ?? "-"}</td>
                  <td>{s.examNo ?? "-"}</td>
                  <td>
                    <button
                      className="btn ghost"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => doRemove(i)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
