import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { createDomain } from '../domain/create-domain.js';
import { desktop, plain } from '../services/desktop';
import type { AppData, AppInfo, BackupEntry, Diagnostics, Domain } from '../app/types';

/**
 * 应用状态。
 *
 * 除了常规的数据快照与忙碌标记，这里还承担「启动失败后如何自救」：
 * 以前 initialize() 失败只会留下一条错误文案和一个重试按钮，而重试执行的是
 * 完全相同的失败路径，设置页又因为路由未挂载而不可达，等于把用户锁在门外。
 * 现在失败的入口同时准备好急救通道（诊断、备份列表、原始导出、隔离坏文件），
 * 让错误界面本身就能完成恢复。
 */
export const useApplication = defineStore('application', () => {
    let domain: Domain;
    const data = shallowRef<AppData | null>(null);
    const info = shallowRef<AppInfo | null>(null);
    const loading = ref(true),
        startupError = ref(''),
        pending = ref(0);
    const toast = ref(''),
        toastError = ref(false);
    let toastTimer: ReturnType<typeof setTimeout>;
    const busy = computed(() => pending.value > 0);
    // 排序规则只在领域层维护一份（`orderedCards`）：`sortOrder` 缺省、空串与非法值时
    // 的落位由 `characterNumber` 统一裁决，界面层不再自行解释这些值。
    const characters = computed(() =>
        data.value ? rules().orderedCards(data.value.characters) : [],
    );
    // 急救面板用到的状态；只在启动失败时填充。
    const diagnostics = shallowRef<Diagnostics | null>(null);
    const backups = shallowRef<BackupEntry[]>([]);
    const rescueBusy = ref(false);
    const rescueMessage = ref('');

    function notify(message: string, error = false) {
        clearTimeout(toastTimer);
        toast.value = message;
        toastError.value = error;
        toastTimer = setTimeout(() => {
            toast.value = '';
        }, 4000);
    }

    async function initialize() {
        loading.value = true;
        startupError.value = '';
        try {
            const gateway = desktop();
            domain = createDomain({ gateway, preferences: localStorage }) as unknown as Domain;
            await domain.init();
            data.value = plain(domain.state);
            info.value = await gateway.info();
        } catch (error) {
            startupError.value = error instanceof Error ? error.message : String(error);
        } finally {
            loading.value = false;
        }
    }

    /** 启动失败时加载急救信息：文件位置、大小、备份数量与日志尾部。 */
    async function loadRescueInfo() {
        try {
            const gateway = desktop();
            const [detail, backupList] = await Promise.all([
                gateway.diagnostics(),
                gateway.listBackups(),
            ]);
            diagnostics.value = detail;
            backups.value = backupList.ok ? backupList.backups : [];
            if (!info.value) info.value = await gateway.info();
        } catch (error) {
            rescueMessage.value = error instanceof Error ? error.message : String(error);
        }
    }

    /** 把损坏的数据文件改名隔离，然后用空数据重新启动。文件不会被删除。 */
    async function quarantineAndStartEmpty() {
        rescueBusy.value = true;
        rescueMessage.value = '';
        try {
            const result = await desktop().quarantineData();
            if (!result.ok) {
                rescueMessage.value = result.error || '隔离失败';
                return false;
            }
            rescueMessage.value = '原文件已改名保留，正在以空数据启动。';
            await initialize();
            return true;
        } finally {
            rescueBusy.value = false;
        }
    }

    /** 把原始数据文件原样另存，即使它无法解析。 */
    async function exportRaw() {
        rescueBusy.value = true;
        rescueMessage.value = '';
        try {
            const result = await desktop().exportRaw();
            if (result.canceled) return false;
            rescueMessage.value = result.ok
                ? '原始文件已另存到：' + (result.filePath || '所选位置')
                : result.error || '另存失败';
            return result.ok;
        } finally {
            rescueBusy.value = false;
        }
    }

    /** 从某个备份恢复：读取后走 replaceState，旧文件会自动留一份事务备份。 */
    async function restoreBackup(name: string) {
        rescueBusy.value = true;
        rescueMessage.value = '';
        try {
            const result = await desktop().readBackup(name);
            if (!result.ok || !result.data) {
                rescueMessage.value = result.error || '备份不可读';
                return false;
            }
            if (!domain) {
                rescueMessage.value = '数据尚未就绪，无法恢复';
                return false;
            }
            await domain.replaceState(result.data, 'import');
            data.value = plain(domain.state);
            startupError.value = '';
            rescueMessage.value = '已从备份恢复。';
            return true;
        } catch (error) {
            rescueMessage.value = error instanceof Error ? error.message : String(error);
            return false;
        } finally {
            rescueBusy.value = false;
        }
    }

    async function openDirectory(kind: 'data' | 'logs') {
        const gateway = desktop();
        const target =
            kind === 'logs' ? diagnostics.value?.logsDirectory : diagnostics.value?.dataDirectory;
        if (!target) {
            rescueMessage.value = '尚未取得目录位置';
            return;
        }
        const result = await gateway.openPath(target);
        if (!result.ok) rescueMessage.value = result.error || '无法打开目录';
    }

    function rules(): Domain {
        if (!domain) throw new Error('数据尚未就绪');
        return domain;
    }
    /**
     * 串行执行一次数据修改并发布快照。
     *
     * 返回值可以是 Promise，也可以直接是值：领域里有一批方法只改内存、同步返回
     * （`removeTransaction`、`removeEquipment` 就是），它们通常由调用方用 `commit`
     * 包一层，但 `commit` 之外的同步方法同样可以交给这里，不必再套一层 `async`。
     */
    async function execute<T>(operation: (domain: Domain) => T | Promise<T>): Promise<T> {
        pending.value++;
        try {
            return plain(await operation(rules()));
        } finally {
            // Publish only settled snapshots. Rollback replaces domain.state and is published too.
            // The domain may never have been created when startup failed, so publishing is skipped
            // there instead of throwing out of `finally` and leaving the pending counter stuck.
            if (domain) data.value = plain(domain.state);
            pending.value--;
        }
    }
    return {
        data,
        info,
        loading,
        startupError,
        busy,
        characters,
        toast,
        toastError,
        initialize,
        execute,
        rules,
        notify,
        diagnostics,
        backups,
        rescueBusy,
        rescueMessage,
        loadRescueInfo,
        quarantineAndStartEmpty,
        exportRaw,
        restoreBackup,
        openDirectory,
    };
});
