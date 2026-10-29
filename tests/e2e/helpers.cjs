/**
 * 端到端脚本的公共动作。
 *
 * 全部经 `state` 拿窗口与数据文件，而不是闭包捕获：各段流程拆进 `./e2e/` 之后，
 * 它们只认这一组函数；`state.window` 在窗口重建（`reload`）后仍然指向新的那个。
 */
const fs = require('node:fs');

/** `state` 由入口持有：`window` 在窗口创建时填，`file` 在拿到 `info()` 后填。 */
function createHelpers(state) {
    const read = (fn, ...args) =>
        state.window.webContents.executeJavaScript(
            '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')',
            true,
        );
    async function until(fn, label, ...args) {
        for (let index = 0; index < 300; index++) {
            if (await read(fn, ...args)) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error('等待失败：' + label);
    }
    /**
     * 等一件要真正花时间的活。
     *
     * 本地 OCR 首次要加载 ONNX 模型，几秒钟起步，默认 6 秒的上限不够；轮询间隔也放宽，
     * 免得几十次 `executeJavaScript` 反过来拖慢推理。
     */
    async function untilSlow(fn, label, seconds, ...args) {
        for (let index = 0; index < Math.round((seconds * 1000) / 50); index++) {
            if (await read(fn, ...args)) return;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error('等待失败：' + label);
    }
    const click = (text) =>
        read((text) => {
            const button = [...document.querySelectorAll('button')].find(
                (element) => element.textContent.trim() === text && !element.disabled,
            );
            if (!button) throw new Error('按钮不存在：' + text);
            button.click();
        }, text);
    const field = (selector, value) =>
        read(
            (selector, value) => {
                const input = document.querySelector(selector);
                if (!input) throw new Error('字段不存在：' + selector);
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            },
            selector,
            value,
        );
    const submit = (selector) =>
        read((selector) => document.querySelector(selector).requestSubmit(), selector);
    const openSelect = (label) =>
        read((label) => {
            const trigger = document.querySelector('[role="combobox"][aria-label="' + label + '"]');
            if (!trigger) throw new Error('下拉不存在：' + label);
            trigger.click();
        }, label);
    // 查找与点击放在同一次执行里：分成两次会在弹层重渲染的间隙里拿不到节点。
    const choose = async (label, text) => {
        await openSelect(label);
        await until(
            (text) => {
                const item = [...document.querySelectorAll('.popover .xitem')].find(
                    (element) => element.textContent.trim() === text,
                );
                if (!item) return false;
                item.click();
                return true;
            },
            '选择选项：' + label + ' / ' + text,
            text,
        );
    };
    // 目标状态下拉的选项带计数（如「已完成 1」），按前缀匹配，避免把数量写死在用例里。
    const chooseStatus = async (text) => {
        await openSelect('目标状态');
        await until(
            (text) => {
                const item = [...document.querySelectorAll('.popover .xitem')].find((element) =>
                    element.textContent.trim().startsWith(text),
                );
                if (!item) return false;
                item.click();
                return true;
            },
            '选择目标状态：' + text,
            text,
        );
    };
    const disk = () => JSON.parse(fs.readFileSync(state.file, 'utf8'));
    /**
     * 在 Node 侧轮询磁盘。
     *
     * `until` 是把函数序列化丢进页面执行，闭包里的 `disk()` 之类根本看不见；账号同步是
     * 异步落盘的，只能读文件等它写完。
     */
    async function untilDisk(check, label) {
        for (let index = 0; index < 200; index++) {
            if (check()) return;
            await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw new Error('等待失败：' + label);
    }

    return {
        read,
        until,
        untilSlow,
        click,
        field,
        submit,
        openSelect,
        choose,
        chooseStatus,
        disk,
        untilDisk,
    };
}

module.exports = { createHelpers };
