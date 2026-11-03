# VC++ 运行库（随包分发）

这四个文件是 **Microsoft Visual C++ 2015–2022 可再发行组件**（Runtime 14.50.35719.0），
不是本仓库的代码，只为让识别链路在没有装过 VC++ 运行库的 Windows 上也能跑起来。

## 为什么需要

`onnxruntime.dll` 与 `onnxruntime_binding.node`（`node_modules/onnxruntime-node/bin/napi-v6/win32/x64/`）
的导入表里有：

```
VCRUNTIME140.dll  VCRUNTIME140_1.dll  MSVCP140.dll  MSVCP140_1.dll
```

Electron 不自带这些文件，Windows 10/11 自带的只有 UCRT（`ucrtbase.dll`、`api-ms-win-crt-*`）。
开发机装过 Visual Studio 或 Node 编译工具，所以 `System32` 里有；干净系统没有，
表现就是「应用能开、其它功能正常，一识别图片就失败」。

## 怎么分发的

`electron-builder.config.cjs` 的 `extraFiles` 把它们放到**安装目录根部**（与 exe 同级），
这是 Windows DLL 搜索顺序的第一位，`onnxruntime_binding.node` 依赖加载时能直接命中。

## 来源与许可

文件取自 Microsoft Visual C++ 2015–2022 Redistributable（x64）安装后的
`%SystemRoot%\System32`，属于 Microsoft 许可的「Distributable Code」，
允许随应用一起分发；不得单独销售或修改。升级到更高版本的运行库时，
直接从新版 redist 里取同名文件替换即可。
