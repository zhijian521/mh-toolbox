const fs = require('node:fs');
const path = require('node:path');

const THEMES = ['auto', 'light', 'dark'];
// 与 styles.css 的两套 --bg 保持一致：窗口在首帧前与缩放时露出的就是这块底色。
const BACKGROUND = { light: '#f2ecdd', dark: '#17150f' };

/**
 * 主题偏好。
 *
 * 存在独立的 preferences.json，不写进 data.json：主题是这台机器上的观感偏好，
 * 不该跟着备份文件换台电脑生效，也不该参与数据版本迁移。
 *
 * 偏好必须在创建窗口前应用。渲染层的 light-dark() 靠 prefers-color-scheme 取值，
 * 而 nativeTheme.themeSource 正是改这个媒体查询结果的地方——三种档位都走它，
 * 首帧天然正确，不需要在页面里塞防闪脚本（index.html 的 CSP 是 script-src 'self'，
 * 内联脚本本来也跑不了）。
 */
function createTheme({ nativeTheme, directory, logger }) {
    const file = path.join(directory, 'preferences.json');
    let preference = 'auto';
    try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (THEMES.includes(saved.theme)) preference = saved.theme;
    } catch {
        // 首次启动没有文件，或者内容坏了；两种情况都回到跟随系统。
    }

    /** 当前该用的窗口底色。shouldUseDarkColors 已经把 auto 档的系统判断算进去了。 */
    const background = () => (nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light);

    const apply = () => {
        nativeTheme.themeSource = preference === 'auto' ? 'system' : preference;
    };

    const snapshot = () => ({
        theme: preference,
        dark: nativeTheme.shouldUseDarkColors,
        background: background(),
    });

    const set = (next) => {
        if (!THEMES.includes(next)) throw new Error('未知的主题：' + next);
        preference = next;
        apply();
        try {
            fs.writeFileSync(file, JSON.stringify({ theme: preference }, null, 2), 'utf8');
        } catch (error) {
            // 写不进去不影响这次运行，下次启动退回默认，不值得让用户看到报错。
            logger.warn('保存主题偏好失败：' + error.message);
        }
        return snapshot();
    };

    apply();

    return { snapshot, set, background };
}

module.exports = { createTheme, THEMES };
