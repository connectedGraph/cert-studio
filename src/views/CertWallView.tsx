/**
 * 证书图墙:网格展示证书预览图。
 *
 * 交互:
 * - 单击卡片 = 复制图片(主流程:复制后切微信 Ctrl+V 发送)
 * - 卡片下方小按钮:打开 PDF / 标记已发送 / 打开文件夹
 * - 右键 = 完整菜单(复制图片 / 打开 PDF / 标记为已发送 / 打开所在文件夹)
 *
 * 显示原理:渲染层是 http 页面,不能直接 <img src="C:/...">,
 * 预览图经 IPC 读文件转 data URL 显示;学生目录里的 PNG 文件本身保留
 * (微信分发用的是实体文件,不是这里的预览)。
 */
import { useCallback, useEffect, useState } from "react";

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
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  const refresh = useCallback(async () => {
    const list = (await window.api.scanCerts()) as StoredCert[];
    setCerts(list);
    const dist = (await window.api.listDist()) as DistRecord[];
    setSent(new Set(dist.map((d) => d.certNo)));

    // 批量读预览图(data URL),已缓存的跳过
    const next: Record<string, string> = {};
    await Promise.all(
      list.map(async (c) => {
        if (previews[c.pngPath]) {
          next[c.pngPath] = previews[c.pngPath];
          return;
        }
        const r = (await window.api.readImage(c.pngPath)) as {
          ok: boolean;
          dataUrl?: string;
        };
        if (r.ok && r.dataUrl) next[c.pngPath] = r.dataUrl;
      })
    );
    setPreviews(next);
  }, [previews]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyImage = async (c: StoredCert) => {
    const r = (await window.api.copyImage(c.pngPath)) as { ok: boolean; error?: string };
    showToast(r.ok ? `已复制「${c.studentName} ${c.record.major_name}」图片,切到微信 Ctrl+V 发送` : (r.error ?? "复制失败"));
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
            <b>单击证书 = 复制图片</b>,切到微信聊天窗口 Ctrl+V 即可发送;右键有更多操作。
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
              onClick={() => copyImage(c)}
              onContextMenu={(e) => {
                // 阻止冒泡,否则 window 级关闭监听会立刻把菜单关掉
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(
                  [
                    { label: "复制图片", fn: () => copyImage(c) },
                    { label: "打开 PDF", fn: () => openPdf(c) },
                    { label: "标记为已发送", fn: () => markSent(c) },
                    { label: "打开所在文件夹", fn: () => openFolder(c) },
                  ],
                  e.clientX,
                  e.clientY
                );
              }}
              title="单击:复制图片(微信 Ctrl+V 发送) · 右键:更多操作"
            >
              <div style={{ position: "relative" }}>
                {previews[c.pngPath] ? (
                  <img src={previews[c.pngPath]} alt={`${c.studentName} ${c.record.major_name}`} />
                ) : (
                  <div className="wall-placeholder">加载中…</div>
                )}
                {sent.has(c.record.cert_no) && (
                  <div className="sent-badge">已发送</div>
                )}
              </div>
              <div className="meta">
                <div className="t">
                  {c.studentName} · {c.record.major_name} {c.record.level}级
                  {c.record.is_excellent === 2 ? "(优秀)" : ""}
                </div>
                <div className="s">发证 {c.record.made_cert_ymd}</div>
                <div className="row mt8" style={{ gap: 6 }}>
                  <button
                    className="btn ghost mini"
                    onClick={(e) => { e.stopPropagation(); openPdf(c); }}
                  >
                    PDF
                  </button>
                  <button
                    className="btn ghost mini"
                    onClick={(e) => { e.stopPropagation(); markSent(c); }}
                  >
                    {sent.has(c.record.cert_no) ? "重标发送" : "标记发送"}
                  </button>
                  <button
                    className="btn ghost mini"
                    onClick={(e) => { e.stopPropagation(); openFolder(c); }}
                  >
                    文件夹
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** 右键菜单(位置由调用处事件坐标决定;菜单建好后下一帧才挂关闭监听,避免自关闭) */
function showContextMenu(
  menu: { label: string; fn: () => void }[],
  x: number,
  y: number
) {
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
    "min-width:150px",
  ].join(";");
  for (const item of menu) {
    const opt = document.createElement("div");
    opt.textContent = item.label;
    opt.style.cssText =
      "padding:8px 14px;border-radius:6px;cursor:pointer;font-size:13px";
    opt.onmouseenter = () => (opt.style.background = "#e8f3ff");
    opt.onmouseleave = () => (opt.style.background = "transparent");
    opt.onclick = (e) => {
      e.stopPropagation();
      item.fn();
      el.remove();
      cleanup();
    };
    el.appendChild(opt);
  }
  el.style.left = `${Math.min(x, window.innerWidth - 165)}px`;
  el.style.top = `${Math.min(y, window.innerHeight - 160)}px`;
  document.body.appendChild(el);

  const onOutside = () => {
    el.remove();
    cleanup();
  };
  const cleanup = () => {
    window.removeEventListener("click", onOutside);
    window.removeEventListener("contextmenu", onOutside);
  };
  // 下一帧再监听,防止触发本菜单的那次 contextmenu/click 事件立即关掉它
  setTimeout(() => {
    window.addEventListener("click", onOutside);
    window.addEventListener("contextmenu", onOutside);
  }, 0);
}
