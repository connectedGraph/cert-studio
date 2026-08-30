import { useState } from "react";
import RosterView from "./views/RosterView";
import TaskView from "./views/TaskView";
import CertWallView from "./views/CertWallView";
import ExportView from "./views/ExportView";
import SettingsView from "./views/SettingsView";

type Tab = "roster" | "tasks" | "wall" | "export" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "roster", label: "名册" },
  { key: "tasks", label: "查询任务" },
  { key: "wall", label: "证书图墙" },
  { key: "export", label: "导出" },
  { key: "settings", label: "设置" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("roster");

  return (
    <>
      <div className="topbar">
        <h1>Cert Studio</h1>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          仅限查询本人或已授权考生 · 验证码需人工完成
        </span>
      </div>
      <div className="main">
        {tab === "roster" && <RosterView onGoTasks={() => setTab("tasks")} />}
        {tab === "tasks" && <TaskView />}
        {tab === "wall" && <CertWallView />}
        {tab === "export" && <ExportView />}
        {tab === "settings" && <SettingsView />}
      </div>
    </>
  );
}
