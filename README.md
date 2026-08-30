# cert-studio

中国音乐学院考级证书批量获取与分发工具(本地桌面应用,Electron)。

> **合规声明**:
> - 本工具仅限查询**本人**或**已获得授权**(家长/机构协议)考生的证书信息,请遵守《个人信息保护法》(PIPL)及官方平台服务条款。
> - 验证码由人工完成,本工具**不包含任何验证码识别/绕过逻辑**。
> - 请求自带限速与随机间隔,请勿高频批量抓取。
> - 官方接口如变更,本工具可能失效;作者不对其持续可用性作承诺。
> - 产出文件与 OSS 直链路径包含身份证信息,**请勿外传**。

## 功能

- **名册导入**:XLSX / JSON 学生名单(姓名 + 身份证号必填,证书编号/准考证号选填)
- **批量查询**:逐个学生取票 → 弹出官方旋转验证码(人工拖动) → 查询 → 自动触发 PDF 生成并轮询下载
- **证书图墙**:每生一目录存储 cert.json / PDF / 预览图;右键复制图片 → 微信 Ctrl+V 直接发送
- **汇总导出**:证书汇总 XLSX(姓名/专业/级别/证书编号/发证日期/等次/状态)

## 开发

```bash
npm install        # 需 Node 20+;国内网络建议设置 npm 代理或镜像
npm run dev        # vite + electron 开发模式(主进程自动热更)
npm run build      # 类型检查 + 打包 win 安装包/便携版
```

Electron 主进程代码在 `electron/`,渲染层 React 在 `src/`。IPC 通道见 `electron/preload.ts`。

## 接口说明(2026-08 实测,供后续维护参考)

官方查询站 `ccmkjzx002.zgyyxykj.com/search_cert`,均需 `Referer` 与浏览器 UA:

| 接口 | 方法 | 参数 | 说明 |
|---|---|---|---|
| `/admins/index/get_captcha_check_key` | GET | - | 一次性票据,有效期约 1-2 分钟 |
| `capt.zgyyxykj.com/captcha?key=` | - | key | 旋转验证码 iframe;完成后 postMessage `on_captcha_success` |
| `/search_cert/index/search_cert` | POST | name, id_card, cert_no, exam_no, captcha_check_key | 票据须已通过验证,过期返回 `{"error":5}` |
| `/search_cert/index/request_pdf` | POST | cert_no, season(=apply_year+is_summer), id_card, email | 无验证码;`pdf_complete_time` 后重发返回 OSS `pdf_url` + `preview_img` |

查询结果 `exam_way` 索引:`0=现场考试, 1=视频考试, 2=音基考试, 3=AI智慧考试`;`is_summer`:`1=夏季, 3=春季, 4=暑假, 5=寒假, 0=冬季, 2=秋季`。

## License

MIT
