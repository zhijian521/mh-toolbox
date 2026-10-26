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
