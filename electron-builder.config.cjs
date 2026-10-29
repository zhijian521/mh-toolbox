module.exports = {
    appId: 'com.zhijian.mhtool.v2',
    productName: '梦幻养老助手 V2',
    electronDist: 'node_modules/electron/dist',
    directories: { output: 'release', buildResources: 'build' },
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
     * 原生库与模型必须解包。
     *
     * `.node` 二进制与 onnx 模型没法从 asar 里 `dlopen`/读取，识别子进程会直接崩；
     * 这里只解包真正需要的四个包，不像 V1 那样把整个 node_modules 都摊开。
     */
    asarUnpack: [
        'node_modules/@gutenye/**/*',
        'node_modules/onnxruntime-node/**/*',
        'node_modules/sharp/**/*',
        'node_modules/@img/**/*',
    ],
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
