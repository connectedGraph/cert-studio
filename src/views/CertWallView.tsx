/**
 * 证书图墙:网格展示预览图。
 * 右键:复制图片 / 打开 PDF / 标记为已发送 / 打开所在文件夹。
 * 左键:打开 PDF。已发送的证书显示角标,防止重复/漏发。
 */
import { useEffect, useState } from "react";

interface StoredCert {
  dir: string;
  studentName: string;
  record: {
    major_name: string;
    level: number;
    cert_no: string;
    made_cert_ymd: string;
    is_excellent: number;
  };
  pdfPath: string;
  pngPath: string;
}

interface DistRecord {
  ts: string;
  studentName: string;
  major: string;
  level: number | string;
  certNo: string;
}

export default function CertWallView() {
  const [certs, setCerts] = useState<StoredCert[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");

  const refresh = async () => {
    setCerts((await window.api.scanCerts()) as StoredCert[]);
    const dist = (await window.api.listDist()) as DistRecord[];
    setSent(new Set(dist.map((d) => d.certNo)));
  };

  useEffect(() => {
    void refresh();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  };

  const copyImage = async (c: StoredCert) => {
    const r = (await window.api.copyImage(c.pngPath)) as { ok: boolean; error?: string };
    showToast(
      r.ok ? "已复制图片,可到微信直接 Ctrl+V 粘贴发送" : (r.error ?? "复制失败")
    );
  };

  const openPdf = async (c: StoredCert) => {
    const r = (await window.api.openPdf(c.pdfPath)) as { ok: boolean; error?: string };
    if (!r.ok) showToast(r.error ?? "打开失败");
  };

  const openFolder = async (c: StoredCert) => {
    await window.api.openFolder(c.dir);
  };

  const markSent = async (c: StoredCert) => {
    const r = (await window.api.markSent({
      studentName: c.studentName,
      major: c.record.major_name,
      level: c.record.level,
      certNo: c.record.cert_no,
    })) as { ok: boolean; error?: string };
    if (r.ok) {
      setSent((prev) => new Set(prev).add(c.record.cert_no));
      showToast("已标记为发送完成");
    } else {
      showToast(r.error ?? "记录失败");
    }
  };

  const exportDist = async () => {
    const r = (await window.api.exportDist()) as {
      ok: boolean;
      error?: string;
      path?: string;
      count?: number;
    };
    if (r.ok) showToast(`分发记录已导出(${r.count} 条):${r.path}`);
    else if (r.error) showToast(r.error);
  };

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">
            右键证书:复制图片 / 打开 PDF / 标记为已发送。复制后切到微信聊天窗口 Ctrl+V 即可发送。
          </span>
          <div className="row">
            <button className="btn ghost" onClick={exportDist}>
              导出分发记录
            </button>
            <button className="btn ghost" onClick={refresh}>
              刷新
            </button>
          </div>
        </div>
      </div>

      {certs.length === 0 ? (
        <div className="card muted">暂无证书。请先运行「查询任务」批量获取。</div>
      ) : (
        <div className="wall">
          {certs.map((c) => (
            <div
              key={c.record.cert_no || c.pdfPath}
              className="wall-item"
              onContextMenu={(e) => {
                e.preventDefault();
                showContextMenu([
                  { label: "复制图片", fn: () => copyImage(c) },
                  { label: "打开 PDF", fn: () => openPdf(c) },
                  {
                    label: sent.has(c.record.cert_no) ? "取消发送标记(调试)" : "标记为已发送",
                    fn: () => markSent(c),
                  },
                  { label: "打开所在文件夹", fn: () => openFolder(c) },
                ]);
              }}
              onClick={() => openPdf(c)}
              title="左键:打开 PDF · 右键:复制图片"
            >
              <div style={{ position: "relative" }}>
                <img src={c.pngPath} alt={`${c.studentName} ${c.record.major_name}`} />
                {sent.has(c.record.cert_no) && (
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      background: "var(--ok)",
                      color: "#fff",
                      borderRadius: 10,
                      padding: "2px 10px",
                      fontSize: 12,
                    }}
                  >
                    已发送
                  </div>
                )}
              </div>
              <div className="meta">
                <div className="t">
                  {c.studentName} · {c.record.major_name} {c.record.level}级
                  {c.record.is_excellent === 2 ? "(优秀)" : ""}
                </div>
                <div className="s">发证 {c.record.made_cert_ymd}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** 简易右键菜单(Electron 环境原生菜单经主进程成本高,用 DOM 菜单足够) */
function showContextMenu(menu: { label: string; fn: () => void }[]) {
  const existing = document.getElementById("ctx-menu");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "ctx-menu";
  el.style.cssText = [
    "position:fixed",
    "z-index:300",
    "background:#fff",
    "border:1px solid #e5e6eb",
    "border-radius:8px",
    "box-shadow:0 4px 16px rgba(0,0,0,.1)",
    "padding:4px",
    "min-width:140px",
  ].join(";");
  for (const item of menu) {
    const opt = document.createElement("div");
    opt.textContent = item.label;
    opt.style.cssText =
      "padding:8px 14px;border-radius:6px;cursor:pointer;font-size:13px";
    opt.onmouseenter = () => (opt.style.background = "#e8f3ff");
    opt.onmouseleave = () => (opt.style.background = "transparent");
    opt.onclick = () => {
      item.fn();
      el.remove();
    };
    el.appendChild(opt);
  }
  const place = (x: number, y: number) => {
    el.style.left = `${Math.min(x, window.innerWidth - 160)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - 130)}px`;
  };
  document.body.appendChild(el);
  const close = () => {
    el.remove();
    window.removeEventListener("click", close);
    window.removeEventListener("contextmenu", close);
  };
  window.addEventListener("click", close);
  window.addEventListener("contextmenu", close);
}
