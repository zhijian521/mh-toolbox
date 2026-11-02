'use strict';

/**
 * 装备识别的「取哪一档缩放」与「两档结果怎么比」。
 *
 * 单独拎出来是因为这里只有纯函数，不碰 sharp、不碰 ONNX，可以直接被测。
 *
 * 为什么需要两档：PP-OCRv4 的检测头对缩放相位很敏感。同一张 451×499 的装备小图，
 * 放大 3 倍时检测框把「魔法 +80 防御 +43」切成了「80」和「+80 防御 +43」两段，
 * 左边的「魔法」两个字根本没进任何框；换成 2 倍或 3.5 倍就完整。这不是分辨率不够
 * （2 倍的像素更少反而对），也不是字糊（该行识别置信度 0.995），换一档就能躲过去。
 *
 * 因此策略是：首档照旧，只有首档留下「断框残段」才换一档复跑，取更干净的那份。
 */

/** 首档口径：小图最多放大 3 倍，大图压到 1600 宽 / 2600 高。 */
const MAX_UPSCALE = 3;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 2600;

/** 复跑档与首档至少差这么多倍，否则只是同一相位下的重复推理。 */
const MIN_SCALE_STEP = 1.5;

/** 首档低于这个倍数，说明原图本身够大（在压缩），没有更稳的档位可换。 */
const RETRY_MIN_PRIMARY = 1.5;

/** 「+80 防御 +43」这种以符号开头的残段：标签被截掉之后剩下的半个词条。 */
const ORPHAN_SIGNED = /^[+\-±]\s*\d/;

/** 整行只有一个数字（如「80」）：检测框在数值上多切了一刀。 */
const ORPHAN_BARE_NUMBER = /^\d{1,4}$/;

/**
 * 首档缩放倍数。
 *
 * @param {number} width 原图宽
 * @param {number} height 原图高
 * @returns {number}
 */
function primaryScale(width, height) {
    return Math.min(MAX_UPSCALE, MAX_WIDTH / width, MAX_HEIGHT / height);
}

/**
 * 这张图要跑哪几档。
 *
 * 返回 1 个元素表示只跑首档；返回 2 个表示首档可疑时可以换第二档复跑。
 *
 * @param {number} width 原图宽
 * @param {number} height 原图高
 * @returns {number[]}
 */
function planPasses(width, height) {
    const first = primaryScale(width, height);
    if (!(first >= RETRY_MIN_PRIMARY)) return [first];
    return [first, Math.max(1, first / MIN_SCALE_STEP)];
}

/**
 * 数一段识别结果里有几行是「断框残段」。
 *
 * @param {string[]} lines 每个检测框一行的文本
 * @returns {number}
 */
function orphanCount(lines) {
    let count = 0;
    for (const line of lines) {
        const text = line.trim();
        if (ORPHAN_SIGNED.test(text) || ORPHAN_BARE_NUMBER.test(text)) count += 1;
    }
    return count;
}

/**
 * 两档之间选一份留下。
 *
 * 顺序：残段少者优先；残段一样多时行数多者优先（漏行比多行更伤）；再相同看平均置信度。
 *
 * @param {{lines: string[], orphans: number, confidence: number} | null} current
 * @param {{lines: string[], orphans: number, confidence: number}} candidate
 * @returns {{lines: string[], orphans: number, confidence: number}}
 */
function pickPass(current, candidate) {
    if (!current) return candidate;
    if (candidate.orphans !== current.orphans) {
        return candidate.orphans < current.orphans ? candidate : current;
    }
    if (candidate.lines.length !== current.lines.length) {
        return candidate.lines.length > current.lines.length ? candidate : current;
    }
    return candidate.confidence > current.confidence ? candidate : current;
}

module.exports = { primaryScale, planPasses, orphanCount, pickPass };
