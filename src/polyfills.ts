import { Buffer } from "buffer";

// Polyfill Buffer cho môi trường Browser
// @ts-ignore
if (typeof window !== "undefined") {
  // @ts-ignore
  window.global = window.global || window;
  // @ts-ignore
  window.Buffer = window.Buffer || Buffer;
  // @ts-ignore
  window.process = window.process || { env: {} };
}

export {};
