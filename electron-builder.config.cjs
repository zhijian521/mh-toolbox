module.exports = {
    appId: 'com.zhijian.mhtool.v2',
    productName: '梦幻养老助手 V2',
    electronDist: 'node_modules/electron/dist',
    directories: { output: 'release', buildResources: 'build' },
    /**
     * VC++ 运行库要放到 `onnxruntime_binding.node` **同目录**，不是安装目录根部。
     *
     * `onnxruntime.dll` 与 `onnxruntime_binding.node` 都导入 VCRUNTIME140 / MSVCP140；
     * Electron 不带、Windows 只自带 UCRT，干净系统上会「应用能开、一识别图片就失败」。
     * 实测（把同目录的 vcruntime140.dll 换成垃圾文件 → 加载立刻报 not a valid Win32
     * application；换成根目录则照常工作）说明 Windows 解析依赖时先看 .node 所在目录，
     * 根目录那份根本不会被用上。这一步由 `scripts/after-pack.cjs` 完成。
     */
    afterPack: 'scripts/after-pack.cjs',
    files: [
        'dist/renderer/**/*',
        'src/main/**/*',
        'src/preload/**/*',
        'build/icon.ico',
        'package.json',
        // 只带 Windows x64 的推理库：整包 236 MB，别的平台目录纯属白占体积。
        '!node_modules/onnxruntime-node/bin/napi-*/{darwin,linux,android}/**/*',
        '!node_modules/onnxruntime-node/bin/napi-*/win32/{arm64,ia32}/**/*',
        /**
         * DirectML 那套 GPU 推理组件 37 MB 全部排掉。
         *
         * 识别子进程写死了 `executionProviders: ['cpu']`（`equipment-ocr-worker.cjs:34`），
         * 这三个 dll 只在 DML EP 下才被拖起来，留着就是白占体积。
         */
        '!node_modules/onnxruntime-node/bin/**/{DirectML.dll,dxcompiler.dll,dxil.dll}',
    ],
    /**
     * 只留中文界面语言包。
     *
     * `locales/` 默认带 55 种语言共 44 MB，全是 Chromium 自己的 UI 与拼写检查用的；
     * 本应用界面全自绘、菜单也不用 Electron 内置那套，删掉别的语言不影响任何功能。
     * `en-US` 留着保底（部分系统对话框会回退到它）。
     */
    electronLanguages: ['zh-CN', 'en-US'],
    /** 安装包用最大压缩：多花一两分钟，NSIS / 便携版能小一成左右。 */
    compression: 'maximum',
    /**
     * 整个 node_modules 都解包，不留 asar 里的副本。
     *
     * 起因（2026-11-02）：装出来的包识别图片必失败，报
     * `Cannot find package '@techstark/opencv-js' imported from ...app.asar.unpacked/
     * node_modules/@gutenye/ocr-common/build/backend/splitIntoLineImages.js`。
     *
     * 原因是模块解析的边界：被解包的包是**真实路径**，Node 从它出发只会沿真实目录向上找
     * `node_modules`，看不到还留在 app.asar 里的兄弟包。只解包 @gutenye / onnxruntime /
     * sharp / @img 这四个，等于要求「它们的每一个运行时依赖也都在名单里」，漏一个就整条链路
     * 崩——`@techstark/opencv-js`、`js-clipper`、`tiny-invariant` 就是这么漏的。
     *
     * 代价只是文件数（生产依赖解包后约 900 个文件），体积不变，换来的是新增依赖不必再回来
     * 补名单。`.node` 与 onnx 模型本来也必须落地，这条规则一并覆盖。
     */
    asarUnpack: ['node_modules/**/*'],
    win: {
        icon: 'build/icon.ico',
        target: [
            { target: 'nsis', arch: ['x64'] },
            { target: 'portable', arch: ['x64'] },
        ],
    },
    nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        shortcutName: '梦幻养老助手 V2',
        artifactName: '梦幻养老助手-V2-安装版-${version}.exe',
    },
    portable: { artifactName: '梦幻养老助手-V2-便携版-${version}.exe' },
};
