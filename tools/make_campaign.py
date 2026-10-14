#!/usr/bin/env python3
"""Генератор кампании: data/campaign.json.

Баланс как в оригинале: если зачистить всех монстров главы до рубежа, опыта ровно хватает,
чтобы уровень героя сравнялся с уровнем стража рубежа. Проверяется здесь и в tests/campaign.test.js.

Карта главы (столбцы слева направо, все узлы достижимы, боковые ветки можно пропустить):
    start - b1 - b2 - r1 - b4 - b5 (тупик)
                \\ b3 - e1 /   \\ gate
                                b6 (тупик)
"""
import json

CHAPTERS = [
    {'name': 'Пепельные пустоши', 'text': 'Окраины разрушенного мира, где эфир ещё тих. Мелкие твари проверят вашу решимость.',
     'battles': ['m_batt', 'm_drat', 'm_gbbr', 'm_tnsa', 'm_mcwo'],
     'gate': 'm_orgd', 'boss': {'every': 4, 'card': 'ash_rat'}},
    {'name': 'Заросшие колонии', 'text': 'Брошенные поселения, затянутые живой тканью роя. Здесь начинаются настоящие бои.',
     'battles': ['m_prat', 'm_sehl', 'm_brab', 'm_kbgd', 'm_lasn'],
     'gate': 'm_grog', 'boss': {'every': 4, 'card': 'fire_wave'}},
    {'name': 'Затопленные копи', 'text': 'Машины Союза и резонаторы Синклита стерегут потоки эфира.',
     'battles': ['m_mxhp', 'm_wzsp', 'm_myho', 'm_vbat', 'm_ctmn', 'm_trsn'],
     'gate': 'm_orel', 'boss': {'every': 4, 'card': 'flame_priest'}},
    {'name': 'Гнездовья', 'text': 'Логова роя, шагоходов и десанта.',
     'battles': ['m_irmz', 'm_bhwr', 'm_frel', 'm_mlfi', 'm_tiqn'],
     'gate': 'm_bhmo', 'boss': {'every': 4, 'card': 'behd'}},
    {'name': 'Огненный перевал', 'text': 'Горы, где исполины кланов и конструкты стерегут перевалы.',
     'battles': ['m_ogkn', 'm_erel', 'm_wlwd', 'm_lmwd'],
     'gate': 'm_wkhr', 'boss': {'every': 4, 'card': 'mcwo'}},
    {'name': 'Логово левиафанов', 'text': 'Последний рубеж. Левиафаны помнят время до раскола эфира.',
     'battles': ['m_budg', 'm_wlbl', 'm_moti', 'm_rzmn2', 'm_stmz', 'm_kbsh'],
     'gate': 'm_grdg', 'boss': {'every': 4, 'card': 'avsc'}},
]

# Позиции узлов шаблона: (id, столбец, строка), рёбра
SLOTS = [('start', 0, 0), ('b1', 1, 0), ('b2', 2, -1), ('b3', 2, 1), ('r1', 3, -1), ('e1', 3, 1),
         ('b4', 4, 0), ('b5', 5, -1), ('b6', 5, 1), ('gate', 6, 0)]
EDGES = [('start', 'b1'), ('b1', 'b2'), ('b1', 'b3'), ('b2', 'r1'), ('b3', 'e1'), ('r1', 'b4'), ('e1', 'b4'),
         ('b4', 'b5'), ('b4', 'b6'), ('b4', 'gate')]


def level_for(xp, need):
    lv = 1
    while lv < len(need) and xp >= need[lv]:
        lv += 1
    return lv


def main():
    monsters = json.load(open('data/monsters.json', encoding='utf-8'))
    prog = json.load(open('data/progression.json', encoding='utf-8'))
    need, give = prog['expNeeded'], prog['expForMonster']
    xp, chapters = 0, []
    for n, ch in enumerate(CHAPTERS, 1):
        battles = ch['battles']
        assert 4 <= len(battles) <= 6, ch['name']
        order = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'][:len(battles)]
        if len(battles) == 4:
            order = ['b1', 'b2', 'b3', 'b4']
        slot_monster = dict(zip(order, sorted(battles, key=lambda m: monsters[m]['level'])))
        nodes, used = [], set()
        for sid, col, row in SLOTS:
            if sid.startswith('b') and sid not in slot_monster:
                continue
            node = {'id': sid, 'x': round(0.06 + col * 0.147, 3), 'y': round(0.5 + row * 0.3, 3)}
            if sid == 'start':
                node['type'] = 'start'
            elif sid == 'gate':
                node.update(type='gate', monster=ch['gate'],
                            boss=[{'trigger': 'startOfTurn', 'whose': 'owner', 'effect': 'castFree',
                                   'card': ch['boss']['card'], 'every': ch['boss']['every']}])
            elif sid == 'r1':
                node['type'] = 'reward'
            elif sid == 'e1':
                node['type'] = 'event'
            else:
                node.update(type='battle', monster=slot_monster[sid])
            nodes.append(node)
            used.add(sid)
        edges = [[a, b] for a, b in EDGES if a in used and b in used]
        # проверка баланса
        xp += sum(give[monsters[m]['level'] - 1] for m in battles)
        gate_lv = monsters[ch['gate']]['level']
        assert xp == need[gate_lv - 1], '%s: опыт %d, нужно %d для ур. %d' % (ch['name'], xp, need[gate_lv - 1], gate_lv)
        assert level_for(xp, need) == gate_lv
        print('глава %d: опыт к рубежу %d -> уровень %d, страж "%s" ур. %d' % (
            n, xp, level_for(xp, need), monsters[ch['gate']]['name'], gate_lv))
        xp += give[gate_lv - 1]
        chapters.append({'name': ch['name'], 'text': ch['text'], 'nodes': nodes, 'edges': edges})
    with open('data/campaign.json', 'w', encoding='utf-8') as f:
        json.dump({'startLevel': 1, 'chapters': chapters}, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
