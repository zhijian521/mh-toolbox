<script setup lang="ts">
import { onMounted } from 'vue';
import { useApplication } from '../../stores/application';

/**
 * 启动失败时的自救面板。
 *
 * 设计前提：数据文件读不出来时，正常界面（包括设置页）不可用，所以恢复手段
 * 必须直接长在错误屏上。四条出路，按「风险从低到高」排列：
 *   1. 诊断信息    —— 先看清到底是什么坏了、文件在哪、有没有备份；
 *   2. 另存原始文件 —— 在动任何东西之前，先保住原始字节；
 *   3. 从备份恢复   —— 有备份时的首选；
 *   4. 隔离后空启动 —— 兜底，原文件改名保留，不删除。
 * 单纯「重试」只在用户已经手工修好文件后才有意义，因此放最后并明确说明。
 */
const app = useApplication();
onMounted(app.loadRescueInfo);

function formatTime(value: number) {
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        date.getFullYear() +
        '-' +
        pad(date.getMonth() + 1) +
        '-' +
        pad(date.getDate()) +
        ' ' +
        pad(date.getHours()) +
        ':' +
        pad(date.getMinutes())
    );
}
function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
</script>

<template>
    <section class="rescue" aria-labelledby="rescue-title">
        <header class="rescue-head">
            <h2 id="rescue-title">暂时无法打开手账</h2>
            <p class="rescue-reason">{{ app.startupError }}</p>
            <p class="hint">
                数据文件可能被中断的写入损坏，或是来自更新版本。下面的操作都不会删除你的数据。
            </p>
        </header>

        <section v-if="app.diagnostics" class="rescue-card" aria-label="诊断信息">
            <h3>当前状态</h3>
            <dl class="rescue-facts">
                <div>
                    <dt>数据文件</dt>
                    <dd class="mono">{{ app.diagnostics.dataFile }}</dd>
                </div>
                <div>
                    <dt>文件大小</dt>
                    <dd>{{ formatSize(app.diagnostics.dataBytes) }}</dd>
                </div>
                <div>
                    <dt>可用备份</dt>
                    <dd>
                        {{ app.diagnostics.backups }} 份（其中滚动备份
                        {{ app.diagnostics.rollingBackups }} 份）
                    </dd>
                </div>
            </dl>
            <div class="actions">
                <button class="btn compact" @click="app.openDirectory('data')">打开数据目录</button>
                <button class="btn compact" @click="app.openDirectory('logs')">打开日志目录</button>
                <button class="btn compact" :disabled="app.rescueBusy" @click="app.exportRaw()">
                    另存原始文件
                </button>
            </div>
            <details v-if="app.diagnostics.logTail" class="rescue-log">
                <summary>最近的日志</summary>
                <pre>{{ app.diagnostics.logTail }}</pre>
            </details>
        </section>

        <section v-if="app.backups.length" class="rescue-card" aria-label="从备份恢复">
            <h3>从备份恢复</h3>
            <p class="hint">恢复前会把当前文件另存一份事务备份，可以再次回退。</p>
            <ul class="rescue-backups">
                <li v-for="entry in app.backups.slice(0, 8)" :key="entry.name">
                    <span class="mono">{{ entry.name }}</span>
                    <span class="rescue-meta">
                        {{ formatTime(entry.time) }} · {{ formatSize(entry.size) }}
                        <template v-if="entry.rolling">· 滚动</template>
                    </span>
                    <button
                        class="btn compact"
                        :disabled="app.rescueBusy"
                        @click="app.restoreBackup(entry.name)"
                    >
                        恢复
                    </button>
                </li>
            </ul>
        </section>

        <section class="rescue-card danger-zone" aria-label="隔离损坏文件">
            <h3>仍然打不开？</h3>
            <p class="hint">
                把当前数据文件改名保留（不会删除），应用以空数据启动。之后可以重新导入之前另存的备份。
            </p>
            <button
                class="btn danger"
                :disabled="app.rescueBusy"
                @click="app.quarantineAndStartEmpty"
            >
                隔离损坏文件并以空数据启动
            </button>
        </section>

        <p v-if="app.rescueMessage" class="rescue-message" role="status">{{ app.rescueMessage }}</p>

        <footer class="rescue-footer">
            <span>如果你已经手工修复了数据文件：</span>
            <button class="text-button" @click="app.initialize()">重新读取</button>
        </footer>
    </section>
</template>

<style scoped>
.rescue {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 780px;
    margin: 0 auto;
    padding: 28px 24px 40px;
    overflow-y: auto;
    min-height: 0;
}
.rescue-head h2 {
    font-size: 18px;
}
.rescue-reason {
    margin-top: 8px;
    padding: 9px 11px;
    border: 1px solid color-mix(in srgb, var(--red) 25%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--red) 5%, transparent);
    color: var(--red);
    font-size: 13px;
    word-break: break-all;
}
.rescue-head .hint {
    margin-top: 9px;
}
.rescue-card {
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper);
}
.rescue-card h3 {
    font-size: 14px;
    margin-bottom: 10px;
}
.rescue-facts {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 12.5px;
}
.rescue-facts div {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 10px;
}
.rescue-facts dt {
    color: var(--muted);
}
.rescue-facts dd {
    word-break: break-all;
}
.rescue-card .actions {
    margin-top: 12px;
}
.rescue-log {
    margin-top: 12px;
    font-size: 12px;
}
.rescue-log summary {
    cursor: pointer;
    color: var(--muted);
}
.rescue-log pre {
    margin-top: 8px;
    max-height: 180px;
    overflow: auto;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
    font-size: 11.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
}
.rescue-backups {
    display: flex;
    flex-direction: column;
    gap: 8px;
    list-style: none;
}
.rescue-backups li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 10px;
    align-items: center;
    padding: 7px 9px;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 12px;
}
.rescue-meta {
    color: var(--muted);
    white-space: nowrap;
}
.danger-zone {
    border-color: color-mix(in srgb, var(--red) 25%, transparent);
}
.danger-zone .btn {
    margin-top: 4px;
}
.rescue-message {
    padding: 9px 11px;
    border: 1px solid var(--line-2);
    border-radius: 4px;
    background: var(--paper-2);
    font-size: 12.5px;
    word-break: break-all;
}
.rescue-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--muted);
}
.mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 11.5px;
}
@media (max-width: 750px) {
    .rescue-backups li {
        grid-template-columns: minmax(0, 1fr) auto;
    }
    .rescue-meta {
        grid-column: 1 / -1;
    }
}
</style>
