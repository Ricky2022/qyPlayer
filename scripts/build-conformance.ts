// 生成格式一致性测试包到 fixtures/conformance（入库）。不依赖下载的素材。
//   pnpm fixtures:conformance
import {buildConformancePackages} from "./fixtures/conformance";

await buildConformancePackages();
console.log("一致性测试包已写入 fixtures/conformance");
