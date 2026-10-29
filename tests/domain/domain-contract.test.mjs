import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDomain } from '../../src/renderer/domain/create-domain.js';

const domainDirectory = join(import.meta.dirname, '..', '..', 'src', 'renderer', 'domain');

/**
 * 领域层用 Object.assign(D, {...}) 把一百多个成员平铺到同一个对象上，
 * domain-contract.d.ts 是这套「隐式接口」的唯一书面记录。契约一旦落后于代码，
 * 开启 @ts-check 的模块就会因为「Property does not exist」而误报，
 * 关掉检查后又会把这个真实缺口重新藏起来。这里让两者强制同步。
 */

/** 取出指定 interface 里声明的成员名。 */
function interfaceMembers(name) {
    return new Set([...interfaceFields(name).keys()]);
}

/** 取出成员名与「是否可选」的对应关系：可选成员运行时可能尚未创建。 */
function interfaceFields(name) {
    const text = readFileSync(join(domainDirectory, 'domain-contract.d.ts'), 'utf8');
    const block = text.match(new RegExp('interface ' + name + ' \\{([\\s\\S]*?)\\n\\}'));
    assert.ok(block, 'domain-contract.d.ts 里找不到 interface ' + name);
    const fields = new Map();
    for (const line of block[1].split('\n')) {
        const matched = line.match(/^ {4}([A-Za-z_]\w*)(\??)\s*[:(]/);
        if (matched) fields.set(matched[1], matched[2] === '?');
    }
    return fields;
}

/** 实例化真实领域对象，用运行时结果核对契约，而不是用正则猜源码。 */
function runtimeMembers() {
    return new Set(Object.keys(createDomain()));
}

test('领域契约覆盖运行时实例的全部成员', () => {
    const declared = interfaceMembers('Domain');
    const missing = [...runtimeMembers()]
        .filter((name) => !name.startsWith('_'))
        .filter((name) => !declared.has(name))
        .sort();
    assert.deepEqual(
        missing,
        [],
        '以下领域成员没有写进 domain-contract.d.ts：' + missing.join('、'),
    );
});

test('领域契约没有残留已删除的成员', () => {
    // 私有字段在首次使用时才挂到实例上，state 的子字段归 DomainState 声明，
    // 因此只把 interface Domain 的公开成员与实例对比。
    const stale = [...interfaceMembers('Domain')]
        .filter((name) => name !== 'state')
        .filter((name) => !name.startsWith('_'))
        .filter((name) => !runtimeMembers().has(name))
        .sort();
    assert.deepEqual(
        stale,
        [],
        '以下成员已从领域实现中移除，但契约里仍在声明：' + stale.join('、'),
    );
});

test('领域状态契约与实例状态字段一一对应', () => {
    const declared = interfaceFields('DomainState');
    const actual = new Set(Object.keys(createDomain().state));
    const missing = [...actual].filter((name) => !declared.has(name)).sort();
    const stale = [...declared]
        .filter(([name, optional]) => !optional && !actual.has(name))
        .map(([name]) => name)
        .sort();
    assert.deepEqual(missing, [], 'state 里这些字段没有写进 DomainState：' + missing.join('、'));
    assert.deepEqual(stale, [], 'DomainState 里这些必填字段 state 上并不存在：' + stale.join('、'));
});

test('每个安装模块都用同一套混入写法：Mixin 声明 + Object.assign(D, ...)', () => {
    const files = readdirSync(domainDirectory).filter((name) => name.endsWith('.js'));
    const noTypedef = [];
    const noAssign = [];
    for (const file of files) {
        const text = readFileSync(join(domainDirectory, file), 'utf8');
        if (!text.startsWith('// @ts-check')) continue;
        // 只检查通过 install(D, ...) 混入领域的模块；util.js / data.js 不接收 D。
        if (!/export default function install\(/.test(text)) continue;
        // 约定（AGENTS.md 五）：固定写法是
        //   /** @typedef {Partial<Domain> & ThisType<Domain>} XxxMixin */
        //   install 标 @param {Domain} D，方法体统一 Object.assign(D, /** @type {XxxMixin} */ ({...}))
        // 以前允许「自定子集 + 直接 D.xxx = function」，导致三处模块各写一套、类型约束松一档。
        if (!/@typedef \{Partial<Domain> & ThisType<Domain>\} \w+Mixin/.test(text))
            noTypedef.push(file);
        if (!/Object\.assign\(\s*D,/.test(text)) noAssign.push(file);
        if (!/@param \{Domain\} D\b/.test(text)) noTypedef.push(file);
    }
    assert.deepEqual(
        noTypedef,
        [],
        '这些模块缺少 Mixin 声明或 install 的 D 标注：' + noTypedef.join('、'),
    );
    assert.deepEqual(
        noAssign,
        [],
        '这些模块没有用 Object.assign(D, ...) 平铺：' + noAssign.join('、'),
    );
});
