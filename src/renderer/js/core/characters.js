'use strict';
/* 角色档案与技能养成。 */
Object.assign(D, {
  /* 未记录值与明确填写的 0 分开保存。 */
  characterNumber(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) return null;
    if (!['number', 'string'].includes(typeof value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  },

  normalizeCharacterProgress(value) {
    const data = value && typeof value === 'object' ? value : {};
    const skills = (list) => Array.isArray(list) ? list.filter((skill) => skill && typeof skill.name === 'string' && skill.name.trim())
      .map((skill) => ({ name: skill.name.trim(), level: this.characterNumber(skill.level) })) : [];
    const training = (key, fields) => Object.fromEntries(fields.map((field) =>
      [field.key, this.characterNumber(data[key] && data[key][field.key])]));
    return {
      schoolSkills: skills(data.schoolSkills), auxiliarySkills: skills(data.auxiliarySkills),
      training: training('training', this.characterTraining), petTraining: training('petTraining', this.petTraining),
      qianyuanPills: this.characterNumber(data.qianyuanPills), potentialFruits: this.characterNumber(data.potentialFruits),
      note: typeof data.note === 'string' ? data.note : '',
    };
  },

  orderedCharacters(characters = this.state.characters) {
    return characters.slice().sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) ||
      (this.characterNumber(a.sortOrder) ?? Infinity) - (this.characterNumber(b.sortOrder) ?? Infinity) ||
      (b.createdAt || 0) - (a.createdAt || 0));
  },

  saveCharacterOrder(id, changes) {
    return this.commit(() => {
      const character = this.charById(id);
      if (!character) throw new Error('角色不存在');
      const pinned = changes.pinned === undefined ? character.pinned === true : changes.pinned;
      if (typeof pinned !== 'boolean') throw new Error('置顶状态不正确');
      const group = this.orderedCharacters().filter((item) => item.id !== id && (item.pinned === true) === pinned);
      const position = changes.position === undefined ? 0 : changes.position;
      if (!Number.isInteger(position) || position < 0 || position > group.length) throw new Error('排序位置不正确，请重新选择');
      group.splice(position, 0, character);
      const positions = new Map(group.map((item, index) => [item.id, index]));
      this.state.characters = this.state.characters.map((item) => positions.has(item.id) ?
        Object.assign({}, item, { pinned, sortOrder: positions.get(item.id) }) : item);
    });
  },

  /** 新建和编辑角色只在写入成功后确认；失败恢复角色集合，表单可直接重试。 */
  saveCharacter(data, id) {
    return this.commit(() => this.applyCharacter(data, id));
  },

  applyCharacter(data, id) {
    const previous = id && this.charById(id);
    if (id && !previous) throw new Error('角色不存在');
    const name = String(data.name == null ? previous && previous.name || '' : data.name).trim();
    if (!name) throw new Error('请填写角色昵称');
    const level = data.level === undefined && previous ? previous.level : data.level;
    if (level != null && level !== '' && this.characterNumber(level) === null) throw new Error('角色等级需填写非负整数');
    if (data.progress !== undefined) this.validateCharacterProgress(data.progress);
    const saved = Object.assign({}, previous || { id: U.uid(), createdAt: Date.now(), pinned: false, sortOrder: 0 }, {
      name, level: this.characterNumber(level),
      school: data.school === undefined && previous ? previous.school : data.school || '',
      server: data.server === undefined && previous ? previous.server : String(data.server || '').trim(),
      progress: this.normalizeCharacterProgress(data.progress === undefined && previous ? previous.progress : data.progress),
    });
    if (previous) {
      this.state.characters = this.state.characters.map((character) => character.id === id ? saved : character);
    } else {
      const positions = new Map(this.orderedCharacters().filter((item) => !item.pinned).map((item, index) => [item.id, index + 1]));
      this.state.characters = [...this.state.characters.map((item) => positions.has(item.id) ?
        Object.assign({}, item, { sortOrder: positions.get(item.id) }) : item), saved];
    }
    this.equipmentProfile(saved.id);
    return saved;
  },

  async saveCharacterProgress(id, changes) {
    return this.commit(() => {
      const character = this.charById(id);
      if (!character) throw new Error('角色不存在');
      return this.applyCharacter({ progress: Object.assign({}, this.normalizeCharacterProgress(character.progress), changes) }, id);
    });
  },

  characterCopyChanges(id, sourceId, keys, skipEmpty) {
    const character = this.charById(id), source = this.charById(sourceId);
    if (!character || !source) throw new Error('来源或目标角色不存在');
    if (id === sourceId) throw new Error('请选择其他来源角色');
    if (!keys.length) throw new Error('请选择要复制的项目');
    if (keys.includes('schoolSkills') && (!character.school || source.school !== character.school)) throw new Error('师门技能需选择相同门派的角色');
    const target = this.normalizeCharacterProgress(character.progress);
    const progress = this.normalizeCharacterProgress(source.progress);
    const changes = {};
    for (const key of keys) {
      if (!Object.hasOwn(progress, key)) throw new Error('未知的角色养成项目');
      let value = progress[key];
      if (skipEmpty) {
        if (Array.isArray(value)) {
          if (!value.length) continue;
          const existing = new Map(target[key].map((skill) => [skill.name, skill]));
          const names = new Set(value.map((skill) => skill.name));
          value = [...value.map((skill) => ({ name: skill.name, level: skill.level ?? (existing.get(skill.name)?.level ?? null) })),
            ...target[key].filter((skill) => !names.has(skill.name))];
        } else if (value && typeof value === 'object') {
          value = Object.assign({}, target[key], Object.fromEntries(Object.entries(value).filter(([, number]) => number !== null)));
        } else if (value == null || (typeof value === 'string' && !value.trim())) continue;
      }
      if (JSON.stringify(value) !== JSON.stringify(target[key])) changes[key] = value;
    }
    return changes;
  },

  copyCharacterProgress(id, sourceId, keys, skipEmpty = true) {
    return this.commit(() => {
      const changes = this.characterCopyChanges(id, sourceId, keys, skipEmpty);
      if (!Object.keys(changes).length) throw new Error('所选项目没有可复制的变更');
      return this.applyCharacter({ progress: Object.assign({}, this.normalizeCharacterProgress(this.charById(id).progress), changes) }, id);
    });
  },

  validateCharacterProgress(changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('养成记录格式不正确');
    const progress = this.normalizeCharacterProgress();
    const checkNumber = (value, label) => {
      if (value != null && value !== '' && this.characterNumber(value) === null) throw new Error(label + '需填写非负整数');
    };
    for (const [key, value] of Object.entries(changes)) {
      if (!Object.hasOwn(progress, key)) throw new Error('未知的角色养成项目');
      if (['schoolSkills', 'auxiliarySkills'].includes(key)) {
        if (!Array.isArray(value)) throw new Error('技能记录格式不正确');
        const names = new Set();
        value.forEach((skill) => {
          if (!skill || typeof skill.name !== 'string' || !skill.name.trim()) throw new Error('请填写技能名称');
          const name = skill.name.trim();
          if (names.has(name)) throw new Error('技能名称重复：' + name);
          names.add(name);
          checkNumber(skill.level, name + '等级');
        });
      } else if (key === 'training' || key === 'petTraining') {
        const fields = key === 'training' ? this.characterTraining : this.petTraining;
        if (!value || typeof value !== 'object') throw new Error('修炼记录格式不正确');
        fields.forEach((field) => checkNumber(value[field.key], field.label));
      } else if (key !== 'note') {
        checkNumber(value, key === 'qianyuanPills' ? '乾元丹数量' : '潜能果数量');
      }
    }
  },

  /** 角色删除与全部关联记录一并落盘，失败时整体恢复。 */
  async removeCharacter(id) {
    return this.commit(() => {
      if (!this.charById(id)) throw new Error('角色不存在');
      const equipmentIds = new Set(this.state.equipment.filter((eq) => eq.characterId === id).map((eq) => eq.id));
      this.state.characters = this.state.characters.filter((character) => character.id !== id);
      ['transactions', 'sessions', 'goals', 'equipment'].forEach((key) => {
        this.state[key] = this.state[key].filter((item) => item.characterId !== id);
      });
      this.state.gearLogs = this.state.gearLogs.filter((log) => log.characterId !== id && !equipmentIds.has(log.equipmentId));
      if (this.state.activeSession && this.state.activeSession.characterId === id) this.state.activeSession = null;
    });
  },
});
