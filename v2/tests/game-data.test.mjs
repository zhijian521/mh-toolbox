import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDomain } from '../src/renderer/domain/create-domain.js';
import { schools, defaultSchool } from '../src/renderer/game-data/schools.js';
import { schoolSkillNames } from '../src/renderer/game-data/school-skills.js';
import {
    characterTraining,
    petTraining,
    auxiliarySkillNames,
} from '../src/renderer/game-data/character-progress.js';

test('门派名单与技能模板对应，默认项和各类资料不重复', () => {
    const uniqueNames = (names) => {
        assert.ok(names.length > 0);
        assert.ok(names.every((name) => typeof name === 'string' && name.trim() === name && name));
        assert.equal(new Set(names).size, names.length);
    };
    uniqueNames(schools);
    assert.ok(schools.includes(defaultSchool));
    assert.deepEqual(
        new Set(Object.keys(schoolSkillNames)),
        new Set(schools.filter((school) => school !== '其他')),
    );
    Object.values(schoolSkillNames).forEach(uniqueNames);
    uniqueNames(auxiliarySkillNames);
    for (const fields of [characterTraining, petTraining]) {
        uniqueNames(fields.map((field) => field.key));
        uniqueNames(fields.map((field) => field.label));
    }
});

test('领域实例复制游戏资料，修改实例不污染共享模板或其他实例', () => {
    const first = createDomain();
    const second = createDomain();
    const original = JSON.stringify({
        schools,
        schoolSkillNames,
        characterTraining,
        petTraining,
        auxiliarySkillNames,
    });
    first.schools.push('测试门派');
    first.schoolSkillNames[defaultSchool].push('测试技能');
    first.characterTraining[0].label = '测试人物修炼';
    first.petTraining[0].label = '测试召唤兽修炼';
    first.auxiliarySkillNames.push('测试辅助技能');
    assert.equal(
        JSON.stringify({
            schools,
            schoolSkillNames,
            characterTraining,
            petTraining,
            auxiliarySkillNames,
        }),
        original,
    );
    assert.deepEqual(second.schools, schools);
    assert.deepEqual(second.schoolSkillNames, schoolSkillNames);
    assert.deepEqual(second.characterTraining, characterTraining);
    assert.deepEqual(second.petTraining, petTraining);
    assert.deepEqual(second.auxiliarySkillNames, auxiliarySkillNames);
    const filled = second.fillSchoolSkills(defaultSchool, []);
    filled[0].name = '仅修改草稿';
    assert.equal(second.schoolSkillNames[defaultSchool][0], schoolSkillNames[defaultSchool][0]);
});
