#!/usr/bin/env python3
"""Короткие английские описания для генератора картинок (пока только Пограничный Союз).

Читает art_inbox/prompts.json (его пишет tools/art_prompts.py) и добавляет поле prompt_en
для карт, лидера и фона Союза. Генераторы лучше понимают английский, а в коротком описании
один сюжет не тонет в перечне всей техники фракции.

Запуск: python3 tools/art_prompts_en.py
"""
import json

STYLE = ('Dark sci-fi collectible card game art, 2D digital painting, painterly stylized shapes, '
         'clear readable silhouette, dramatic rim lighting, not photorealistic, not 3D render. '
         'Single image, no collage, no panels, no text, no letters, no frame, no logo, no watermark.')

UNION = ('Gritty frontier space-western human faction: bulky heavy powered combat armor with oversized shoulder pads, '
         'worn graphite steel, rivets, cables, field repairs, small blue indicator lights, ochre hazard markings. '
         'Palette graphite, dark navy, warm metal.')

BACKDROP = ('Background: frontier mining colony with steel bunkers, watchtowers, searchlights and a dusty plain '
            'under a heavy dusk sky, dark, muted and slightly blurred so it does not compete with the subject.')

LIGHT = 'Purple rim light accents of synthesis energy.'

TRIBE = {
    'golem': 'a bulky colony worker robot with an armored cab, welding manipulator arms and a headlight',
    'worm': 'a tracked mining drill machine with a huge spinning drill head and steam venting from pipes',
    'hopper': 'a trooper in heavy powered combat armor with oversized shoulder pads and an assault rifle, '
              'landing on the battlefield',
    'crawler': 'a fast raider hoverbike with a helmeted rider, dust trail behind',
    'cleaver': 'a two-legged melee combat mech with a pilot cockpit and heavy cleaver arms',
    'lizard': 'a heavy assault walker tank with an overheated open reactor on its back and twin cannons',
    'cutter': 'a convict shock trooper in cybernetic powered armor with plasma cutters instead of hands',
    'fighter': 'a combat medic in heavy powered armor with light plating, medical backpack and a healing beam',
    'wingling': 'a VTOL atmospheric fighter craft with swiveling turbines and missile pods',
    'horror': 'a huge siege tank deployed in siege mode, stabilizer legs dug into the ground, very long cannon',
}

WALL = {
    'wlil': 'a holographic barrier of blue hexagons between two projector posts',
    'phwl': 'a force field stretched between two generator pylons',
    'wldg': 'a row of missile turrets on concrete bases behind steel shields',
    'wldt': 'a distortion field generator, the air around it ripples and warps',
    'wlbl': 'a fortified bunker with firing slits and extending steel blades',
}

# Уточнения отдельных существ поверх породы
CREATURE = {
    'brab': 'small bronze-plated', 'irab': 'iron-plated', 'stab': 'steel-plated, heavily armored',
    'mcwu': 'bigger', 'mcwy': 'heavy',
    'mnhp': 'a young rookie', 'hopr': '', 'mxhp': 'a scarred veteran',
    'smvl': 'light', 'bgvl': 'heavy armored',
    'ctmn': '', 'swmn': 'bigger, with chainsaw arms', 'rzmn': 'with razor blade arms',
    'brmc': 'bronze', 'irmc': 'iron', 'stmc': 'steel, towering',
    'brmz': 'bronze', 'irmz': 'iron', 'stmz': 'massive steel',
    'fmfi': '', 'mlfi': 'a rescue commander with a cape and command antenna',
    'ptrs': '', 'rfpt': 'heavily armored',
    'wkhr': '',
}

KEYWORD = {
    'flying': 'in flight', 'firstStrike': 'striking first in a fast lunge', 'trample': 'smashing through',
    'regen': 'repair sparks closing damage', 'noAttack': 'static defensive stance', 'haste': 'charging in',
    'berserk': 'in a frenzy', 'lifetap': 'draining glowing energy',
}

SCENE = {
    'enfl': 'an enemy soldier frozen in a blue stasis field cast by a disc trap on the ground',
    'scbr': 'a medical pod opening, a wounded trooper waking up inside, blue holographic vitals',
    'wetx': 'a thin stream of green toxic gas leaking from a punctured canister',
    'clfr': 'a trooper in a stealth suit half dissolved into the air, outline shimmering',
    'dels': 'a mech targeting screen full of glitches and static, inverted readouts',
    'drgs': 'a cloud of grey sleeping gas from a grenade spreading over trenches',
    'immb': 'steel harpoon cables pinning the legs of a walker to the ground',
    'irrt': 'a hissing parasite implant on a soldier\'s neck, red interference sparks',
    'ovrl': 'a power armor reactor glowing red hot, steam blasting from vents',
    'qkfx': 'technicians hastily rewiring a captured enemy machine, cables and welding, blue paint over foreign markings',
    'redr': 'an energy shield projected by a soldier intercepts a shot aimed at his commander',
    'slrp': 'a swarm of tiny repair nanobots like sparks welding a breach in armor',
    'twen': 'a combat stimulant injector in a power armor glove, the soldier\'s veins glowing, wild eyes',
    'dism': 'powered armor with its power cut, indicators dark, the soldier collapsing to one knee',
    'dpgs': 'a heavy yellow-grey gas cloud creeping over the field, silhouettes of soldiers in gas masks',
    'dwnd': 'armor metal bubbling and eaten away by acid and rust',
    'fail': 'a jammed rifle, sparks from the breech, red warning lights',
    'paln': 'a neural cable linking a wounded soldier to his commander, a pulse of pain running along it',
    'rbrt': 'a field hospital module tent, a medic with a defibrillator over a trooper on a stretcher',
    'rpst': 'a repair hangar, robotic arms rebuilding a wrecked robot, shower of sparks',
    'sfgs': 'thick green choking gas flooding trenches and bunkers',
    'enrg': 'a power cable from a generator plugged into a mech, blue discharges across the hull',
    'frgs': 'violet hallucinogenic gas, soldier silhouettes distorting and doubling',
    'mdns': 'a soldier with a shattered helmet visor screaming, glitching holograms around',
    'trlb': 'an interceptor antenna dish on a tower pulling streams of holographic data',
    'sttx': 'a ruptured tank of toxic waste, a poisonous cloud rising over the colony',
    'brrl': 'an electromagnetic pulse explosion, a blue sphere of discharges killing power in all machines around',
    'pwtp': 'an energy siphon sucking blue streams out of an enemy reactor',
    'repr': 'a technician with a welding torch repairing a damaged robot, shower of sparks',
    'alst': 'a shock trooper in powered armor leaping on a jump pack, weapon glowing red hot, a last desperate charge',
    'jrrg': 'technicians assembling a combat robot from scrap on a field workbench',
    'recl': 'a holographic tablet with intel, a scanning beam sweeping across a map',
    'tplf': 'a medical drone with tubes of glowing fluid transfusing life energy',
    'bdex': 'a pilot climbing out of a burning mech while a second pilot climbs into a fresh one',
    'enal': 'a generator releasing a wave of blue energy over a squad, soldiers and machines rising back into formation',
    'incr': 'an orbital strike, a pillar of light from the sky hitting an enemy energy reactor',
    'lspc': 'a command center with a holographic map, a scanning wave spreading in a circle',
    'clon': 'a cloning pod, a copy of a soldier forming inside blue liquid',
    'prfy': 'a decontamination sprayer washing glowing infection off armor',
    'exil': 'a teleport platform hurling a target into a flickering rift in space',
    'lqrl': 'troopers seizing an enemy energy reactor and plugging in their own cables',
    'nois': 'a jammer on a radio tower, rings of interference spreading out',
    'mdwp': 'a tactical warhead, a blinding flash and a mushroom cloud over enemy positions on the horizon',
}

LEADER = ('Square 1:1 close-up portrait, head and shoulders: an original frontier colony marshal, weathered stern face '
          'with a scar and stubble, open helmet, heavy powered combat armor with massive shoulder pads, worn graphite '
          'steel, blue indicator lights, ochre markings, smoke and searchlights behind.')

FIELD = ('Wide 16:9 panoramic landscape with no characters: a frontier mining colony on a dusty plain, steel bunkers, '
         'watchtowers, searchlights, cables, a parked dropship, heavy dusk sky. The center of the image is calm and dark '
         '(cards will lie there), details and light are near the edges.')


# Карты глав кампании (фон экрана карты), по порядку глав
MAP = [
    'an ash wasteland: cracked grey earth, fissures glowing red with embers, skeletal ruins of broken towers, ash dunes',
    'an abandoned frontier colony: steel modules and domes overgrown with living purple-green alien biomass, drifting spores',
    'flooded mines: dark water filling open pits, rusty drilling rigs and catwalks, blue crystal resonators glowing underwater',
    'alien hive lairs: organic spires and burrows among wrecked walkers and drop pods, low fog',
    'a fiery mountain pass: rivers of lava between cliffs, colossal stone gates, smoke and drifting ash',
    'the leviathan abyss: a dark chasm with giant fossilized leviathan skeletons, astral rifts glowing violet',
]

MAP_SHOT = ('Wide panoramic landscape seen from above at an angle, like a campaign map, no characters. A faint winding path '
            'runs across the middle, the middle area is dark and calm (map markers will sit there), light and detail near the edges.')


def card(c):
    if c['type'] == 'creature':
        if c.get('race') == 'wall':
            subject = WALL[c['id']] + ', seen in perspective on the battlefield'
        else:
            size = 'huge, filling most of the frame' if c['cost'] >= 7 else ('large' if c['cost'] >= 4 else 'small')
            cues = [KEYWORD[k.split(':')[0]] for k in c.get('keywords', []) if k.split(':')[0] in KEYWORD]
            note = CREATURE.get(c['id'], '').rstrip(',')
            subject = TRIBE[c['race']] + (', ' + note if note else '') + ', ' + size
            if cues:
                subject += ', ' + ', '.join(cues)
            subject += ('. Shot: the creature in action in its environment (running, attacking, flying), not posing; '
                        'head and main silhouette centered')
        fmt = 'Vertical 3:4 portrait format.'
    else:
        subject = SCENE[c['id']]
        if c['type'] == 'sorcery':
            subject += '. Shot: the moment of the effect up close (flash, wave, rupture), at most one figure in the background'
        else:
            subject += '. Shot: an object, aura or glowing symbol large in the center, almost abstract composition'
        fmt = 'Vertical 3:4 portrait format.'
    # Сюжет первым: генератор сильнее всего слушается начала описания
    return ' '.join([subject[0].upper() + subject[1:] + '.', STYLE, UNION, BACKDROP, LIGHT, fmt])


def main():
    cards = {c['id']: c for c in json.load(open('data/cards.json', encoding='utf-8'))}
    items = json.load(open('art_inbox/prompts.json', encoding='utf-8'))
    n = 0
    for x in items:
        fid = x['file'][:-4]
        if fid == 'leader_frontier_union':
            x['prompt_en'] = ' '.join([STYLE, UNION, LEADER, BACKDROP])
        elif fid == 'bg_frontier_union':
            x['prompt_en'] = ' '.join([STYLE.replace('clear readable silhouette, ', ''), UNION, FIELD])
        elif fid.startswith('map_'):
            x['prompt_en'] = ' '.join([MAP[int(fid[4:]) - 1][0].upper() + MAP[int(fid[4:]) - 1][1:] + '.', MAP_SHOT,
                                       STYLE.replace('clear readable silhouette, ', ''), LIGHT])
        elif cards.get(fid, {}).get('faction') == 'frontier_union':
            x['prompt_en'] = card(cards[fid])
        else:
            continue
        n += 1
    with open('art_inbox/prompts.json', 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    print('prompt_en: %d' % n)


if __name__ == '__main__':
    main()
