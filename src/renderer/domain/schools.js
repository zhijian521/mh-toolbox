// @ts-check
import { schoolSkillNames } from '../game-data/school-skills.js';

// Migrated from the immutable v1 baseline; see migration/baseline.json.

/** @typedef {Partial<Domain> & ThisType<Domain>} SchoolsMixin */

/**
 * @param {Domain} D
 * @param {unknown} _U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, _U, _gateway, _localStorage) {
    /* 门派资料静态快照，原始来源说明见 migration/initial-baseline/docs/SCHOOL_TEMPLATES.md。 */
    D.schoolSkillNames = structuredClone(schoolSkillNames);

    /**
     * @this {Domain}
     * @param {string} school
     * @param {SkillEntry[]} skills
     * @returns {SkillEntry[]}
     */
    D.fillSchoolSkills = function (school, skills) {
        const existing = this.normalizeCharacterProgress({ schoolSkills: skills }).schoolSkills;
        const names = new Set(existing.map((skill) => skill.name));
        return [
            ...existing,
            ...(this.schoolSkillNames[school] || [])
                .filter((name) => !names.has(name))
                .map((name) => ({ name, level: null })),
        ];
    };
}
