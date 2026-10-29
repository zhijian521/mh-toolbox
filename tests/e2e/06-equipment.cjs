/**
 * 装备：三套方案、换装、记变动、属性编辑器、粘贴导入、截图识别与删除。
 */
module.exports = async function equipment(env) {
    const { read, until, untilSlow, click, field, choose, disk, untilDisk, assert } = env;

    const fs = require('node:fs');
    const path = require('node:path');
    // ---- 装备：三套方案、换装、记变动、删除 ----
    await read(() => document.querySelector('a[href="#/equipment"]').click());
    await until(() => document.querySelector('.page-header h1')?.textContent === '装备', '装备页');
    assert.equal(
        await read(() => document.querySelectorAll('.eq-slot').length),
        12,
        '常规 6 格 + 灵饰 4 格 + 玉魄 2 格',
    );
    assert.equal(await read(() => document.querySelectorAll('.eq-plan').length), 3);
    assert.equal(
        await read(() => document.querySelectorAll('.eq-slot.filled').length),
        0,
        '还没有档案，格子都是空位',
    );

    // 空位选装里也能直接截图识别：带着当前方案号进去，入库后默认穿到这一套。
    await read(() => document.querySelectorAll('.eq-slot')[2].click());
    // 档案还没有时选装弹窗里没有候选列表，等的是「空态」那句话。
    await until(() => !!document.querySelector('.eq-picker, .eq-picker-empty'), '空位选装弹窗');
    // 顶栏也有一个同名的「截图识别」，这里要点弹窗里那颗。
    await read(() => {
        const modal = document.querySelector('.modal');
        [...modal.querySelectorAll('button')]
            .find((button) => button.textContent.trim() === '截图识别')
            .click();
    });
    await until(() => !!document.querySelector('.shot-drop'), '选装里的截图识别');
    assert.notEqual(
        await read(() => document.querySelector('.shot-plan .select-value')?.textContent.trim()),
        '只入库，不自动穿戴',
        '从空位进来时默认选中正在看的那一套',
    );
    await click('取消');
    await until(() => !document.querySelector('.shot-drop'), '截图识别已关闭');
    assert.equal(
        await read(() => !!document.querySelector('.eq-picker')),
        false,
        '截图弹窗关掉后不再叠着一个选装弹窗',
    );

    // 新增一件武器：只填档案，属性留空也是合法档案（属性编辑器另有一步验证）。
    await click('＋ 新增装备');
    await until(() => !!document.querySelector('#equipment-form'), '新增装备弹窗');
    await field('[name="name"]', '测试武器');
    await field('[name="level"]', '120');
    await click('登记装备');
    await until(() => !document.querySelector('#equipment-form'), '装备已登记');
    await untilDisk(() => disk().equipment.length === 1, '装备落盘');
    assert.equal(disk().equipment[0].slot, '武器');
    assert.equal(disk().equipment[0].characterId, disk().characters[0].id, '挂在当前角色上');

    // 点空位选装：格子 → 选装弹窗 → 选中即穿到方案一。
    await read(() => document.querySelectorAll('.eq-slot')[2].click());
    await until(() => !!document.querySelector('.eq-picker'), '选装弹窗');
    await read(() => {
        const button = [...document.querySelectorAll('.eq-pick')].find((item) =>
            item.textContent.includes('测试武器'),
        );
        button.click();
    });
    await until(() => !document.querySelector('.modal'), '选装完成');
    await untilDisk(
        () => disk().characters[0].equipmentSets[0].slots['武器'] === disk().equipment[0].id,
        '已穿到方案一',
    );

    // 切到第二套：方案只存引用，切换本身也要落盘。
    await read(() => document.querySelectorAll('.eq-plan')[1].click());
    await untilDisk(() => disk().characters[0].viewedEquipmentSet === 1, '切到方案二');
    await until(() => document.querySelectorAll('.eq-slot.filled').length === 0, '方案二还是空栏');
    await read(() => document.querySelectorAll('.eq-plan')[0].click());
    await until(() => document.querySelectorAll('.eq-slot.filled').length === 1, '切回方案一');

    // 记一次变动：默认同时记进账号账本，双向关联。
    await click('仓库');
    await until(() => !!document.querySelector('.eq-table'), '装备仓库');
    assert.ok(
        await read(() => document.querySelector('.modal h2')?.textContent.endsWith('装备仓库')),
        '仓库盖在页面上弹窗打开，不是同层标签',
    );
    await click('记变动');
    await until(() => !!document.querySelector('#gear-log-form'), '记变动弹窗');
    /*
     * 变动日期必填：「清空」这颗按钮不该出现。
     *
     * 以前能清空再保存，就写出一条 `date: ''` 的流水——默认「本月」筛不到它、
     * 时间线上日期是空白，用户只看到账本少了一笔。领域那边也补了校验，两层都验。
     */
    await read(() => document.querySelector('.date-trigger[aria-label="变动日期"]').click());
    await until(() => !!document.querySelector('.date-popover'), '变动日期日历');
    assert.equal(
        await read(() =>
            [...document.querySelectorAll('.date-popover .btn')].some(
                (button) => button.textContent.trim() === '清空',
            ),
        ),
        false,
        '必填日期不给「清空」',
    );
    // 选「今天」只是把日历收起来：日期本来就是今天，值不变。
    await read(() =>
        [...document.querySelectorAll('.date-popover .btn')]
            .find((button) => button.textContent.trim() === '今天')
            .click(),
    );
    await until(() => !document.querySelector('.date-popover'), '选今天收起日历');
    await field('[name="amount"]', '300');
    await click('记录变动');
    await until(() => !document.querySelector('#gear-log-form'), '变动已记录');
    await untilDisk(
        () =>
            disk().transactions.some(
                (tx) => tx.equipmentId === disk().equipment[0].id && tx.amount === 300,
            ),
        '变动进了账号账本',
    );
    const gearTx = disk().transactions.find((tx) => tx.equipmentId === disk().equipment[0].id);
    assert.equal(gearTx.ledger, 'account', '装备买卖记在账号账本');
    assert.equal(gearTx.kind, 'expense', '购入是支出');
    assert.equal(disk().gearLogs.length, 1, '时间线有一条变动');

    // 删除档案：流水保留、只解除关联。
    // 仓库是盖在页面上的弹窗，详情与删除确认会再叠一层，所以 `.modal` 不止一个，
    // 取最后一个才是当前最上面那层。
    await click('删除');
    await until(
        () =>
            [...document.querySelectorAll('.modal')].some((modal) =>
                modal.textContent.includes('删除装备档案'),
            ),
        '删除确认',
    );
    await read(() =>
        [...document.querySelectorAll('.modal')].at(-1).querySelector('.btn.danger').click(),
    );
    await untilDisk(() => disk().equipment.length === 0, '档案已删除');
    await until(
        () =>
            ![...document.querySelectorAll('.modal')].some((modal) =>
                modal.textContent.includes('删除装备档案'),
            ),
        '删除确认收起',
    );
    assert.equal(disk().gearLogs.length, 0, '变动记录一并删除');
    const keptTx = disk().transactions.find((tx) => tx.amount === 300);
    assert.ok(keptTx, '账本流水保留');
    assert.equal(keptTx.equipmentId, undefined, '只解除关联');

    // ---- 属性编辑器：词条、宝石、特效都写进结构化属性 ----
    await click('＋ 新增装备');
    await until(() => !!document.querySelector('#equipment-form'), '新增装备弹窗');
    await field('[name="name"]', '测试剑');
    await field('[name="level"]', '130');
    await field('[name="eq-base-damage"]', '480');
    await field('[name="eq-base-hit"]', '530');
    await field('[name="eq-forge"]', '8');
    // 附加属性：先加一行，再选属性、填数值。
    await read(() => document.querySelector('.modal .group-head .add').click());
    await choose('附加属性', '力量');
    await field('.modal .row input[type="number"]', '32');
    // 特效与宝石：勾选框直接点 input，标签结构变了也不会让用例失效。
    await read(() => {
        const check = [...document.querySelectorAll('.modal .checks .check')].find(
            (element) => element.textContent.trim() === '永不磨损',
        );
        check.querySelector('input').click();
    });
    await read(() => {
        const gem = [...document.querySelectorAll('.modal .gem')].find((element) =>
            element.textContent.includes('太阳石'),
        );
        gem.querySelector('input[type="checkbox"]').click();
    });
    await read(() => {
        const gem = [...document.querySelectorAll('.modal .gem')].find((element) =>
            element.textContent.includes('太阳石'),
        );
        const input = gem.querySelector('input[type="number"]');
        input.value = '8';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('登记装备');
    await until(() => !document.querySelector('#equipment-form'), '属性已保存');
    await untilDisk(
        () => disk().equipment.some((eq) => eq.name === '测试剑' && eq.details?.forge === 8),
        '结构化属性落盘',
    );
    const crafted = disk().equipment.find((eq) => eq.name === '测试剑');
    assert.equal(crafted.details.base.length, 2, '主要属性两条');
    assert.equal(crafted.details.base[0].key, 'damage');
    assert.equal(crafted.details.extra[0].key, 'strength');
    assert.equal(crafted.details.extra[0].value, 32);
    assert.deepEqual(crafted.details.effects, ['永不磨损']);
    assert.equal(crafted.details.gems[0].type, '太阳石', '宝石勾选写入');
    assert.equal(crafted.details.gems[0].level, 8);
    assert.equal(crafted.attributes, '伤害 +480\n命中 +530\n力量 +32', '快照文本同步');

    // ---- 方案改名：三条一起校验，改完随档案读回 ----
    // 仓库这时还开着（新增是从页面顶部进去的，弹窗留在下面），先收起它回到搭配。
    await read(() => {
        const modal = [...document.querySelectorAll('.modal')].at(-1);
        [...modal.querySelectorAll('.btn')]
            .find((button) => button.textContent.trim() === '关闭')
            .click();
    });
    await until(() => !document.querySelector('.eq-table'), '收起仓库');
    await until(() => document.querySelectorAll('.eq-plan').length === 3, '回到搭配');
    await click('改名');
    await until(() => !!document.querySelector('#plan-form'), '改名弹窗');
    await field('[name="set-0"]', '日常');
    await field('[name="set-1"]', '比武');
    await field('[name="set-2"]', '任务');
    await click('保存名称');
    await until(() => !document.querySelector('#plan-form'), '改名保存');
    await untilDisk(() => disk().characters[0].equipmentSets[2].name === '任务', '方案名落盘');
    assert.equal(
        await read(
            () => document.querySelectorAll('.eq-plan')[1].querySelector('span').textContent,
        ),
        '比武',
        '标签跟着变',
    );

    // 先穿一件：复制断言要有可比的内容，空方案复制空方案说明不了问题。
    await read(() => document.querySelectorAll('.eq-slot')[2].click());
    await until(() => !!document.querySelector('.eq-picker'), '选装弹窗');
    await read(() => {
        const button = [...document.querySelectorAll('.eq-pick')].find((item) =>
            item.textContent.includes('测试剑'),
        );
        button.click();
    });
    await until(() => !document.querySelector('.modal'), '穿上测试剑');
    await untilDisk(
        () => !!disk().characters[0].equipmentSets[0].slots['武器'],
        '方案一穿上测试剑',
    );

    // ---- 复制方案：把正在查看的这套覆盖到另一套 ----
    await click('复制方案');
    await until(() => !!document.querySelector('#plan-form'), '复制弹窗');
    await click('覆盖目标方案');
    await until(() => !document.querySelector('#plan-form'), '复制完成');
    await untilDisk(
        () => !!disk().characters[0].equipmentSets[1].slots['武器'],
        '方案二拿到武器引用',
    );
    assert.equal(
        disk().characters[0].equipmentSets[1].slots['武器'],
        disk().characters[0].equipmentSets[0].slots['武器'],
        '复制的是引用，不是新档案',
    );
    assert.equal(disk().equipment.length, 1, '复制不新增档案');

    // ---- 粘贴导入：两件文本，一件按名称认出部位，一件按后缀 ----
    await click('粘贴导入');
    await until(() => !!document.querySelector('[name="paste"]'), '导入弹窗');
    await field(
        '[name="paste"]',
        '名称：霜寒剑\n装备等级：130\n伤害 +500\n命中 +540\n\n名称：流云履\n装备等级：120\n防御 +86\n敏捷 +35',
    );
    await click('解析文本');
    await until(() => document.querySelectorAll('.modal .item').length === 2, '解析出两件');
    assert.equal(
        await read(() => document.querySelectorAll('.modal .item.bad').length),
        0,
        '两件都识别出部位，没有待补齐项',
    );
    await read(() => {
        const button = [...document.querySelectorAll('.modal button')].find((element) =>
            element.textContent.trim().startsWith('入库'),
        );
        button.click();
    });
    await until(() => !document.querySelector('[name="paste"]'), '导入完成');
    await untilDisk(() => disk().equipment.length === 3, '两件都落盘');
    const imported = disk().equipment.find((eq) => eq.name === '霜寒剑');
    assert.equal(imported.slot, '武器');
    assert.equal(imported.level, 130);
    assert.equal(imported.details.base.length, 2, '属性文本解析成结构化属性');
    assert.equal(imported.details.base[0].value, 500);
    assert.equal(
        disk().equipment.find((eq) => eq.name === '流云履').slot,
        '鞋子',
        '名称后缀认出部位',
    );
    assert.ok(imported.ocrText.includes('霜寒剑'), '原文留在档案里可回查');
    assert.equal(
        await read(() => document.querySelectorAll('.eq-row').length),
        4,
        '导入后自动打开仓库，包含表头与三件档案',
    );

    // ---- 截图识别：真实截图跑通「图片 → 本地 OCR → 同一套解析 → 落盘」 ----
    await click('截图识别');
    await until(() => !!document.querySelector('.shot-drop'), '截图录入弹窗');
    const shotBytes = fs
        .readFileSync(path.join(__dirname, '..', 'fixtures', 'equipment-jade.png'))
        .toString('base64');
    // 文件读不了、真实拖拽又难模拟，直接把字节塞进 file input，走与选择图片相同的路径。
    await read((bytes) => {
        // 仓库弹窗还开着，按类名精确找截图弹窗里的「选择图片」输入框。
        const input = document.querySelector('.shot-add input[type="file"]');
        if (!input) throw new Error('截图弹窗里没有文件输入框');
        const binary = atob(bytes);
        const pixels = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++)
            pixels[index] = binary.charCodeAt(index);
        const transfer = new DataTransfer();
        transfer.items.add(new File([pixels], 'shot.png', { type: 'image/png' }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, shotBytes);
    // 识别完成时缩略图上的进度角标消失；「待补充」是另一种角标，不会被这里误判成完成。
    await untilSlow(
        () =>
            !!document.querySelector('.shot-thumb') &&
            !document.querySelector('.shot-thumb .shot-badge'),
        '本地 OCR 识别完成',
        60,
    );
    assert.equal(
        await read(() => document.querySelector('.shot-meta input')?.value),
        '上古玉魄·阳',
        '识别出玉魄名称',
    );
    /*
     * 核对时改名，入库要存改后的值。
     *
     * 这条链路是「输入框 emit rename → 队列写回草稿 → 入库读草稿」，2026-10-29 拆
     * 弹窗时重接过一遍；端到端原来只验 OCR 结果落盘，链路断了也看不出来。
     */
    await field('.shot-meta input', '测试改名玉魄');
    assert.equal(
        await read(() => document.querySelector('.shot-meta input')?.value),
        '测试改名玉魄',
        '改名留在输入框里',
    );
    await click('入库 1 件');
    await untilDisk(() => disk().equipment.length === 4, '识别结果落盘');
    const shotJade = disk().equipment.find((eq) => eq.slot === '玉魄·阳');
    assert.ok(shotJade, '按名称认出这是玉魄·阳');
    assert.equal(shotJade.name, '测试改名玉魄', '入库的是核对时改过的名称');
    assert.equal(shotJade.details.jade.dust, 2, '识别出灵尘等级');
    assert.equal(shotJade.details.jade.assault, '奇袭法术', '识别出奇袭类型');
    assert.equal(shotJade.details.jade.chance, 0.5, '识别出奇袭概率');
    assert.equal(shotJade.details.jade.holes, 1, '「奇袭特技：[空]」算出一个开光孔');
    assert.equal(shotJade.details.base[0].value, 10, '基础属性进 base');
    assert.deepEqual(
        shotJade.details.extra.map((row) => row.value),
        [5, 4],
        '两条附加属性按顺序进 extra',
    );
    assert.deepEqual(
        shotJade.details.extra.map((row) => row.boost),
        [12, 9],
        '方括号里的灵尘加成存成 boost',
    );
    assert.ok(shotJade.ocrText.includes('灵尘等级'), '识别原文留在档案里可回查');

    // ---- 列表只摆装备本身的属性：灵尘、开光这类配置留给详情 ----
    // 找的是改过名的那一行：列表跟着改名走，说明入库写的就是草稿里的名称。
    const warehouseRow = await read(() => {
        const row = [...document.querySelectorAll('.eq-row')].find((element) =>
            element.textContent.includes('测试改名玉魄'),
        );
        return row
            ? [...row.querySelectorAll('.eq-prop')].map((line) => line.textContent.trim())
            : [];
    });
    assert.ok(
        warehouseRow.some((line) => line.includes('物理暴击等级')),
        '基础属性在列表里',
    );
    // 2026-10-29 起列表不再折叠：灵尘、开光孔、奇袭这些配置项也摆出来。
    assert.ok(
        warehouseRow.some((line) => /灵尘/.test(line)),
        '列表里能看到灵尘等级',
    );
    // 开光孔不再单独占一行，直接按游戏里的叫法写「奇袭特技」，空孔显示「空」。
    assert.ok(
        warehouseRow.some((line) => /奇袭特技/.test(line)),
        '列表里能看到奇袭特技孔',
    );
    assert.ok(
        !warehouseRow.some((line) => /五行|制造者|耐久|修理失败/.test(line)),
        '五行、制造者、耐久、修理失败不进列表',
    );
    assert.ok(
        !warehouseRow.some((line) => /还有 \d+ 条/.test(line)),
        '属性不再折叠成「还有 N 条」',
    );
    await read(() => {
        [...document.querySelectorAll('.eq-row')]
            .find((element) => element.textContent.includes('测试改名玉魄'))
            .querySelector('.eq-name-button')
            .click();
    });
    await until(() => !!document.querySelector('.detail-grid'), '玉魄详情');
    // 只看属性区：详情里的「识别原文」也含「灵尘等级」，拿整个弹窗断言会假阳性。
    // 仓库弹窗里每行也有 `.eq-props`，所以限定在详情的属性区里取。
    const detailText = await read(
        () => document.querySelector('.detail-grid .eq-props')?.textContent || '',
    );
    assert.ok(/灵尘/.test(detailText), '详情里能看到灵尘等级');
    assert.ok(/奇袭特技/.test(detailText), '详情里能看到奇袭特技孔');
    assert.ok(/奇袭/.test(detailText), '详情里能看到奇袭法术');
    // 关掉详情，再关掉仓库——后面回到页面上的其它弹窗，层不能留着。
    const closeTop = () =>
        read(() => {
            const modal = [...document.querySelectorAll('.modal')].at(-1);
            [...modal.querySelectorAll('.btn')]
                .find((button) => button.textContent.trim() === '关闭')
                .click();
        });
    await closeTop();
    await until(() => !document.querySelector('.detail-grid'), '详情已关闭');
    await closeTop();
    await until(() => !document.querySelector('.modal'), '仓库已收起');
};
