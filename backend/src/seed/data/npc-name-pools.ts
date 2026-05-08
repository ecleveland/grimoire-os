// Curated first-name and family-name pools keyed by (race, gender, kind).
// Many entries are drawn from the D&D 5e SRD v5.0 sample-name tables,
// licensed under CC-BY-4.0. Where SRD 5.0 did not provide a name list for a
// species (Goliath in particular), entries are originally curated.
// https://dnd.wizards.com/resources/systems-reference-document

export const NPC_NAME_KINDS = ['first', 'family', 'epithet'] as const;
export type NpcNameKind = (typeof NPC_NAME_KINDS)[number];

export type NpcNamePoolEntry = {
  race: string;
  gender: string | null; // null for non-gendered (family / epithet)
  kind: NpcNameKind;
  value: string;
};

type RaceNames = {
  male: string[];
  female: string[];
  family: string[];
  epithet?: string[];
};

const namesByRace: Record<string, RaceNames> = {
  Dwarf: {
    male: [
      'Adrik', 'Alberich', 'Baern', 'Barendd', 'Beloril', 'Brottor', 'Bruenor',
      'Dain', 'Darrak', 'Delg', 'Eberk', 'Einkil', 'Fargrim', 'Flint', 'Gardain',
      'Harbek', 'Kildrak', 'Morgran', 'Orsik', 'Oskar', 'Rangrim', 'Rurik',
      'Taklinn', 'Thoradin', 'Thorin', 'Tordek', 'Traubon', 'Travok', 'Ulfgar',
      'Veit', 'Vondal', 'Borin', 'Halgar',
    ],
    female: [
      'Amber', 'Artin', 'Audhild', 'Bardryn', 'Dagnal', 'Diesa', 'Eldeth',
      'Falkrunn', 'Finellen', 'Gunnloda', 'Gurdis', 'Helja', 'Hlin', 'Ilde',
      'Jarana', 'Kathra', 'Kristryd', 'Ilde', 'Liftrasa', 'Mardred', 'Riswynn',
      'Sannl', 'Therlin', 'Thodris', 'Torgga', 'Vistra', 'Tordek', 'Ovina',
      'Bryjana', 'Halgrethe', 'Audra', 'Brunhilda',
    ],
    family: [
      'Balderk', 'Battlehammer', 'Brawnanvil', 'Dankil', 'Fireforge', 'Frostbeard',
      'Gorunn', 'Holderhek', 'Ironfist', 'Loderr', 'Lutgehr', 'Rumnaheim',
      'Strakeln', 'Torunn', 'Ungart',
    ],
  },
  Elf: {
    male: [
      'Adran', 'Aelar', 'Aramil', 'Arannis', 'Aust', 'Beiro', 'Berrian', 'Carric',
      'Enialis', 'Erdan', 'Erevan', 'Galinndan', 'Hadarai', 'Heian', 'Himo',
      'Immeral', 'Ivellios', 'Korfel', 'Laucian', 'Lucan', 'Mindartis', 'Naal',
      'Nutae', 'Paelias', 'Peren', 'Quarion', 'Riardon', 'Rolen', 'Soveliss',
      'Suhnae', 'Thamior', 'Tharivol', 'Theren', 'Theriatis', 'Thervan',
      'Uthemar', 'Vanuath', 'Varis',
    ],
    female: [
      'Adrie', 'Ahvain', 'Aramil', 'Arara', 'Baelitae', 'Bethrynna', 'Birel',
      'Caelynn', 'Chaedi', 'Claira', 'Dara', 'Drusilia', 'Elama', 'Enna', 'Faral',
      'Felosial', 'Hatae', 'Ielenia', 'Ilanis', 'Irann', 'Keyleth', 'Leshanna',
      'Lia', 'Maiathah', 'Malquis', 'Meriele', 'Mialee', 'Myathethil', 'Naivara',
      'Quelenna', 'Quillathe', 'Ridaro', 'Sariel', 'Shanairra', 'Shava',
      'Silaqui', 'Sumnes', 'Theirastra', 'Thiala',
    ],
    family: [
      'Amakiir', 'Amastacia', 'Galanodel', 'Holimion', 'Ilphelkiir', 'Liadon',
      'Meliamne', 'Naïlo', 'Siannodel', 'Suithrasas', 'Xiloscient',
      'Aloro', 'Caerdonel', 'Erladras', 'Iathrana',
    ],
  },
  Halfling: {
    male: [
      'Alton', 'Ander', 'Bernie', 'Bobbin', 'Cade', 'Callus', 'Corrin', 'Dannad',
      'Danniel', 'Eddie', 'Egart', 'Eldon', 'Errich', 'Finnan', 'Garret', 'Gerard',
      'Lazam', 'Lindal', 'Lyle', 'Merric', 'Mican', 'Milo', 'Morrin', 'Nebin',
      'Nevil', 'Osborn', 'Ostran', 'Oswalt', 'Perrin', 'Poppy', 'Reed', 'Roscoe',
      'Sam', 'Shardon', 'Tye', 'Wellby', 'Wendel', 'Wilbur',
    ],
    female: [
      'Andry', 'Anne', 'Bella', 'Blossom', 'Bree', 'Callie', 'Chenna', 'Cora',
      'Cymbre', 'Euphemia', 'Jillian', 'Jasmine', 'Kithri', 'Lavinia', 'Lidda',
      'Maegan', 'Marigold', 'Merla', 'Myria', 'Nedda', 'Nikki', 'Nora', 'Olivia',
      'Paela', 'Pearl', 'Pennie', 'Philomena', 'Portia', 'Rosie', 'Saral',
      'Seraphina', 'Shaena', 'Stacee', 'Sutty', 'Thea', 'Trym', 'Tyna', 'Vani',
      'Verna', 'Wella', 'Willow',
    ],
    family: [
      'Brushgather', 'Goodbarrel', 'Greenbottle', 'High-hill', 'Hilltopple',
      'Leagallow', 'Tealeaf', 'Thorngage', 'Tosscobble', 'Underbough',
      'Beren', 'Tealeaf', 'Pickleback',
    ],
  },
  Human: {
    male: [
      'Aseir', 'Bardeid', 'Haseid', 'Khemed', 'Mehmen', 'Sudeiman', 'Zasheir',
      'Darvin', 'Dorn', 'Evendur', 'Gorstag', 'Grim', 'Helm', 'Malark', 'Morn',
      'Randal', 'Stedd', 'Bor', 'Fodel', 'Glar', 'Grigor', 'Igan', 'Ivor',
      'Kosef', 'Mival', 'Orel', 'Pavel', 'Sergor', 'Bardeid', 'Anton',
      'Diero', 'Marcon', 'Pieron', 'Rimardo', 'Romero', 'Salazar', 'Umbero',
    ],
    female: [
      'Atala', 'Ceidil', 'Hama', 'Jasmal', 'Meilil', 'Seipora', 'Yethra', 'Zasheida',
      'Arveene', 'Esvele', 'Jhessail', 'Kerri', 'Lureene', 'Miri', 'Rowan',
      'Shandri', 'Tessele', 'Alethra', 'Kara', 'Katernin', 'Mara', 'Natali',
      'Olma', 'Tana', 'Zora', 'Balama', 'Dona', 'Faila', 'Jalana', 'Luisa',
      'Marta', 'Quintessa', 'Selise', 'Vonda', 'Yvette',
    ],
    family: [
      'Amblecrown', 'Buckman', 'Dundragon', 'Evenwood', 'Greycastle', 'Tallstag',
      'Bersk', 'Chernin', 'Dotsk', 'Kulenov', 'Marsk', 'Nemetsk', 'Olichev',
      'Suvov', 'Vinev', 'Agosto', 'Astorio', 'Calabra', 'Domine', 'Falone',
      'Marivaldi', 'Pisacar', 'Ramondo',
    ],
  },
  Dragonborn: {
    male: [
      'Arjhan', 'Balasar', 'Bharash', 'Donaar', 'Ghesh', 'Heskan', 'Kriv',
      'Medrash', 'Mehen', 'Nadarr', 'Pandjed', 'Patrin', 'Rhogar', 'Shamash',
      'Shedinn', 'Tarhun', 'Torinn', 'Akra', 'Biri', 'Daar', 'Farideh', 'Harann',
      'Havilar', 'Jheri', 'Kava', 'Korinn', 'Mishann', 'Nala', 'Perra', 'Raiann',
      'Sora', 'Surina', 'Thava', 'Uadjit',
    ],
    female: [
      'Akra', 'Biri', 'Daar', 'Farideh', 'Harann', 'Havilar', 'Jheri', 'Kava',
      'Korinn', 'Mishann', 'Nala', 'Perra', 'Raiann', 'Sora', 'Surina', 'Thava',
      'Uadjit', 'Asha', 'Vezera', 'Marella', 'Lirana', 'Tasanae', 'Hasrith',
      'Kepesk', 'Kerkad', 'Levexx', 'Charisaxis', 'Adrex', 'Brenwe', 'Caelarra',
      'Daerith', 'Eshenra', 'Fyrra', 'Goravexa',
    ],
    family: [
      'Clethtinthiallor', 'Daardendrian', 'Delmirev', 'Drachedandion', 'Fenkenkabradon',
      'Kepeshkmolik', 'Kerrhylon', 'Kimbatuul', 'Linxakasendalor', 'Myastan',
      'Nemmonis', 'Norixius', 'Ophinshtalajiir', 'Prexijandilin', 'Shestendeliath',
      'Turnuroth', 'Verthisathurgiesh', 'Yarjerit',
    ],
  },
  Gnome: {
    male: [
      'Alston', 'Alvyn', 'Boddynock', 'Brocc', 'Burgell', 'Dimble', 'Eldon',
      'Erky', 'Fonkin', 'Frug', 'Gerbo', 'Gimble', 'Glim', 'Jebeddo', 'Kellen',
      'Namfoodle', 'Orryn', 'Roondar', 'Seebo', 'Sindri', 'Warryn', 'Wrenn',
      'Zook', 'Adwin', 'Bilbron', 'Dabbledob', 'Daffalon', 'Eldwyn', 'Fibblestib',
      'Fonkin', 'Glim', 'Jebeddo', 'Krieger', 'Mardnab', 'Quenfit', 'Roywyn',
    ],
    female: [
      'Bimpnottin', 'Breena', 'Caramip', 'Carlin', 'Donella', 'Duvamil', 'Ella',
      'Ellyjobell', 'Ellywick', 'Lilli', 'Loopmottin', 'Lorilla', 'Mardnab',
      'Nissa', 'Nyx', 'Oda', 'Orla', 'Roywyn', 'Shamil', 'Tana', 'Waywocket',
      'Zanna', 'Bimpa', 'Caralleen', 'Dondra', 'Ellyjelly', 'Glassjaw', 'Hippie',
      'Mardiana', 'Nynphalee', 'Penelope', 'Quentilly', 'Sanna', 'Tilliwooks',
    ],
    family: [
      'Beren', 'Daergel', 'Folkor', 'Garrick', 'Nackle', 'Murnig', 'Ningel',
      'Raulnor', 'Scheppen', 'Timbers', 'Turen', 'Wibbins', 'Cobbleflint',
      'Toffsworth', 'Brassgear',
    ],
  },
  Goliath: {
    male: [
      'Aukan', 'Eglath', 'Gae-al', 'Gauthak', 'Ilikan', 'Keothi', 'Kuori',
      'Lo-kag', 'Manneo', 'Maveith', 'Nalla', 'Orilo', 'Paavu', 'Pethani',
      'Thalai', 'Thotham', 'Vaunea', 'Vimak', 'Brakka', 'Doroth', 'Erruk',
      'Garrash', 'Hessekai', 'Imbrum', 'Joro', 'Kovak', 'Lurok', 'Megag',
      'Norros', 'Olokak', 'Pavel', 'Quavak', 'Rakhash', 'Sirruk',
    ],
    female: [
      'Akali-vati', 'Bephu-thira', 'Dorthi-mali', 'Ele-tana', 'Hu-kanu',
      'Hulla-ela', 'Ilea-vasa', 'Kallaki-vasa', 'Lay-othi', 'Mei-jal',
      'Meilei', 'Naiya-otha', 'Nalla-thri', 'Olothai', 'Othal-vasa', 'Paavu',
      'Pethani', 'Thalai', 'Uthal-tha', 'Vatha-li', 'Akali', 'Behnu',
      'Daanavi', 'Eklavi', 'Gleamiya', 'Hela-thi', 'Iolla', 'Jalla-mei',
      'Karoki', 'Lethi-othi', 'Meili-thra', 'Naasi', 'Olu-vasa', 'Pava-mei',
    ],
    family: [
      'Anakalathai', 'Elanithino', 'Gathakanathi', 'Kalagiano', 'Katho-Olavi',
      'Kolae-Gileana', 'Ogolakanu', 'Thuliaga', 'Thunukalathi', 'Vaivasuta',
      'Stonefoot', 'Thunderhand', 'Iceshear',
    ],
  },
  Orc: {
    male: [
      'Dench', 'Feng', 'Gell', 'Henk', 'Holg', 'Imsh', 'Keth', 'Krusk', 'Mhurren',
      'Ront', 'Shump', 'Thokk', 'Bjorn', 'Brakka', 'Druvash', 'Erruk', 'Garrash',
      'Hessekai', 'Imbrum', 'Joro', 'Kovak', 'Lurok', 'Megag', 'Norros', 'Olokak',
      'Pavel', 'Quavak', 'Rakhash', 'Sirruk', 'Tharakk', 'Urok', 'Vrash', 'Wargs',
    ],
    female: [
      'Baggi', 'Emen', 'Engong', 'Kansif', 'Myev', 'Neega', 'Ovak', 'Ownka',
      'Shautha', 'Sutha', 'Vola', 'Volen', 'Yevelda', 'Zubora', 'Bregga',
      'Cugga', 'Drauga', 'Erra', 'Frika', 'Gretta', 'Halka', 'Iggrun', 'Janga',
      'Krima', 'Lugga', 'Morgga', 'Nyrga', 'Oska', 'Pugga', 'Ragga', 'Skoga',
      'Trogga', 'Ulgga', 'Vragga',
    ],
    family: [
      'Boulderhammer', 'Bonecrusher', 'Skullbreaker', 'Eyegouger', 'Manyaxes',
      'Bloodscar', 'Wargrider', 'Skybreaker', 'Skyhammer', 'Worldscarred',
      'Ironteeth', 'Doomspear', 'Bloodfury',
    ],
  },
  Tiefling: {
    male: [
      'Akmenos', 'Amnon', 'Barakas', 'Damakos', 'Ekemon', 'Iados', 'Kairon',
      'Leucis', 'Melech', 'Mordai', 'Morthos', 'Pelaios', 'Skamos', 'Therai',
      'Akil', 'Bellanor', 'Caelnos', 'Daemonis', 'Eligos', 'Furcas', 'Gilrik',
      'Halphas', 'Ivor', 'Jezebos', 'Kalix', 'Lamak', 'Mavros', 'Nael',
      'Orobas', 'Phenex', 'Quazar', 'Raum', 'Sallos',
    ],
    female: [
      'Akta', 'Anakis', 'Bryseis', 'Criella', 'Damaia', 'Ea', 'Kallista',
      'Lerissa', 'Makaria', 'Nemeia', 'Orianna', 'Phelaia', 'Rieta', 'Apheria',
      'Belial', 'Calix', 'Demariel', 'Elysia', 'Faridah', 'Glasia', 'Halphia',
      'Ipos', 'Jadis', 'Karia', 'Lyrra', 'Mara', 'Nyrissa', 'Ophelia',
      'Persephara', 'Quel', 'Rynn', 'Saria', 'Tymora',
    ],
    family: [
      'Art', 'Carrion', 'Chant', 'Creed', 'Despair', 'Excellence', 'Fear',
      'Glory', 'Hope', 'Ideal', 'Music', 'Nowhere', 'Open', 'Poetry', 'Quest',
      'Random', 'Reverence', 'Sorrow', 'Temerity', 'Torment', 'Weary',
    ],
  },
};

export const npcNamePools: NpcNamePoolEntry[] = (() => {
  const out: NpcNamePoolEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: NpcNamePoolEntry) => {
    const id = `${entry.race}::${entry.gender ?? ''}::${entry.kind}::${entry.value}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(entry);
  };

  for (const [race, names] of Object.entries(namesByRace)) {
    for (const value of names.male) add({ race, gender: 'male', kind: 'first', value });
    for (const value of names.female) add({ race, gender: 'female', kind: 'first', value });
    for (const value of names.family) add({ race, gender: null, kind: 'family', value });
    for (const value of names.epithet ?? []) {
      add({ race, gender: null, kind: 'epithet', value });
    }
  }
  return out;
})();
