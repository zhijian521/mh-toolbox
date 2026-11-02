import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * 装备识别的换档策略。
 *
 * 起因是一张 451×499 的真机截图：3 倍缩放下检测框把「魔法 +80 防御 +43」切成
 * 「80」与「+80 防御 +43」两段，「魔法」两个字根本没进任何框，解析再容错也补不
 * 回来。同一张图换 2 倍或 3.5 倍就完整——所以策略不是「换一个更好的倍数」，而是
 * 「首档可疑时换一档，取更干净的那份」。
 *
 * 这里只测纯函数：不动 sharp、不加载 ONNX。
 */
const require = createRequire(import.meta.url);
const {
    primaryScale,
    planPasses,
    orphanCount,
    pickPass,
} = require('../src/main/equipment-ocr-scale.cjs');

test('首档口径不变：小图最多 3 倍，大图压到 1600 宽以内', () => {
    assert.equal(primaryScale(451, 499), 3);
    assert.equal(primaryScale(2560, 1440), 1600 / 2560);
    assert.equal(primaryScale(1600, 900), 1);
});

test('被放大过的小图才有第二档，且比首档小 1.5 倍', () => {
    const small = planPasses(451, 499);
    assert.deepEqual(small, [3, 2]);

    const mid = planPasses(900, 600);
    assert.equal(mid.length, 2);
    assert.equal(mid[1], primaryScale(900, 600) / 1.5);
    assert.ok(mid[1] >= 1, '第二档不该小于原尺寸');
});

test('大图（首档在压缩）只跑一档，不拿更小的档位去赌', () => {
    assert.deepEqual(planPasses(2560, 1440), [1600 / 2560]);
    assert.deepEqual(planPasses(1920, 1080), [1600 / 1920]);
});

test('断框残段：以符号开头的半截词条、整行只有一个数字', () => {
    assert.equal(orphanCount(['+80 防御 +43', '80']), 2);
    assert.equal(orphanCount([' +80 防御 +43 ']), 1);
    assert.equal(orphanCount(['魔法 +80 防御 +43', '等级 80', '伤害 +48']), 0);
    assert.equal(orphanCount(['耐久度661', '开运孔数：2孔/3孔']), 0);
});

test('两档相权：残段少者优先，其次行数多者，再次置信度高者', () => {
    const dirty = { lines: ['+80 防御 +43', '80', '伤害 +48'], orphans: 2, confidence: 99 };
    const clean = { lines: ['魔法 +80 防御 +43', '伤害 +48'], orphans: 0, confidence: 95 };
    assert.equal(pickPass(dirty, clean), clean, '残段少的赢，哪怕置信度低一点');
    assert.equal(pickPass(clean, dirty), clean, '顺序无关');

    const short = { lines: ['伤害 +48'], orphans: 0, confidence: 99 };
    assert.equal(pickPass(short, clean), clean, '残段一样时行数多者优先');

    const vague = { lines: ['魔法 +80 防御 +43', '伤害 +48'], orphans: 0, confidence: 91 };
    assert.equal(pickPass(vague, clean), clean, '行数一样时比置信度');
    assert.equal(pickPass(null, clean), clean);
});

test('真机那张图：3 倍的残段确实会被 2 倍顶掉，且「魔法」回到文本里', () => {
    const at3 = {
        lines: [
            '七彩花环',
            '防御的作用',
            '等级80',
            '80',
            '+80 防御 +43',
            '耐 久度661',
            '锻炼等级 镶嵌宝石太阳石',
            '伤害 +48',
            '套装效果： 变身术之净瓶女蜗',
            '开运孔数：2孔73孔',
        ],
    };
    const at2 = {
        lines: [
            '七彩花环',
            '防御的作用。',
            '装备条件 等级80',
            '装备角色 女',
            '等级80',
            '魔法+80防御+43',
            '耐久度661',
            '锻炼等级 6 镶嵌宝石太阳石',
            '伤害、+48',
            '套装效果：变身术之净瓶女蜗',
            '开运孔数：2孔73孔',
        ],
    };
    const withOrphans = { ...at3, orphans: orphanCount(at3.lines), confidence: 97.9 };
    const second = { ...at2, orphans: orphanCount(at2.lines), confidence: 96.1 };
    const best = pickPass(withOrphans, second);
    assert.equal(best, second);
    assert.equal(best.orphans, 0);
    assert.ok(best.lines.join('\n').includes('魔法'));
});
