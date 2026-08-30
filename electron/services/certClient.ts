/**
 * 官方查询站接口封装。
 *
 * 接口行为均来自 2026-08 实测(见 README「接口说明」):
 *  - get_captcha_check_key: 一次性票据,有效期约 1-2 分钟
 *  - search_cert: 服务端强校验票据必须已被验证码服务标记通过
 *  - request_pdf: 无验证码;首次返回 pdf_complete_time,到时后重发返回 OSS 直链
 *
 * 合规:仅用于查询本人或已获授权考生的证书;验证码必须由人工完成。
 */
import { net } from "electron";

export const BASE = "https://ccmkjzx002.zgyyxykj.com";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const baseHeaders: Record<string, string> = {
  "User-Agent": UA,
  Referer: `${BASE}/search_cert`,
  "X-Requested-With": "XMLHttpRequest",
};

function formBody(fields: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      `${encodeURIComponent(k)}=${encodeURIComponent(v == null ? "" : String(v))}`
    );
  }
  return parts.join("&");
}

/** 获取一次性验证码票据 */
export async function getCaptchaCheckKey(): Promise<string> {
  const res = await net.fetch(`${BASE}/admins/index/get_captcha_check_key`, {
    headers: baseHeaders,
  });
  const json = (await res.json()) as {
    error: number;
    captcha_check_key?: string;
    msg?: string;
  };
  if (json.error !== 0 || !json.captcha_check_key) {
    throw new Error(`取票失败: ${json.msg ?? `HTTP ${res.status}`}`);
  }
  return json.captcha_check_key;
}

export interface CertRecord {
  city_id: number;
  major_name: string;
  major_id: number;
  student_name: string;
  sex: string;
  level: number;
  pass_level: number;
  cert_no: string;
  exam_no: string;
  made_cert_time: number;
  is_excellent: number;
  exam_way: number;
  is_settlement: number;
  is_deply_cert: number;
  apply_year: string;
  is_summer: string;
  made_cert_ymd: string;
  show_yj3_no_cert_tips: number;
}

export interface SearchResult {
  error: number;
  msg?: string;
  data?: CertRecord[];
  cert_email?: string;
}

/**
 * 查询证书。captchaCheckKey 必须是已通过人工验证码的票据,
 * 否则服务端返回 error=5(过期)或直接 500。
 */
export async function searchCert(params: {
  name: string;
  idCard?: string;
  certNo?: string;
  examNo?: string;
  captchaCheckKey: string;
}): Promise<SearchResult> {
  const res = await net.fetch(`${BASE}/search_cert/index/search_cert`, {
    method: "POST",
    headers: {
      ...baseHeaders,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: formBody({
      name: params.name,
      id_card: params.idCard,
      cert_no: params.certNo,
      exam_no: params.examNo,
      captcha_check_key: params.captchaCheckKey,
    }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as SearchResult;
  } catch {
    // 非 JSON(如 500 页面错误页)——票据未验证或已过期时的典型表现
    return { error: -1, msg: `非 JSON 响应(HTTP ${res.status}),票据可能已过期或未验证` };
  }
}

export interface PdfRequestResult {
  error: number;
  msg?: string;
  pdf_url?: string;
  preview_img?: string;
  pdf_complete_time?: string;
  cert_no?: string;
  season?: number;
}

/**
 * 触发/轮询电子证书 PDF 生成。无验证码,可安全自动重试:
 * 返回 pdf_complete_time 表示后台仍在生成,等待后重发同一请求即可。
 */
export async function requestPdf(params: {
  certNo: string;
  season: string; // apply_year + is_summer,如 "20224"
  idCard: string;
  email?: string;
}): Promise<PdfRequestResult> {
  const res = await net.fetch(`${BASE}/search_cert/index/request_pdf`, {
    method: "POST",
    headers: {
      ...baseHeaders,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: formBody({
      cert_no: params.certNo,
      season: params.season,
      id_card: params.idCard,
      email: params.email,
    }),
  });
  return (await res.json()) as PdfRequestResult;
}

/** 下载 OSS 直链(PDF 或预览图)到 Buffer */
export async function downloadOss(url: string): Promise<Buffer> {
  const res = await net.fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`下载失败: HTTP ${res.status} ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
