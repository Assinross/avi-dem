#!/usr/bin/env python3
"""Короткие английские описания для генератора картинок (Пограничный Союз и Кланы Перелома).

Читает art_inbox/prompts.json (его пишет tools/art_prompts.py) и добавляет поле prompt_en
для карт, лидера и фона Союза и Кланов. Генераторы лучше понимают английский, а в коротком описании
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


# ---------- Кланы Перелома ----------

CLANS = ('Mutant clans of broken worlds: humanoid mutants and mutated beasts, scars, bone plates, crude armor of salvaged '
         'metal and leather, cloth wrappings, green and violet crystal growths in the skin. '
         'Palette dark green, graphite, violet accents.')

# Для заклинаний и чар - без существ, только материалы и палитра
CLANS_LOOK_SPELL = ('Materials of a broken world: salvaged scrap metal, bone, green and violet crystals. '
                    'Palette dark green, graphite, violet accents.')

CLANS_BACKDROP = ('Background: a shattered wasteland of a broken world, cracked ground, slag and machine wreckage, '
                  'green crystal outcrops, ash sky in violet haze, dark, muted and slightly blurred so it does not '
                  'compete with the subject.')

CLANS_LIGHT = 'Red rim light accents of chaos energy.'

CLANS_TRIBE = {
    'rat': 'a mutated rat the size of a dog with bony growths and green crystals sprouting from its fur',
    'goblin': 'a scrawny small mutant scavenger wrapped in cloth strips and plates of salvaged scrap metal',
    'orc': 'a massive humanoid mutant brute with bone plates on the shoulders and crude armor of salvaged metal and leather',
    'bat': 'a winged mutant flyer with leathery membrane wings and crystal growths along its spine',
    'wolf': 'a mutated hound with a bony ridge along its back and glowing eyes',
    'ogre': 'a giant humanoid mutant in crude armor patched together from wrecked machine parts',
    'cyclops': 'a colossal one-eyed mutant giant with green and violet crystals growing out of its shoulders',
}

CLANS_WALL = {
    'ember_wall': 'a rough wall of black slag blocks with embers glowing in the cracks',
    'slwl': 'a wall of jagged flint stones bound together with chains and bones',
    'magma_barrier': 'a barrier of cooling magma with glowing red seams, hovering above the ground',
    'basalt_wall': 'a massive wall of dark basalt columns',
    'wllv': 'a wall of molten lava churning and pouring in the air above the ground',
    'wlif': 'a wall of crackling green-violet plasma stretched between crystal spikes, hovering above the ground',
}

CLANS_CREATURE = {
    'kbgd': 'standing guard with a scrap shield and a lantern', 'sparker': 'holding a crackling spark thrower made of junk, electric arcs',
    'kbwr': 'swinging a crude scrap-metal cleaver', 'kbel': 'an old hunched elder with a staff hung with trophy trinkets',
    'dusk_pup': 'young and lean, half hidden in dusk shadows', 'ghost_wolf': 'semi-translucent ghostly outline, pale glowing eyes',
    'ash_rat': 'covered in grey ash', 'drat': 'pale, digging through a grave of rubble',
    'prat': 'diseased, oozing green, sickly glow', 'dmrt': 'a large scarred rat leader with a crown of crystals, small rats around it',
    'flame_priest': 'a rift shaman in ragged robes with ritual scars, holding a glowing green crystal staff',
    'orgd': 'holding a heavy scrap tower shield', 'orwr': 'swinging two crude axes',
    'orel': 'a chieftain with a horned bone helm and a trophy-hung banner',
    'ash_bat': 'covered in ash', 'bloodwing': 'dark red wings and bloody claws', 'vbat': 'huge, drinking glowing blood',
    'ash_ogre': 'covered in ash and soot', 'ogkn': 'an overlord with a huge hammer and a throne-like back plate',
    'fire_titan': 'towering over ruins, its eye glowing red',
}

CLANS_SCENE = {
    'brot': 'a ritual pyre of bones and scrap erupting into a column of fire',
    'baso': 'thorny crystal spikes wrapped around glowing ghostly wisps rising from the ground',
    'onslaught': 'a jagged scrap-metal spearhead glowing red, motion streaks surging forward',
    'war_cry': 'a bone war horn hung with trophies, red rings of sound bursting from it',
    'tempering': 'a red hot crude armor plate being hammered on an anvil, sparks',
    'mnbn': 'violet ether flames searing a cracked crystal',
    'riot': 'shattered chains around a smouldering red sigil of a broken circle',
    'rnst': 'a rain of falling stones and burning rocks from a dark sky',
    'smok': 'thick black smog creeping over the ground, swallowing everything',
    'flame_fury': 'a vial of glowing green mutagen cracking open, power bursting out in green veins of light',
    'smolder': 'a smouldering bone crumbling into embers and ash',
    'blkd': 'a ring of crude scrap barricades and spiked shields, a fortified camp',
    'burning_orb': 'a floating sphere of fire with orbiting embers',
    'imml': 'a glowing red war mask of bone and crystal, an aura of battle madness',
    'mnbr': 'a light wind of glowing violet ether particles swirling over the wasteland',
    'mnst': 'a violent storm of violet ether, lightning and swirling energy vortices',
    'anhl': 'a blinding white-red explosion wiping out everything, a shockwave ring',
    'asst': 'a wall of ash storm swallowing the battlefield',
    'lightning': 'a red lightning bolt striking down from dark clouds',
    'falling_star': 'a burning piece of orbital debris falling from the sky like a meteor',
    'dsig': 'matter disintegrating into a swirl of dust and red glowing particles',
    'mnvr': 'a whirlwind vortex of violet ether energy spinning upward',
    'plmr': 'a cocoon of green light cracking open, a new flame of life rising from ashes',
    'wnfl': 'a searing wind of fire sweeping across the ash sky in long curved streaks of flame, scattering burning feathers and embers',
    'spark': 'a single bright red spark flying through the dark',
    'ctst': 'a cataclysm: the ground cracking, fire bursting from fissures, ruins collapsing',
    'erqa': 'an earthquake splitting the ground, rocks heaving up',
    'flic': 'a long whip-like lash of flame striking down from above onto a glowing magic sigil circle carved in the ground, the sigil burning and cracking apart',
    'fire_wave': 'a low wave of fire rolling across the ground',
    'geys': 'a geyser of glowing violet ether erupting from a crack in the ground',
    'thunderstorm': 'a thunderstorm, many red lightning bolts hitting the ground',
    'tremor': 'concentric rings of red shockwaves rippling outward across cracked stone ground, rocks and dust jumping up, cracks spreading in a radial pattern from the center',
    'whas': 'a whirlwind of ash tearing apart a glowing magic sigil',
    'brgr': 'a wasteland graveyard: rows of earth grave mounds with crude rusted scrap-metal grave markers, flames bursting up from the opened graves, skulls and bones burning on the ground',
    'cnbl': 'a small chalice carved from an old bleached skull and rib bones standing on a stone, glowing green streams of life essence spiraling down from the air and being drained into the cup',
    'snov': 'a blinding supernova burst, a star of fire exploding',
    'etch': 'two crystal shards linked by a resonating violet energy beam, waves of pain echoing between them',
    'frst': 'a firestorm, swirling pillars of flame',
    'rift': 'a jagged rift tearing open in reality, red light pouring from the crack',
    'volc': 'an erupting volcano, rivers of lava and glowing ether',
}

CLANS_LEADER = ('Square 1:1 close-up portrait, head and shoulders: an original humanoid mutant warlord, asymmetric features, '
                'rough dark armor of salvaged metal and bone plates, a staff topped with a green crystal, a few violet '
                'mineral growths on the skin, stern but intelligent face, wasteland and ash haze behind.')

CLANS_FIELD = ('Wide 16:9 panoramic landscape with no characters: a shattered wasteland of a broken world, cracked ground, '
               'slag and machine wreckage, green crystal outcrops, ash sky in violet haze. The center of the image is calm '
               'and dark (cards will lie there), details and light are near the edges.')

# ---------- Астральный Синклит ----------
# Имена юнитов - протоссы StarCraft (решение пользователя), облик описан своими словами

SYNKLIT = ('Ancient psionic alien civilization: tall slender symmetrical beings without mouths, glowing eyes, elegant '
           'light armor of white alloy and ceramic with thin gold lines, blue energy blades and shields, floating '
           'crystals. Palette silver-white, gold, deep navy blue, cyan glow.')

SYNKLIT_LOOK_SPELL = ('Materials of an ancient psionic civilization: white alloy, gold inlays, floating blue crystals '
                      'and geometric glyphs. Palette silver-white, gold, deep navy blue, cyan glow.')

# Для машин и кораблей - без фигур существ, иначе генератор дорисовывает их в кадр
SYNKLIT_LOOK_MACHINE = ('Technology of an ancient psionic alien civilization: white alloy and ceramic with thin gold lines, '
                        'blue energy shields, floating crystals. Palette silver-white, gold, deep navy blue, cyan glow.')

SYNKLIT_BACKDROP = ('Background: an astral sanctuary of floating pale platforms and crystals, geometric golden arches, '
                    'dark blue starry sky with a nebula, dark, muted and slightly blurred so it does not compete with '
                    'the subject.')

SYNKLIT_LIGHT = 'Blue rim light accents of movement energy.'

SYNKLIT_TRIBE = {
    'spirit': 'a tall slender alien psionic warrior with no mouth and glowing blue eyes, elegant white and gold armor',
    'octopus': 'a shadowy cloaked alien warrior, half translucent, dark violet armor, faint glowing eyes',
    'jelly': 'a hovering alien psionic machine of white-gold alloy with a glowing blue crystal core',
    'birdfolk': 'a sleek alien starfighter of curved gold and white hull plates with glowing blue energy vanes, no pilot visible',
    'elemental': 'an alien combat machine of gold and white alloy with glowing blue crystal joints, clearly a machine, no organic parts',
    'ray': 'a war machine walker: a rounded armored golden and white shell with a glowing blue energy core window in front, carried on four thin straight mechanical legs, clearly a machine, no head, no face, no organic parts',
    'dragon': 'a colossal alien capital starship with a curved golden hull and glowing blue crystals',
}

SYNKLIT_WALL = {
    'wlar': 'a translucent glowing blue force field made of hexagonal energy cells, a curved barrier wall hovering above the ground and blocking the way',
    'wlbz': 'a tall glowing blue crystal pylon held in a golden frame, floating above a stone pedestal and radiating a wide shimmering blue energy field around it',
    'wlwd': 'a defensive cannon tower with a wide golden and white base and a large glowing blue energy orb floating above it inside golden prongs, charging and firing a bright blue photon bolt',
    'wlfc': 'a massive golden and white alien nexus temple structure with curved walls and arches, a huge glowing blue crystal hovering at its heart, energy rings around it',
}

# "=" в начале - описание целиком вместо породы
SYNKLIT_CREATURE = {
    'gbbr': '=a lithe alien psionic warrior with no mouth and glowing eyes, light dark-violet and gold armor, throwing a glowing crescent glaive, while a translucent glowing shade copy of itself runs ahead of it',
    'gbin': 'crouching and firing a glowing blue energy bolt from a cannon mounted on its forearm',
    'gbgn': 'hooded, wielding a single long curved blade of violet energy from its wrist, striking from the shadows',
    'rvhl': '=a small hovering alien worker drone of white-gold alloy with a glowing blue crystal core and thin mechanical arms, gathering glowing blue ether crystals from the ground with an energy beam, clearly a machine, no face',
    'sehl': '=a slender crescent-shaped alien flying craft of white-gold alloy with long thin curved wings and a glowing blue crystal core, firing a thin bright blue beam down at the ground, clearly a machine, no pilot',
    'swhl': '=a large hovering alien energy machine of white-gold alloy shaped like an inverted crystal spire with a big glowing blue crystal core, several arcing energy tendrils of light reaching out and draining glowing ether from crystals around it, clearly a machine, no face',
    'avsc': 'a light scout fighter with two forward-swept prongs',
    'avas': 'with long swept-back wings like a bird of prey, diving at high speed, its tail half fading into shimmering light',
    'avmk': 'with a round central body and two curved blade wings, firing a stream of small blue energy bolts forward',
    'avel': '=a huge golden and white alien carrier starship with a long curved hull and glowing blue energy core, launching a swarm of many tiny fighter drones from its open hangar bays, the small fighters streaming out around it',
    'shsp': 'heavy armor, glowing energy gauntlets, raising a fist and leading a line of warriors into battle behind him',
    'wrsp': 'charging with twin glowing blue psionic blades extending from the wrists',
    'clsp': 'in long flowing white and gold robes over light armor, hovering above the ground, crackling blue psionic lightning between its raised hands',
    'wzsp': '=a towering being of pure blue-white psionic energy shaped like a glowing humanoid flame, a crackling electric aura and swirling lightning around it, a bright core of light in its chest, floating above the ground',
    'erel': 'a heavy four-legged walker with twin cannons and a hexagonal blue barrier shield',
    'frel': '=a long segmented heavy alien siege machine of gold and white alloy crawling on many small legs, launching small glowing explosive drones from a hatch on its back, clearly a machine, no head, no face, no organic parts',
    'arel': '=a spindly four-legged alien walker of gold and white alloy with long thin legs and a small armored body, blinking forward in a flash of blue light, leaving a fading afterimage behind, firing energy, clearly a machine, no head, no face, no organic parts',
    'wtel': '=a floating spherical alien robot of gold and white alloy hovering above the ground, charging a large crackling violet energy orb in front of it, clearly a machine, no head, no face, no organic parts',
    'lmwa': 'a plasma cannon under the shell firing a glowing blue plasma ball',
    'lmmn': 'with a protective golden energy halo, guarding',
    'lmwd': 'with a golden crest and banners of light, commanding',
    'lmwk': 'with a glowing crystal eye and floating psionic glyphs around it',
    'bldg': 'with two long prongs in front, hovering above the battlefield and casting down a shimmering blue stasis field that freezes the ground and rocks below in blue crystal',
    'budg': '=a colossal alien warship with a long thin crescent-shaped golden hull and a glowing blue crystal at the center of the crescent, firing a huge crackling sphere of blue energy far into the sky',
    'grdg': '=a large disc-shaped alien warship of golden and white alloy with a big glowing violet prism crystal at its front, focusing a searing violet prismatic beam down onto a target',
    'rddg': '=an enormous round alien mothership of gold and white alloy, a massive disc with rings of glowing blue lights and a huge crystal at its center, a swirling vortex of dark energy beneath it pulling debris upward',
}

SYNKLIT_SCENE = {
    'hoam': 'a translucent golden dome of slowed time over the ground, frozen dust and clock-like rings of light',
    'lsds': 'a large translucent blue dome shield projected from a small golden emitter',
    'scsk': 'plates of blue crystal scales forming over a golden armor plate',
    'shfr': 'a hexagonal blue energy shield glowing brightly, recharging from a small golden battery pylon beside it with a beam of blue light',
    'spwr': 'a golden crystal pulsing with fast spinning rings of blue light, time accelerating around it',
    'tgsk': 'a golden armored gauntlet wrapped in a thin shimmering layer of blue plasma energy, a faint bubble of plasma shield around it',
    'wtlk': 'many glowing psionic cords of blue light converging from all sides and intertwining into one bright knot of light above a golden crystal, a symbol of a shared mind',
    'ailk': 'a stream of cyan life energy flowing into a golden crystal vessel',
    'cnar': 'a glowing web of violet energy strands stretched across the sky between floating golden crystal anchors, crackling and trapping falling debris',
    'copl': 'a golden crystal obelisk with glowing circuit lines of cyan light running over its surface and down into a ring of shield emitters on the ground, a pulse of energy flowing through the circuit',
    'flod': 'a blue beam of gravity shining down from above and lifting rocks and debris off the ground into the air, everything floating weightless in the beam',
    'sght': 'a narrow white-gold purifying beam burning through a glowing glyph circle',
    'shsk': 'a heavy golden armored carapace plate with blue glowing lines, covered by a thick hexagonal blue energy barrier, a projectile bursting harmlessly against it',
    'stat': 'a golden armored gauntlet with a short energy blade striking forward with a burst of blue energy, glowing upgrade glyphs floating around it',
    'stsi': 'a large sphere of blue stasis energy hanging in the air, inside it rocks, crystals and sparks frozen motionless in midair, faint geometric glyphs on its surface',
    'mght': 'a glowing golden psionic crest emblem radiating power, waves of blue psionic energy surging outward from it, floating above an altar',
    'psbr': 'a long curved blade of glowing violet-blue psionic energy extending from a golden gauntlet, the air around the blade bending and warping',
    'sptr': 'a dim golden crystal pylon flickering out of power on a pedestal, its blue glow fading, ether sparks dying around it, cracks of strain in the crystal',
    'erbn': 'a small glowing golden ward device on the ground releasing a blue stasis trap of crystal chains that lock together in a ring around it',
    'chcm': 'a golden crown of light floating in the air, glowing psionic strings of control descending from it like puppet strings into the dark',
    'awak': 'a glowing all-seeing eye glyph of golden light opening in the sky and casting a wide cone of revealing light down that uncovers hidden glowing runes on the ground',
    'bann': 'a glowing blue memory crystal cracking apart under waves of psionic static interference, glowing fragments and distorted glitchy light drifting away',
    'enfr': 'several round blue warp portals of light flashing open on the ground in a row, beams of light rising from each, matter beginning to materialize inside them as glowing silhouettes of crystal',
    'lsus': 'a small glowing crystal dissolving into streams of blue light particles that are pulled back up into a small swirling recall vortex above it',
    'unsm': 'a tall pillar of blue recall light beaming up into the sky from a glowing circle on the ground, matter dissolving into particles and drifting upward inside it',
    'blnc': 'a golden alien gas extractor building built over a glowing green gas geyser vent, the structure with curved golden plates and blue crystal nodes, green gas being drawn up into it',
    'clnp': 'a small glowing violet glyph circle in the air breaking apart into sharp shards, dispersed by a ripple of blue psionic energy',
    'curs': 'a swirling dark violet maelstrom vortex of psionic energy spinning in the sky, sucking in glowing fragments and crystals',
    'decn': 'an expanding nova ring of white-gold purifying light bursting outward from a bright center, shattering many floating glowing glyph circles into fragments',
    'fogg': 'a wide shimmering dome of slowed time spreading over the battlefield, inside it sparks, dust and energy bolts frozen and slowed to a halt, faint golden clock-like rings on its surface',
    'fury': 'a blazing golden psionic flare of righteous fury bursting from a cracked blue crystal, golden fire and blue lightning erupting outward in a furious burst',
    'grun': 'a huge wave of blue recall light sweeping across the whole battlefield, everything in its path dissolving into countless rising blue particles pulled up into the sky',
    'icst': 'an expanding ring of blue stasis energy spreading low across the ground from a glowing center, freezing the air and debris into blue crystal as it passes',
    'mdbl': 'a psionic explosion bursting from a glowing crystal core, rings of blue energy',
    'amns': 'a crystal shattering into blank fading fragments in a void',
    'frwn': 'a stream of glowing golden glyphs flowing from an ancient floating archive crystal',
    'mals': 'dark whispering violet smoke coiling around a cracked golden tablet',
    'fdbk': 'a blue psionic shield reflecting a pulse of energy back to its source',
    'hung': 'blue psionic lightning recoiling from a cracked crystal back into itself',
    'just': 'a large golden gate arch with a shimmering blue warp field inside',
    'rvhg': 'a psionic storm of blue lightning raining down over the battlefield',
    'crhg': 'searing golden beams of light lancing down from the sky in parallel lines',
}

SYNKLIT_LEADER = ('Square 1:1 close-up portrait, head and shoulders: an original ancient alien hierarch with no mouth, '
                  'elongated head with long tendrils hanging behind, glowing blue eyes, ornate white and gold ceremonial '
                  'armor with a blue crystal on the chest, a star sanctuary behind.')

SYNKLIT_FIELD = ('Wide 16:9 panoramic landscape with no characters: an astral sanctuary of floating pale platforms and '
                 'crystals, geometric golden arches, dark blue starry sky with a nebula. The center of the image is calm '
                 'and dark (cards will lie there), details and light are near the edges.')

# Набор описаний фракции: стиль, фон, свет, породы, стены, уточнения существ, сюжеты заклинаний
PACKS = {
    'frontier_union': dict(look=UNION, backdrop=BACKDROP, light=LIGHT, tribe=TRIBE, wall=WALL, creature=CREATURE, scene=SCENE),
    'fracture_clans': dict(look=CLANS, look_spell=CLANS_LOOK_SPELL, backdrop=CLANS_BACKDROP, light=CLANS_LIGHT, tribe=CLANS_TRIBE, wall=CLANS_WALL,
                           creature=CLANS_CREATURE, scene=CLANS_SCENE),
    'astral_synklit': dict(look=SYNKLIT, look_spell=SYNKLIT_LOOK_SPELL, backdrop=SYNKLIT_BACKDROP, light=SYNKLIT_LIGHT,
                           tribe=SYNKLIT_TRIBE, wall=SYNKLIT_WALL, creature=SYNKLIT_CREATURE, scene=SYNKLIT_SCENE,
                           look_machine=SYNKLIT_LOOK_MACHINE, machines=('ray', 'elemental', 'jelly', 'birdfolk', 'dragon', 'wall')),
}

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


def card(c, pk):
    if c['type'] == 'creature':
        if c.get('race') == 'wall':
            subject = pk['wall'][c['id']] + ', seen in perspective on the battlefield'
        else:
            size = 'huge, filling most of the frame' if c['cost'] >= 7 else ('large' if c['cost'] >= 4 else 'small')
            cues = [KEYWORD[k.split(':')[0]] for k in c.get('keywords', []) if k.split(':')[0] in KEYWORD]
            note = pk['creature'].get(c['id'], '').rstrip(',')
            if note.startswith('='):
                subject = note[1:] + ', ' + size
            else:
                subject = pk['tribe'][c['race']] + (', ' + note if note else '') + ', ' + size
            if cues:
                subject += ', ' + ', '.join(cues)
            subject += ('. Shot: the creature in action in its environment (running, attacking, flying), not posing; '
                        'head and main silhouette centered')
        fmt = 'Vertical 3:4 portrait format.'
    else:
        subject = pk['scene'][c['id']]
        if c['type'] == 'sorcery':
            subject += '. Shot: the effect itself up close as a striking image or symbol (flash, wave, rupture), no creatures, no characters, no people, no monsters'
        else:
            subject += '. Shot: an object, aura or glowing symbol large in the center, almost abstract composition, no creatures, no characters, no people, no monsters'
        fmt = 'Vertical 3:4 portrait format.'
    # Сюжет первым: генератор сильнее всего слушается начала описания
    look = pk['look'] if c['type'] == 'creature' else pk.get('look_spell', pk['look'])
    if c.get('race') in pk.get('machines', ()):
        look = pk['look_machine']
    return ' '.join([subject[0].upper() + subject[1:] + '.', STYLE, look, pk['backdrop'], pk['light'], fmt])


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
        elif fid == 'leader_fracture_clans':
            x['prompt_en'] = ' '.join([STYLE, CLANS, CLANS_LEADER, CLANS_BACKDROP])
        elif fid == 'bg_fracture_clans':
            x['prompt_en'] = ' '.join([STYLE.replace('clear readable silhouette, ', ''), CLANS, CLANS_FIELD])
        elif fid == 'leader_astral_synklit':
            x['prompt_en'] = ' '.join([STYLE, SYNKLIT, SYNKLIT_LEADER, SYNKLIT_BACKDROP])
        elif fid == 'bg_astral_synklit':
            x['prompt_en'] = ' '.join([STYLE.replace('clear readable silhouette, ', ''), SYNKLIT, SYNKLIT_FIELD])
        elif cards.get(fid, {}).get('faction') in PACKS:
            x['prompt_en'] = card(cards[fid], PACKS[cards[fid]['faction']])
        else:
            continue
        n += 1
    with open('art_inbox/prompts.json', 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    print('prompt_en: %d' % n)


if __name__ == '__main__':
    main()
