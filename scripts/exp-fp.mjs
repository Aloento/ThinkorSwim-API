// 指纹对比探针：headless(new) vs headed × raw vs stealth，逐项输出关键信号。
// 结论：无头与有头指纹一致，差异仅 navigator.webdriver 与 UA 的 "HeadlessChrome"，
// stealth 默认 evasion 已覆盖，无需手动补。
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteerRaw from "puppeteer";

const probe = async (page) =>
  page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return {
      ua: navigator.userAgent,
      webdriver: navigator.webdriver,
      platform: navigator.platform,
      languages: navigator.languages.join(","),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locales: Intl.DateTimeFormat().resolvedOptions().locale,
      plugins: navigator.plugins.length,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: String(navigator.deviceMemory),
      chrome: typeof window.chrome,
      chromeRuntime: typeof window.chrome?.runtime,
      webglVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "n/a",
      webglRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "n/a",
      outerW: window.outerWidth,
      outerH: window.outerHeight,
      // UA-CH（https 安全上下文才有）
      uaData: navigator.userAgentData
        ? JSON.stringify(navigator.userAgentData.brands) +
          " mobile=" +
          navigator.userAgentData.mobile +
          " platform=" +
          navigator.userAgentData.platform
        : "n/a",
      uaFullVersions: navigator.userAgentData?.getHighEntropyValues
        ? "async"
        : "n/a",
      notifPermission: Notification.permission,
    };
  });

const highEntropy = (page) =>
  page.evaluate(async () => {
    if (!navigator.userAgentData?.getHighEntropyValues) return "n/a";
    const h = await navigator.userAgentData.getHighEntropyValues([
      "fullVersionList",
      "platformVersion",
      "architecture",
      "bitness",
    ]);
    return (
      JSON.stringify(h.fullVersionList) +
      ` pv=${h.platformVersion} arch=${h.architecture} bits=${h.bitness}`
    );
  });

const pStealth = puppeteerExtra;
pStealth.use(StealthPlugin());

for (const headless of [true, false]) {
  for (const [name, mod] of [
    ["raw", puppeteerRaw],
    ["stealth", pStealth],
  ]) {
    const b = await mod.launch({
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--window-size=1280,900",
      ],
    });
    try {
      const p = await b.newPage();
      await p.setViewport({ width: 1280, height: 900 });
      await p.goto("https://example.com", { waitUntil: "domcontentloaded" });
      const r = await probe(p);
      const he = await highEntropy(p);
      console.log(`\n===== headless=${headless} ${name} =====`);
      for (const [k, v] of Object.entries(r)) console.log(`  ${k}: ${v}`);
      console.log(`  highEntropy: ${he}`);
    } finally {
      await b.close();
    }
  }
}
