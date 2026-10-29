// @ts-check

/**
 * @typedef {object} StorageGateway 存储通道，由 preload 暴露，也是唯一碰磁盘的地方。
 * @property {() => Promise<{ ok: boolean, data?: any, error?: string }>} loadData
 * @property {(data: any, options?: any) => Promise<{ ok: boolean, error?: string }>} saveData
 */

/** @typedef {Partial<Domain> & ThisType<Domain>} StorageMixin */

/**
 * @param {Domain} D
 * @param {unknown} _U
 * @param {StorageGateway} gateway
 * @param {unknown} _localStorage
 */
export default function install(D, _U, gateway, _localStorage) {
    /* 串行提交与持久化，所有领域写入共用失败回滚。 */
    Object.assign(
        D,
        /** @type {StorageMixin} */ ({
            async init() {
                const res = await gateway.loadData();
                if (!res || !res.ok)
                    throw new Error('读取数据失败：' + ((res && res.error) || '未知错误'));
                this.state = this.normalize(res.data || {});
                if (res.data && res.data.schemaVersion !== this.schemaVersion) await this.persist();
            },

            /** @param {any} [options] */
            async persist(options) {
                const res = await gateway.saveData(this.state, options);
                if (!res || !res.ok)
                    throw new Error('保存失败：' + ((res && res.error) || '未知错误'));
                return res;
            },

            /**
             * 串行执行同步领域变更；写入失败恢复完整快照，后续操作读取恢复后的状态。
             * @param {() => any} change
             * @param {any} [options]
             */
            commit(change, options) {
                const run = async () => {
                    const snapshot = JSON.parse(JSON.stringify(this.state));
                    try {
                        const result = change();
                        await this.persist(options);
                        return result;
                    } catch (error) {
                        this.state = snapshot;
                        throw error;
                    }
                };
                const pending = (this._commitQueue || Promise.resolve()).then(run);
                this._commitQueue = pending.catch(() => {});
                return pending;
            },

            /**
             * @param {any} data
             * @param {string} [reason]
             */
            async replaceState(data, reason = 'import') {
                this.validateBackup(data);
                const next = this.normalize(data);
                return this.commit(
                    () => {
                        this.state = next;
                    },
                    { backupReason: reason },
                );
            },
        }),
    );
}
