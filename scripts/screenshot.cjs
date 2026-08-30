/* 截图:Playwright Chromium 直接开 vite 网页,stub window.api,注入演示数据 */
const { chromium } = require("playwright");
const path = require("path");

const OUT = "C:/Users/18086/.workspace/git-workspace/cert-studio/docs/images";
const VITE = "http://localhost:5188";

// 预置演示证书(图墙用),图片用一张生成的占位证书 PNG 的 data URL
const DEMO_CERT_PNG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
  <rect width="400" height="400" fill="#fdf9ef"/>
  <rect x="30" y="30" width="340" height="340" fill="none" stroke="#b8860b" stroke-width="6" rx="12"/>
  <rect x="46" y="46" width="308" height="308" fill="none" stroke="#d4af37" stroke-width="2" rx="8"/>
  <text x="200" y="105" text-anchor="middle" font-size="26" fill="#8a6d1d" font-family="serif">社会艺术水平考级证书</text>
  <text x="200" y="150" text-anchor="middle" font-size="15" fill="#8a6d1d" font-family="serif">China Conservatory Social Art Grading</text>
  <text x="200" y="205" text-anchor="middle" font-size="20" fill="#333" font-family="serif">张三 · 钢琴 拾级</text>
  <text x="200" y="240" text-anchor="middle" font-size="13" fill="#888" font-family="serif">证书编号 215322080021287435</text>
  <text x="200" y="268" text-anchor="middle" font-size="13" fill="#888" font-family="serif">发证日期 2022-12-05</text>
  <circle cx="305" cy="310" r="24" fill="none" stroke="#c0392b" stroke-width="4"/>
  <text x="305" y="316" text-anchor="middle" font-size="13" fill="#c0392b" font-family="serif">印</text>
  <text x="120" y="315" text-anchor="middle" font-size="14" fill="#444" font-family="serif">中国音乐学院考级艺术美育中心</text>
</svg>`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });

  // stub preload API
  await page.addInitScript((demoPng) => {
    const demoCerts = [
      {
        dir: "C:/demo/张三_2210",
        studentName: "张三",
        record: {
          major_name: "钢琴", level: 10, cert_no: "215322080021287435",
          made_cert_ymd: "2022-12-05", is_excellent: 0,
        },
        pdfPath: "C:/demo/钢琴10级.pdf", pngPath: demoPng,
      },
      {
        dir: "C:/demo/张三_2210",
        studentName: "张三",
        record: {
          major_name: "音乐基础知识", level: 3, cert_no: "215321080011027616",
          made_cert_ymd: "2021-11-08", is_excellent: 0,
        },
        pdfPath: "C:/demo/音基3级.pdf", pngPath: demoPng,
      },
      {
        dir: "C:/demo/李四_3329",
        studentName: "李四",
        record: {
          major_name: "钢琴", level: 8, cert_no: "215321080012345678",
          made_cert_ymd: "2023-01-15", is_excellent: 2,
        },
        pdfPath: "C:/demo/钢琴8级.pdf", pngPath: demoPng,
      },
    ];
    const roster = [
      { name: "张三", idCard: "110101201005012210" },
      { name: "李四", idCard: "110101201005023329" },
      { name: "王五", idCard: "110101201005034438" },
    ];
    window.api = {
      settingsGet: async () => ({ outRoot: "C:/证书产出", email: "demo@example.com" }),
      settingsSet: async () => null,
      chooseOutRoot: async () => null,
      importRoster: async () => null,
      getRoster: async () => roster,
      addRosterEntry: async () => ({ ok: true, roster }),
      removeRosterEntry: async (i) => ({ ok: true, roster: roster.filter((_, x) => x !== i) }),
      clearRoster: async () => ({ ok: true, roster: [] }),
      downloadTemplate: async () => null,
      startQueueFromRoster: async () => ({ ok: true }),
      startQueueSingle: async () => ({ ok: true }),
      startQueue: async () => ({ ok: true }),
      stopQueue: async () => ({ ok: true }),
      listTasks: async () => [
        { id: 0, student: roster[0], status: "done", message: "完成:2/2 个 PDF", certCount: 2 },
        { id: 1, student: roster[1], status: "done", message: "完成:1/1 个 PDF", certCount: 1 },
        { id: 2, student: roster[2], status: "waiting_captcha", message: "等待人工验证码" },
      ],
      resolveCaptcha: async () => null,
      scanCerts: async () => demoCerts,
      copyImage: async () => ({ ok: true }),
      openPdf: async () => ({ ok: true }),
      openFolder: async () => ({ ok: true }),
      markSent: async () => ({ ok: true }),
      listDist: async () => [{ certNo: "215321080011027616" }],
      exportDist: async () => ({ ok: true }),
      exportSummary: async () => null,
      onQueueEvent: () => () => null,
    };
  }, DEMO_CERT_PNG);

  await page.goto(VITE, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // 1. 名册页
  await page.screenshot({ path: path.join(OUT, "roster.png") });

  // 2. 查询任务页(点开始展示演示队列:2 完成 + 1 待验证码)
  await page.click('.tabs button:nth-child(2)');
  await page.waitForTimeout(300);
  await page.click('.card .btn');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "tasks.png") });

  // 3. 证书图墙
  await page.click('.tabs button:nth-child(3)');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "wall.png") });

  // 4. 导出页
  await page.click('.tabs button:nth-child(4)');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "export.png") });

  // 5. 设置页
  await page.click('.tabs button:nth-child(5)');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "settings.png") });

  await browser.close();
  console.log("screenshots done");
})().catch((e) => { console.error(e); process.exit(1); });
