import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * 检查更新的两半：版本比较（纯函数）与两条通道的各条出口。
 *
 * 不启动 Electron，也不真的连 GitHub——`net.fetch` 由调用方注入，这里换成按
 * URL 分派的桩，于是「API 限流但 feed 还能用」这种真实遇见过的情况也能在毫秒
 * 级跑到。真网络只在临时 profile 手动验，不能进 CI（国内 runner 连不上）。
 */
const require = createRequire(import.meta.url);
const { compareVersions, createUpdateChecker } = require('../src/main/update.cjs');

const logger = { info() {}, warn() {}, error() {} };
const TAG_URL = 'https://github.com/x/y/releases/tag/';
/**
 * 造一个检查器：`feedSpec` 对应 releases.atom，`apiSpec` 对应 api.github.com。
 * 返回 `calls`，用来断言「已是最新时不该去花 API 配额」这类事。
 */
function checkerFrom(feedSpec, apiSpec = new Error('offline')) {
    const calls = [];
    const toResponse = (spec) => {
        if (spec instanceof Error) throw spec;
        return {
            ok: spec.status >= 200 && spec.status < 300,
            status: spec.status,
            text: async () => spec.text || '',
            json: async () => {
                if (spec.body instanceof Error) throw spec.body;
                return spec.body;
            },
        };
    };
    const fetch = async (url) => {
        const isFeed = String(url).includes('releases.atom');
        calls.push(isFeed ? 'feed' : 'api');
        return toResponse(isFeed ? feedSpec : apiSpec);
    };
    const checker = createUpdateChecker({
        app: { getVersion: () => '0.2.0' },
        logger,
        net: { fetch },
    });
    return { checker, calls };
}

/** 造一份 Atom feed；`notes` 里可以直接写 HTML，它本来就该是转义过的。 */
function feed(entries) {
    const blocks = entries
        .map((entry) => {
            const notes = (entry.notes || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `
  <entry>
    <id>tag:github.com,2008:Repository/1098066609/${entry.tag}</id>
    <updated>${entry.updated || '2026-10-28T09:46:20Z'}</updated>
    <link rel="alternate" type="text/html" href="${TAG_URL}${entry.tag}"/>
    <title>${entry.title || entry.tag}</title>
    <content type="html">${notes}</content>
  </entry>`;
        })
        .join('');
    return { status: 200, text: `<?xml version="1.0"?><feed>${blocks}</feed>` };
}

/** API 通道成功。 */
const release = (tag, extra = {}) => ({
    status: 200,
    body: Object.assign({ tag_name: tag, html_url: TAG_URL + tag }, extra),
});

test('版本比较按数字段走，不按字典序', () => {
    // 字典序会把 '0.10.0' 判成小于 '0.9.0'，那会让 0.10 的版本永远收不到更新提示。
    assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
    assert.equal(compareVersions('0.9.0', '0.10.0'), -1);
    assert.equal(compareVersions('1.0', '1.0.0'), 0, '缺的段按 0 补齐');
    assert.equal(compareVersions('v0.2.0', '0.2.0'), 0, 'tag 的 v 前缀不参与比较');
    assert.equal(compareVersions('0.2.0', '0.2.1'), -1);
    // 预发布比同号正式版小：装 alpha 的人应当收到正式版的提示。
    assert.equal(compareVersions('0.2.0', '0.2.0-alpha.1'), 1);
    assert.equal(compareVersions('0.2.0-alpha.2', '0.2.0-alpha.1'), 1);
});

test('feed 里混着非版本 tag 时，挑出真正的最新正式版', async () => {
    // 真实仓库就是这样：v0.2.0 之外还有一个叫 web-legacy 的历史 release。
    const { checker, calls } = checkerFrom(
        feed([
            { tag: 'web-legacy', title: '旧网页版归档', notes: '<p>历史归档</p>' },
            { tag: 'v0.3.0', notes: '<h2>0.3.0</h2>\n<p>修了速记归属</p>' },
        ]),
    );
    const result = await checker.check();
    assert.equal(result.ok, true);
    assert.equal(result.latest, '0.3.0', 'web-legacy 不能被当成版本号');
    assert.equal(result.hasUpdate, true);
    assert.equal(result.url, TAG_URL + 'v0.3.0');
    assert.match(result.notes, /修了速记归属/, '说明从 feed 的 HTML 里取出来');
    assert.doesNotMatch(result.notes, /<h2>/, '标签要去掉，只留文字');
    assert.deepEqual(calls, ['feed'], 'feed 一次就够，不该再花 API 配额');
});

test('已是最新时不提示更新，也不去花 API 配额', async () => {
    for (const tag of ['v0.2.0', 'v0.1.9']) {
        const { checker, calls } = checkerFrom(feed([{ tag }]));
        const result = await checker.check();
        assert.equal(result.ok, true, tag);
        assert.equal(result.hasUpdate, false, tag + ' 不该提示更新');
        assert.deepEqual(calls, ['feed'], tag + ' 只需一次 feed 请求');
    }
});

test('预发布版不会推给正式版用户', async () => {
    const { checker } = checkerFrom(feed([{ tag: 'v0.3.0-beta.1' }, { tag: 'v0.2.0' }]));
    const result = await checker.check();
    assert.equal(result.latest, '0.2.0', '带 - 的预发布要跳过，取下面那个正式版');
    assert.equal(result.hasUpdate, false);
});

test('feed 挂了才退到 API，限流时仍以 feed 为准', async () => {
    // 1) feed 正常、API 403（真实常态：出口 IP 的匿名配额被别人打满）
    const limited = checkerFrom(feed([{ tag: 'v0.4.0' }]), {
        status: 403,
        body: { message: 'API rate limit exceeded' },
    });
    const byFeed = await limited.checker.check();
    assert.equal(byFeed.ok, true);
    assert.equal(byFeed.latest, '0.4.0');
    assert.deepEqual(limited.calls, ['feed'], 'API 限流根本不该被调用');

    // 2) feed 网络层失败 → API 兜底
    const fallback = checkerFrom(new Error('net::ERR_TIMED_OUT'), release('v0.5.0'));
    const byApi = await fallback.checker.check();
    assert.equal(byApi.ok, true);
    assert.equal(byApi.latest, '0.5.0');
    assert.deepEqual(fallback.calls, ['feed', 'api']);
});

test('两条通道都失败时只报一句能照做的话', async () => {
    const offline = await checkerFrom(new Error('offline'), new Error('offline')).checker.check();
    assert.equal(offline.ok, false);
    assert.equal(offline.current, '0.2.0', '失败时也要带上当前版本，界面同一行里要显示');
    assert.match(offline.error, /连不上 GitHub/);

    // 仓库一个版本都没发过：feed 里只有非版本 tag，API 又 404。
    const empty = checkerFrom(feed([{ tag: 'web-legacy' }]), { status: 404, body: {} });
    const result = await empty.checker.check();
    assert.equal(result.ok, false);
    assert.match(result.error, /查不到/);
});
