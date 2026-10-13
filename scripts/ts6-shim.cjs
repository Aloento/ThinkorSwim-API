// TS6/TS7 并排 shim（typescript-eslint 尚不支持 TS 7 API）。
// 用法：node --require ./scripts/ts6-shim.cjs <eslint-bin> …
// 在 eslint 进程内把裸 require("typescript") 重定向到 ts6（npm:typescript@6），
// 仓库构建/发布仍使用 devDependency 的 TypeScript 7。
// 跟踪：https://github.com/typescript-eslint/typescript-eslint/issues/10940
const Module = require("node:module");

const ts6 = require("ts6");
if (!/^6\./.test(ts6.version)) {
  console.error("ts6-shim: expected typescript 6.x, got " + ts6.version);
  process.exit(2);
}

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "typescript") {
    return require.resolve("ts6");
  }
  if (request.startsWith("typescript/")) {
    const sub = request.slice("typescript/".length);
    try {
      return resolveFilename.call(this, "ts6/" + sub, parent, ...rest);
    } catch {
      // ts6 exports 未暴露该子路径时回退原解析
      return resolveFilename.call(this, request, parent, ...rest);
    }
  }
  return resolveFilename.call(this, request, parent, ...rest);
};
