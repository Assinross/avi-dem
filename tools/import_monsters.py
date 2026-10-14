#!/usr/bin/env python3
"""Импорт монстров (5 уровней сложности), рас со стартовыми колодами и таблиц опыта.

Пишет data/monsters.json, data/races.json, data/progression.json. Нужна extracted/ и data/cards.json.
Числа - из оригинала, названия - свои (по имени карты-аватара или из NAMES ниже).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from names_factions import FACTIONS  # noqa: E402

COLOR = {'Red': 'chaos', 'Green': 'life', 'Blue': 'movement', 'Black': 'synthesis', 'White': 'white'}

# Свои названия там, где имя карты-аватара не подходит (логова, повторы)
# Свои названия там, где имя карты-аватара не подходит (логова, повторы): (код аватара, уровень) -> имя
NAMES = {
    ('BEWR', 1): 'Малый выводок', ('BEWK', 3): 'Выводок жалоносцев', ('BEQN', 6): 'Гнездо жалоносцев',
    ('MOBE', 9): 'Великое гнездо жалоносцев', ('TIWR', 2): 'Выводок клещей', ('TIWK', 4): 'Гнездо клещей',
    ('TIQN', 8): 'Клещевник', ('MOTI', 10): 'Великое гнездо клещей', ('FREL', 7): 'Дух пламени',
    ('RZMN', 7): 'Киборг-зверь', ('NWLF', 4): 'Вожак гончих', ('SHWL', 6): 'Древняя гончая',
    ('WLLV', 8): 'Огненный вал', ('RKWL', 9): 'Каменный вал', ('MAHO', 1): 'Молодой буравчик',
    ('MYHO', 5): 'Старый буравчик', ('OGKN', 7): 'Вождь исполинов',
}

SKILLS = {'HEAL', 'REGN', 'CONC'}

STARTER = {'chaos': 'STR1', 'life': 'STG1', 'movement': 'STU1', 'synthesis': 'STB1'}
def as_list(v):
    return v if isinstance(v, list) else ([v] if v else [])


def parse_counted(items):
    out = []
    for x in as_list(items):
        code, _, n = x.partition('(')
        n = n.split(')')[0].split(':')[0]
        out.append((code, int(n) if n.isdigit() else 1))
    return out


def main():
    cards = json.load(open('data/cards.json', encoding='utf-8'))
    by_code = {c['code']: c for c in cards}
    ok = {c['code'] for c in cards if c.get('impl', True)}
    monsters_raw = json.load(open('extracted/json/Monsters.json'))
    decks_raw = json.load(open('extracted/json/CombatDecks.json'))
    hs = json.load(open('extracted/json/HeroesStats.json'))

    groups = {}
    for m in monsters_raw.values():
        if m['Name'].endswith(' D'):
            continue
        groups.setdefault(m['Name'], {})[m['DifficultyLevel']] = m

    monsters = {}
    for name, variants in sorted(groups.items(), key=lambda kv: (kv[1][0]['Level'], kv[0])):
        base = variants[0]
        avatar = by_code.get(base['Creature'])
        mid = 'm_' + base['Creature'].lower()
        while mid in monsters:
            mid += '2'
        out = []
        for d in range(5):
            v = variants.get(d, base)
            deck = []
            for code, n in parse_counted(v['Deck']):
                if code in ok:
                    deck += [by_code[code]['id']] * n
            skills = {}
            for code, n in parse_counted(v.get('Skills')):
                if code in SKILLS:
                    skills[code] = skills.get(code, 0) + n
            out.append({'hp': v['Health'], 'deck': deck, 'skills': skills})
        monsters[mid] = {
            'name': NAMES.get((base['Creature'], base['Level']), avatar['name'] if avatar else mid),
            'element': COLOR[base['Color']],
            'level': base['Level'],
            'avatar': avatar['id'] if avatar else None,
            'variants': out,
        }
    with open('data/monsters.json', 'w', encoding='utf-8') as f:
        f.write('{\n' + ',\n'.join('  ' + json.dumps(k) + ': ' + json.dumps(v, ensure_ascii=False)
                                   for k, v in monsters.items()) + '\n}\n')

    races = {}
    for el, deck_code in STARTER.items():
        deck = []
        # в колодах (a:b) - диапазон уровней, а не число копий: каждая запись - одна карта
        for x in as_list(decks_raw[deck_code]['Spells']):
            deck.append(by_code[x.split('(')[0]]['id'])
        f = FACTIONS[el]
        races[el] = {'name': f['name'], 'hero': f['leader'], 'text': f['text'], 'faction': f['id'],
                     'element': el, 'starter': deck}
    with open('data/races.json', 'w', encoding='utf-8') as f:
        json.dump(races, f, ensure_ascii=False, indent=2)

    prog = {
        '_comment': 'Опыт до уровня N (индекс 0 = уровень 1) и опыт за победу над монстром уровня N.',
        'expNeeded': [hs['ExpNeeded']['Level%d' % i] for i in range(1, 21)],
        'expForMonster': [hs['ExpForNPC']['Level%d' % i] for i in range(1, 21)],
        'deckMin': 10, 'deckMax': 20, 'maxCopies': 4,
    }
    with open('data/progression.json', 'w', encoding='utf-8') as f:
        json.dump(prog, f, ensure_ascii=False, indent=2)
    print('монстров: %d, рас: %d' % (len(monsters), len(races)))


if __name__ == '__main__':
    main()
