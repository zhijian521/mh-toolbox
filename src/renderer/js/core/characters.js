'use strict';
/* 角色档案与技能养成。 */
Object.assign(D, {
  /* 养成是版本 4 的可选字段，旧档案中的空值与已录入的 0 分开保存。 */
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
    const saved = Object.assign({}, previous || { id: U.uid(), createdAt: Date.now() }, {
      name, level: this.characterNumber(level),
      school: data.school === undefined && previous ? previous.school : data.school || '',
      server: data.server === undefined && previous ? previous.server : String(data.server || '').trim(),
      progress: this.normalizeCharacterProgress(data.progress === undefined && previous ? previous.progress : data.progress),
    });
    const snapshot = this.state.characters;
    this.state.characters = previous ? snapshot.map((character) => character.id === id ? saved : character) : [...snapshot, saved];
    this.equipmentProfile(saved.id);
    return saved;
  },

  async saveCharacterProgress(id, changes) {
    return this.commit(() => {
      const character = this.charById(id);
      if (!character) throw new Error('角色不存在');
      const progress = this.normalizeCharacterProgress(character.progress);
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
        progress[key] = value;
      }
      return this.applyCharacter({ progress }, id);
    });
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
