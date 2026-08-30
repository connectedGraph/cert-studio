/**
 * 查询任务视图:批量进度 + 验证码 iframe 面板。
 *
 * 验证码机制与官方页面一致:内嵌 capt.zgyyxykj.com 的旋转验证码 iframe,
 * 用户人工拖动完成后,iframe 会向父窗口 postMessage("on_captcha_success"),
 * 这里监听到后通知主进程继续队列。
 */
import { useEffect, useState } from "react";

interface StudentTask {
  id: number;
  student: { name: string; idCard: string };
  status: string;
  message?: string;
  certCount?: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "等待",
  waiting_captcha: "待验证码",
  searching: "查询中",
  fetching_pdf: "获取 PDF",
  done: "完成",
  failed: "失败",
};

export default function TaskView() {
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [captcha, setCaptcha] = useState<{ key: string; name: string } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const off = window.api.onQueueEvent((ev) => {
      if (ev.type === "task_update" && ev.task) {
        const t = ev.task as StudentTask;
        setTasks((prev) => {
          const idx = prev.findIndex((x) => x.id === t.id);
          if (idx === -1) return [...prev, t];
          const next = [...prev];
          next[idx] = t;
          return next;
        });
      } else if (ev.type === "captcha_needed" && ev.task && ev.key) {
        const t = ev.task as StudentTask;
        setCaptcha({ key: ev.key, name: t.student.name });
      } else if (ev.type === "all_done") {
        setRunning(false);
        setCaptcha(null);
      }
    });
    return () => {
      off();
    };
  }, []);

  const start = async () => {
    const r = (await window.api.startQueueFromRoster()) as { ok: boolean; error?: string } | null;
    if (r && !r.ok) {
      alert(r.error ?? "启动失败");
      return;
    }
    setRunning(true);
    setTasks(await window.api.listTasks());
  };

  const stop = async () => {
    await window.api.stopQueue();
  };

  // 验证码 iframe 的 on_captcha_success 消息
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data === "on_captcha_success") {
        window.api.resolveCaptcha();
        setCaptcha(null);
      } else if (ev.data === "on_captcha_close") {
        setCaptcha(null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const failCount = tasks.filter((t) => t.status === "failed").length;

  return (
    <>
      <div className="card">
        <div className="row">
          {!running ? (
            <button className="btn" onClick={start} disabled={tasks.length === 0 && !rosterLoaded()}>
              开始批量查询
            </button>
          ) : (
            <button className="btn danger" onClick={stop}>
              停止
            </button>
          )}
          <span className="muted">
            {tasks.length > 0
              ? `共 ${tasks.length} 人 · 完成 ${doneCount} · 失败 ${failCount}`
              : "请先在「名册」页导入学生名单"}
          </span>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>姓名</th>
                <th>状态</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.id + 1}</td>
                  <td>{t.student.name}</td>
                  <td>
                    <span className={`status-pill ${t.status}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="muted">{t.message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {captcha && (
        <div className="captcha-panel">
          <div className="captcha-box">
            <h3>请完成人工验证:{captcha.name}</h3>
            <div className="hint">
              拖动滑块将图片转正。验证码与官方站一致,票据有效期短,请尽快完成。
            </div>
            <div className="captcha-frame-wrap">
              <iframe
                key={captcha.key}
                src={`https://capt.zgyyxykj.com/captcha?key=${captcha.key}`}
                title="captcha"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function rosterLoaded(): boolean {
  // 由主进程判断名册是否已导入;此处始终允许点击,由主进程返回错误提示
  return true;
}
