import { schoolSkillNames } from '../game-data/school-skills.js';

// Migrated from the immutable v1 baseline; see migration/baseline.json.
export default function install(D, U, gateway, localStorage) {
    /* 门派资料静态快照，原始来源说明见 migration/baseline/docs/SCHOOL_TEMPLATES.md。 */
    D.schoolSkillNames = structuredClone(schoolSkillNames);

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
