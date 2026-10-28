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
    ],
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
