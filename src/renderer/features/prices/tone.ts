/**
 * 物价一级分类的色调。
 *
 * 卡片与左侧目录共用这一份取值：卡片的淡底、边框、价格色都从这里来，左侧目录的色点
 * 也是——两处一致，扫一眼就能把「左边这一类」和「右边这一片卡」连起来。写在本文件而不是
 * 各自的 `.vue` 里，是因为同一个分类在两处出两种颜色比没有颜色更糟。
 *
 * 令牌色直接引 `var()`，页面对两套主题各自解析；几个写死的褐 / 橄榄 / 黛 / 紫用
 * `light-dark()` 各给一份——暗底上原来的深色几乎看不见，卡片会变成没分类的灰块。
 *
 * 自定义一级（理论上不存在，读取时已兜到「其他」）按名称散列到同一批色里，
 * 保证同一个名字永远同一个色。
 */
const FIXED: Record<string, string> = {
    装备灵饰: 'light-dark(#6b7b52, #9db083)',
    召唤兽: 'light-dark(#8a6a8a, #b99cc0)',
    兽决内丹: 'var(--gold)',
    宝石符石: 'var(--red)',
    打造材料: 'light-dark(#7a6a53, #b3a184)',
    消耗补给: 'var(--green)',
    任务产出: 'light-dark(#8a5a2b, #c49a6a)',
    通货账号: 'var(--blue)',
    其他: 'var(--muted)',
};

const POOL = [
    'var(--gold)',
    'var(--blue)',
    'var(--red)',
    'var(--green)',
    'light-dark(#8a5a2b, #c49a6a)',
    'light-dark(#8a6a8a, #b99cc0)',
];

/** @param category 一级分类名，空值按「其他」处理 */
export function priceTone(category: string): string {
    const name = category || '其他';
    if (FIXED[name]) return FIXED[name];
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 997;
    return POOL[hash % POOL.length];
}
