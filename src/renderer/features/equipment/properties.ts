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

/** 属性行的视觉分组，只决定文字颜色，不参与语义。 */
export type PropertyKind = 'attribute' | 'gem' | 'special' | 'upgrade' | 'legacy';

export interface PropertyRow {
    label: string;
    value: string;
    kind: PropertyKind;
}

/**
 * 一条词条写成「伤害 +480 [强化 +30]」。
 *
 * 领域里的 `equipmentStatText` 用的是 ASCII 连字符，界面上负号要写成 U+2212 才和
 * 页面其它数字一致，所以这里自己拼而不直接用它。
 */
function statText(label: string, row: EquipmentRow) {
    const sign = row.value >= 0 ? '+' : '−';
    const boost = row.boost == null ? '' : ` [${row.boost >= 0 ? '+' : '−'}${Math.abs(row.boost)}]`;
    return `${label} ${sign}${Math.abs(row.value)}${boost}`;
}

/**
 * 把装备属性摊平成「标签 + 值」的行，格子、仓库、详情三处共用。
 *
 * 主要属性合成一行（游戏里就是并排显示的两条），其余每条一行。`full` 只在详情里
 * 打开，补上五行、耐久、修理、制造者与备注，以及钟灵石、套装、灵尘、奇袭、开光孔
 * 这些「怎么配的」——格子里塞这些会把属性挤得看不见，列表行高也会翻倍。
 *
 * 属性为空时返回空数组而不是占位行：调用方需要区分「没录」和「录了但是 0」，
 * 由各自决定要不要显示「未录入属性」。
 */
export function propertyRows(rules: Domain, eq: EquipmentItem, full = false): PropertyRow[] {
    const detail = rules.equipmentDetails(eq);
    const rule = rules.equipmentRule(eq.slot);
    const label = (key: string) => rules.equipmentStats[key] || key;
    const rows: PropertyRow[] = [];
    const add = (name: string, value: unknown, kind: PropertyKind = 'attribute') => {
        if (value === '' || value == null || value === undefined) return;
        rows.push({ label: name, value: String(value), kind });
    };

    if (detail.base.length)
        add('', detail.base.map((row) => statText(label(row.key), row)).join(' · '), 'attribute');
    detail.extra.forEach((row) => add('', statText(label(row.key), row), 'attribute'));
    // 宝石属性里与主要属性同 key 的不再重复列一遍，否则「伤害」会出现两次。
    detail.bonus
        .filter((row) => !detail.base.some((base) => base.key === row.key))
        .forEach((row) => add('宝石', statText(label(row.key), row), 'gem'));
    detail.melt.forEach((row) => add('熔炼', statText(label(row.key), row), 'attribute'));
    add('特技', detail.technique, 'special');
    detail.effects.forEach((effect) => add('特效', effect, 'special'));

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
        add(
            rule.kind === 'accessory' ? '精炼' : detail.forge === null ? '宝石' : '锻炼',
            socket.join(' '),
            'upgrade',
        );

    /*
     * 钟灵石、套装、灵尘、奇袭、开光孔都只在详情里列。
     *
     * 它们是「这件装备怎么配的」，不是「这件装备有多强」。列表与格子平铺这些，一件灵饰
     * 会摊成七行：真正要看的主要属性与三条附加被挤到过半看不见，列表行高也跟着翻倍。
     * 详情（`full`）里一行不少，列表只留装备本身的属性。
     */
    if (full) {
        if (detail.clock.name)
            add('钟灵石', `${detail.clock.name} ${detail.clock.level} 级`, 'special');
        add('套装', detail.suit, 'special');
        add('符石', detail.runes, 'upgrade');
        if (rule.kind === 'jade') {
            if (detail.jade.dust !== null) add('灵尘', `${detail.jade.dust} 级`, 'upgrade');
            if (detail.jade.assault)
                add(
                    '奇袭',
                    detail.jade.assault +
                        (detail.jade.chance == null ? '' : ` ${detail.jade.chance}%`),
                    'special',
                );
            if (detail.jade.holes) add('开光', `${detail.jade.holes} 孔`, 'upgrade');
            detail.jade.enchantments.forEach((value, index) =>
                add(`孔 ${index + 1}`, value || '未强化', 'special'),
            );
        }
        if (detail.legacy) add('原有属性', detail.legacy, 'legacy');
    }
    if (full) {
        add('五行', detail.element, 'legacy');
        if (detail.durability !== null) add('耐久', String(detail.durability), 'legacy');
        if (detail.repair !== null) add('修理失败', `${detail.repair} 次`, 'legacy');
        add('制造者', detail.maker, 'legacy');
        add('备注', eq.note, 'legacy');
    }
    return rows;
}
