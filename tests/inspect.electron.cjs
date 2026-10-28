// Manual visual QA session. Uses a temporary profile and synthetic data only.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-v2-visual-'));
app.setPath('appData', directory);
app.commandLine.appendSwitch('remote-debugging-port', '9234');
fs.mkdirSync(path.join(directory, 'mh-tool-v2'), { recursive: true });
const character = (id, name, school, server, skills) => ({
    id,
    name,
    level: 109,
    school,
    server,
    sortOrder: id === 'c1' ? 0 : 1,
    progress: {
        schoolSkills: skills.map((name, index) => ({
            name,
            level: 119 - index * 2,
        })),
        auxiliarySkills: [
            { name: '强身术', level: 120 },
            { name: '神速', level: 30 },
        ],
        training: {
            attack: 17,
            magic: 0,
            defense: 15,
            resistance: 15,
            hunting: null,
        },
        petTraining: { attack: 15, magic: 10, defense: 10, resistance: 10 },
        qianyuanPills: 3,
        potentialFruits: 100,
        note: id === 'c1' ? '慢慢养成，每天进步一点。' : '',
    },
});
fs.writeFileSync(
    path.join(directory, 'mh-tool-v2/data.json'),
    JSON.stringify({
        schemaVersion: 7,
        transactions: [],
        characters: [
            character('c1', '轻舟', '大唐官府', '紫禁城', [
                '为官之道',
                '无双一击',
                '神兵鉴赏',
                '疾风步',
                '十方无敌',
                '紫薇之术',
                '文韬武略',
            ]),
            character('c2', '山月', '普陀山', '紫禁城', [
                '灵性',
                '护法金刚',
                '莲花宝座',
                '五行学说',
                '观音咒',
                '金刚经',
                '五行扭转',
            ]),
        ],
    }),
);
console.log('Visual QA temporary profile:', directory);
require('../src/main/main.cjs');
