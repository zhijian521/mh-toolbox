import type { Domain, EquipmentItem } from '../../app/types';

/** 编辑中的词条行：数值留空存 null，保存前由 `pruneDetail` 把这一行丢掉。 */
export interface DraftRow {
    key: string;
    value: number | null;
    boost: number | null;
}
/**
 * 属性编辑器的草稿：与领域结构一致，只是词条行的数值允许「还没填」。
 *
 * 这里逐字段写出来而不是 `Omit<EquipmentDetail, ...>`：`EquipmentDetail` 带
 * `[field: string]: any` 索引签名，`Omit` 会把显式字段一起抹平，词条数组退化成
 * `any[]`，`rows.find((row) => ...)` 之类就全是隐式 any。
 */
export type DraftDetail = {
    version: number;
    base: DraftRow[];
    extra: DraftRow[];
    bonus: DraftRow[];
    melt: DraftRow[];
    technique: string;
    effects: string[];
    forge: number | null;
    gems: EquipmentGem[];
    clock: { name: string; level: number | null };
    suit: string;
    element: string;
    durability: number | null;
    repair: number | null;
    maker: string;
    runes: string;
    jade: EquipmentJade;
    legacy: string;
};

/**
 * 把编辑器的草稿收敛成领域要的属性：没填数值的词条整行丢掉。
 *
 * 空行留着会被 `validateEquipmentDetails` 判成「请填写…的数值」——用户只是点了一下
 * 「添加」还没填，不该被当成错误拦下来。反过来说，填了 0 的行必须保留：0 与「没记录」
 * 在装备属性里是两件事。
 */
export function pruneDetail(draft: DraftDetail): EquipmentDetail {
    const rows = (list: DraftRow[]): EquipmentRow[] =>
        list
            .filter((row) => row.key && row.value !== null)
            .map((row) => ({
                key: row.key,
                value: Number(row.value),
                boost: row.boost == null ? null : Number(row.boost),
            }));
    return {
        ...draft,
        base: rows(draft.base),
        extra: rows(draft.extra),
        bonus: rows(draft.bonus),
        melt: rows(draft.melt),
    } as EquipmentDetail;
}

/** 属性行的视觉分组：决定左侧标签的颜色，也决定它是不是一枚「类别签」。 */
export type PropertyKind = 'base' | 'extra' | 'gem' | 'special' | 'upgrade' | 'legacy';

/** 一行里并排的一段词条：属性名与数值分开存，窄处才好只在两者之间换行。 */
export interface PropertySegment {
    name: string;
    num: string;
}

export interface PropertyRow {
    label: string;
    value: string;
    /**
     * 一行里并排的若干段词条（单段也走这条路）。界面按段渲染：段与段之间可以断行，
     * 段内的属性名与数值也允许断行（窄卡片里「物理暴击等级 +18」放不下），但两半各自
     * 不再拆开。
     */
    segments?: PropertySegment[];
    kind: PropertyKind;
    /** 类别签（基础 / 双加 / 宝石 / 锻炼）带底色；普通字段名（特技、符石…）只有灰字。 */
    tag?: boolean;
}

/**
 * 一条词条拆成「伤害」+「+480 [强化 +30]」。
 *
 * 领域里的 `equipmentStatText` 用的是 ASCII 连字符，界面上负号要写成 U+2212 才和
 * 页面其它数字一致，所以这里自己拼而不直接用它。名称与数值分开返回，是为了窄格子
 * 里只在两者之间断行——整条不许断会在 145px 的玉魄格里被裁掉半个字。
 */
function statSegment(label: string, row: EquipmentRow): PropertySegment {
    const sign = row.value >= 0 ? '+' : '−';
    const boost = row.boost == null ? '' : ` [${row.boost >= 0 ? '+' : '−'}${Math.abs(row.boost)}]`;
    return { name: label, num: `${sign}${Math.abs(row.value)}${boost}` };
}

/**
 * 把装备属性摊平成「标签 + 值」的行。格子、仓库、选装、详情四处共用同一份口径。
 *
 * 分成三层，越往下越像「配置」而不是「属性」：
 *
 * 1. **类别签**（带底色的标签）：基础 / 双加（灵饰叫附加、玉魄叫加成）/ 宝石 / 锻炼。
 *    装备的双加两条并排（游戏里就是并排读的）；灵饰的附加、玉魄的加成**一条一行**
 *    ——它们的词条名长，两条并排放不下，折出来的第二行只剩半段，比一行一条更难扫。
 * 2. **字段签**（灰字标签）：特技、特效、钟灵石、熔炼、符石、原有属性。
 * 3. **玉魄的养成档**：灵尘等级、奇袭、开光孔固定压在最后——它们说的是这件玉魄练到
 *    什么程度，和上面的词条不是一回事。
 *
 * **不展示**：五行、耐久、修理失败、制造者（数据仍在，编辑器可改），以及钟灵石的
 * 套装效果（2026-10-29 用户要求去掉：套装名又长又不参与比较）。属性为空时返回空
 * 数组而不是占位行：调用方需要区分「没录」和「录了但是 0」。
 */
export function propertyRows(rules: Domain, eq: EquipmentItem): PropertyRow[] {
    const detail = rules.equipmentDetails(eq);
    const rule = rules.equipmentRule(eq.slot);
    const label = (key: string) => rules.equipmentStats[key] || key;
    const rows: PropertyRow[] = [];
    const push = (
        name: string,
        value: string | number | null | undefined | PropertySegment[],
        kind: PropertyKind,
        tag = false,
    ) => {
        if (value === '' || value == null) return;
        if (Array.isArray(value)) {
            const segments = value.filter((item) => item.name !== '' || item.num !== '');
            if (!segments.length) return;
            rows.push({
                label: name,
                value: segments.map((item) => `${item.name} ${item.num}`).join(' · '),
                // 单段也按段渲染：段内的属性名与数值各自不断行，断点只留在两者之间。
                segments,
                kind,
                tag,
            });
            return;
        }
        rows.push({ label: name, value: String(value), kind, tag });
    };
    /** 一组词条并排成一行，中间用间隔号分开。 */
    const line = (list: EquipmentRow[]) => list.map((row) => statSegment(label(row.key), row));
    /**
     * 同类词条成组：`max` 是一行最多并几段，超出的各自成行。
     *
     * 装备的双加两条并排（游戏里本来就是并排读的），灵饰的附加与玉魄的加成一条
     * 一行——它们的词条名长（「气血回复效果 +10 [+12]」），两条并排必然折成两行，
     * 第二行只剩半段，不如一开始就一行一条。
     *
     * 第二条起标签留空（不是省掉那个 span——它撑着网格第一列，省了值就落到最左边）。
     * 空标签配 `tag: false`，不会画出一枚空的类别签。
     */
    const group = (
        name: string,
        list: EquipmentRow[],
        kind: PropertyKind,
        max: number,
        tag = true,
    ) => {
        const segments = line(list);
        if (segments.length <= max) {
            push(name, segments, kind, tag);
            return;
        }
        segments.forEach((segment, index) =>
            push(index ? '' : name, [segment], kind, index === 0 && tag),
        );
    };

    group('基础', detail.base, 'base', 2);
    group(
        rule.kind === 'accessory' ? '附加' : rule.kind === 'jade' ? '加成' : '双加',
        detail.extra,
        'extra',
        // 灵饰与玉魄一条一行；装备的双加两条并排。
        rule.kind === 'gear' ? 2 : 1,
    );
    // 宝石属性里与主要属性同 key 的不再重复列一遍，否则「伤害」会出现两次。
    const bonus = detail.bonus.filter((row) => !detail.base.some((base) => base.key === row.key));
    group('宝石', bonus, 'gem', 2);
    group('熔炼', detail.melt, 'base', 2, false);

    push('特技', detail.technique, 'special');
    detail.effects.forEach((effect) => push('特效', effect, 'special'));
    if (detail.clock.name)
        push('钟灵石', `${detail.clock.name} ${detail.clock.level} 级`, 'special');

    // 锻炼段数、宝石与精炼合成一行：它们都是「这件装备打到什么程度」。
    const socket: string[] = [];
    if (detail.forge !== null) socket.push(detail.forge + ' 段');
    if (rule.kind === 'accessory' && detail.forge !== null) socket.push('星辉石');
    // 宝石段数通常就等于锻炼等级，这时候再写一遍「（12 段）」只是噪声。
    detail.gems.forEach((gem) =>
        socket.push(
            gem.level == null || gem.level === detail.forge
                ? gem.type
                : `${gem.type}（${gem.level} 段）`,
        ),
    );
    if (socket.length)
        push(
            // 只填了宝石、没填段数时别也叫「宝石」——上面已经有一组宝石属性了。
            rule.kind === 'accessory' ? '精炼' : detail.forge === null ? '镶嵌' : '锻炼',
            socket.join(' '),
            'upgrade',
            true,
        );

    push('符石', detail.runes, 'upgrade');
    push('原有属性', detail.legacy, 'legacy');

    /* 玉魄：灵尘、奇袭、开光一律垫底，与上面的词条用一档更淡的标签隔开。 */
    if (rule.kind === 'jade') {
        if (detail.jade.dust !== null) push('灵尘', `${detail.jade.dust} 级`, 'upgrade', true);
        if (detail.jade.assault)
            // 游戏里写「奇袭法术」，标签已经是「奇袭」，值里再去掉这两个字，
            // 否则列表读起来是「奇袭 奇袭法术 0.5%」。
            push(
                '奇袭',
                String(detail.jade.assault).replace(/^奇袭/, '') +
                    (detail.jade.chance == null ? '' : ` ${detail.jade.chance}%`),
                'special',
            );
        if (detail.jade.holes) push('开光', `${detail.jade.holes} 孔`, 'upgrade');
        detail.jade.enchantments.forEach((value, index) =>
            push(`孔 ${index + 1}`, value || '未强化', 'special'),
        );
    }
    return rows;
}
