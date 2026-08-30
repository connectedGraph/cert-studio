/**
 * preload API 的类型声明(渲染层使用 window.api)。
 */
import type { Api } from "../electron/preload";

declare global {
  interface Window {
    api: Api;
  }
}

export {};
