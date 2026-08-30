import { useEffect, useState } from "react";

export default function SettingsView() {
  const [outRoot, setOutRoot] = useState("");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = (await window.api.settingsGet()) as { outRoot?: string; email?: string };
      setOutRoot(s.outRoot ?? "");
      setEmail(s.email ?? "");
    })();
  }, []);

  const choose = async () => {
    const dir = (await window.api.chooseOutRoot()) as string | null;
    if (dir) setOutRoot(dir);
  };

  const save = async () => {
    await window.api.settingsSet({ outRoot, email: email || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>输出目录</h3>
        <div className="row">
          <input className="input" style={{ flex: 1 }} value={outRoot} readOnly />
          <button className="btn" onClick={choose}>
            选择…
          </button>
        </div>
        <div className="mt8 muted" style={{ fontSize: 13 }}>
          每位学生在其下生成独立文件夹(姓名_身份证后4位),含 cert.json、证书 PDF 与预览图。
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>接收邮箱(选填)</h3>
        <div className="row">
          <input
            className="input"
            style={{ flex: 1 }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@qq.com;官方生成 PDF 后会同时自动发送到此邮箱"
          />
        </div>
      </div>

      <div className="row">
        <button className="btn" onClick={save}>
          保存设置
        </button>
        {saved && <span className="muted">已保存</span>}
      </div>
    </>
  );
}
