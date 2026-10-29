/**
 * 原子通道（首选）：`releases.atom` 是 GitHub 给每个仓库生成的 Release 订阅源。
 *
 * 为什么不用 API：匿名调 `api.github.com` 按出口 IP 每小时只有 60 次，挂机场代理时
 * 那个 IP 的配额常常早被别人打满（实测撞过一次 403 rate limit）。这条 feed 不占
 * 配额，而且一次就能拿到版本号、发布页地址与更新说明。
 *
 * 也不用 `/releases/latest` 的 302：Electron 的 `net.fetch` 在 `redirect: 'manual'`
 * 下直接抛「Redirect was cancelled」，而跟随之后 `response.url` 又是空串——两条路
 * 都拿不到跳转目标。
 */
const RELEASE_FEED = 'https://github.com/zhijian521/mh-toolbox/releases.atom';
/** 兜底通道：feed 不可用时再问 API（例如代理只放行 api.github.com）。 */
const RELEASE_API = 'https://api.github.com/repos/zhijian521/mh-toolbox/releases/latest';
const RELEASE_PAGE = 'https://github.com/zhijian521/mh-toolbox/releases/tag/';
/** 超时压得比「用户能忍」还短一点：查更新不值得让人等，失败也只是一行灰字。 */
const TIMEOUT_MS = 9000;
/** 说明正文截断长度：弹层里只用来「知道这版改了什么」，不需要全文。 */
const NOTES_LIMIT = 1500;

/**
 * 比较两个版本号。返回 1 表示 a 更新，-1 表示 b 更新，0 表示同一版。
 *
 * 只按「主.次.补」三段数字比，不能直接字符串比较——`'0.10.0' < '0.9.0'` 在字典序里
 * 是成立的，真那么写会让 0.10 的版本永远检测不到。段数不足按 0 补齐。
 * 带预发布后缀（`0.2.0-alpha.1`）的比同号正式版小，这与 semver 一致：
 * 装了 alpha 的人应当收到正式版的更新提示。
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareVersions(a, b) {
    /** @param {string} value */
    const parse = (value) => {
        const clean = String(value == null ? '' : value)
            .trim()
            .replace(/^v/i, '');
        const dash = clean.indexOf('-');
        const core = (dash < 0 ? clean : clean.slice(0, dash)).split('.');
        return {
            core: core.map((part) => {
                const digits = /^\d+/.exec(part);
                return digits ? Number(digits[0]) : 0;
            }),
            pre: dash < 0 ? '' : clean.slice(dash + 1),
        };
    };
    const left = parse(a);
    const right = parse(b);
    const length = Math.max(left.core.length, right.core.length);
    for (let index = 0; index < length; index += 1) {
        const x = left.core[index] || 0;
        const y = right.core[index] || 0;
        if (x !== y) return x > y ? 1 : -1;
    }
    if (left.pre === right.pre) return 0;
    if (!left.pre) return 1;
    if (!right.pre) return -1;
    return left.pre > right.pre ? 1 : -1;
}

/** 还原 Atom 里的实体：`&amp;` 必须最后换，否则 `&amp;lt;` 会被当成标签。 */
function decodeEntities(text) {
    return String(text == null ? '' : text)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}
/** 把 feed 里那段转义过的 HTML 说明压成纯文本：保留换行，丢掉标签。 */
function toPlainNotes(html) {
    return decodeEntities(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|h[1-6]|li|div|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, NOTES_LIMIT);
}

/**
 * 检查更新。只查 GitHub Releases，不下载、不安装、不写任何文件。
 *
 * 两条通道互为兜底：feed（首选，无配额、带说明）→ API（feed 不通时才用）。
 * 失败一律收敛成 `{ ok: false, error }` 而不是抛异常：这条请求跨公网，
 * 超时与限流都是常态，界面需要的是一句能照做的提示，不是红色堆栈。
 *
 * @param {{ app: { getVersion: () => string }, logger: any, net: { fetch: Function } }} deps
 */
function createUpdateChecker({ app, logger, net }) {
    /** 一次带超时的 GET；网络层失败返回 null，调用方决定怎么兜。 */
    const request = async (/** @type {string} */ url, /** @type {any} */ options) => {
        try {
            return await net.fetch(url, {
                ...options,
                headers: {
                    // GitHub 要求带 User-Agent，缺了会直接 403，而不是限流。
                    'User-Agent': 'mh-toolbox-update-check',
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (error) {
            // 断网、DNS 失败、超时、被墙都走这里。不区分原因：用户改不了。
            logger.warn(
                '检查更新请求失败：' + (error && error.message ? error.message : String(error)),
            );
            return null;
        }
    };
    /** 从 `v0.3.0` / `0.3.0` 取出纯版本号；解析不出返回空串。 */
    const normalizeTag = (/** @type {any} */ tag) => {
        const value = String(tag == null ? '' : tag)
            .trim()
            .replace(/^v/i, '');
        return /^\d+(\.\d+)*$/.test(value) ? value : '';
    };
    /**
     * 首选通道：解析 Atom 的每条 `<entry>`。
     *
     * 只能遍历、不能只看第一条——仓库里除了版本 tag 还可能有 `web-legacy` 这种
     * 非版本 tag（实测就在 feed 里），而且是越新的排越前，不是越「像版本号」越前。
     * `normalizeTag` 要求整串都是数字段，`web-legacy` 与 `0.3.0-beta.1` 都会被它挡掉，
     * 于是这里的行为自动与 GitHub 的 `/releases/latest` 对齐：只认正式版。
     */
    const fromFeed = async () => {
        const response = await request(RELEASE_FEED, {});
        if (!response || !response.ok) return null;
        let text;
        try {
            text = await response.text();
        } catch {
            return null;
        }
        const blocks = String(text).match(/<entry>[\s\S]*?<\/entry>/g) || [];
        for (const block of blocks) {
            const href = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/.exec(block);
            const idText = /<id>([^<]+)<\/id>/.exec(block);
            /** `…/releases/tag/<tag>` 与 `…/Repository/<id>/<tag>` 两种写法各试一次。 */
            const rawTag =
                (href && /\/releases\/tag\/([^/?#]+)$/.exec(href[1])?.[1]) ||
                (idText && /\/Repository\/\d+\/([^/?#]+)$/.exec(idText[1].trim())?.[1]) ||
                '';
            let tag = '';
            try {
                tag = decodeEntities(decodeURIComponent(rawTag));
            } catch {
                continue; // 畸形百分号编码：跳过这条，别让整次检查崩掉
            }
            const latest = normalizeTag(tag);
            if (!latest) continue;
            const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(block);
            const updated = /<updated>([^<]+)<\/updated>/.exec(block);
            return {
                latest,
                url: href ? decodeEntities(href[1]) : RELEASE_PAGE + encodeURIComponent(tag),
                notes: content ? toPlainNotes(content[1]) : '',
                publishedAt: updated ? updated[1].trim() : '',
            };
        }
        return null;
    };
    /** 兜底通道：API 同样能给出说明与发布时刻，但要占匿名配额。 */
    const fromApi = async () => {
        const response = await request(RELEASE_API, {});
        if (!response || !response.ok) return null;
        try {
            const release = await response.json();
            const latest = normalizeTag(release && release.tag_name);
            if (!latest) return null;
            return {
                latest,
                url: String(release.html_url || RELEASE_PAGE + latest),
                notes: toPlainNotes(release.body || ''),
                publishedAt: String(release.published_at || ''),
            };
        } catch {
            return null;
        }
    };
    return {
        compareVersions,
        /** @returns {Promise<any>} */
        async check() {
            const current = app.getVersion();
            const info = (await fromFeed()) || (await fromApi());
            if (!info) return { ok: false, current, error: '连不上 GitHub，暂时查不到新版本' };
            const hasUpdate = compareVersions(info.latest, current) > 0;
            if (hasUpdate) logger.info('发现新版本 ' + info.latest + '（当前 ' + current + '）');
            return {
                ok: true,
                current,
                latest: info.latest,
                hasUpdate,
                url: info.url,
                notes: info.notes,
                publishedAt: info.publishedAt,
            };
        },
    };
}

module.exports = { createUpdateChecker, compareVersions, RELEASE_FEED, RELEASE_API };
