// Name pools for procedurally generated players. Every player in the game is
// fictional; only clubs and competitions are real.
//
// Nationality mix shifts by tier: the Premier League draws worldwide, League Two is
// overwhelmingly domestic. That falls out of NATION_WEIGHTS below.

export const NATIONS = {
  ENG: { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  SCO: { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  WAL: { name: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
  IRL: { name: 'Ireland', flag: '🇮🇪' },
  FRA: { name: 'France', flag: '🇫🇷' },
  ESP: { name: 'Spain', flag: '🇪🇸' },
  POR: { name: 'Portugal', flag: '🇵🇹' },
  NED: { name: 'Netherlands', flag: '🇳🇱' },
  GER: { name: 'Germany', flag: '🇩🇪' },
  ITA: { name: 'Italy', flag: '🇮🇹' },
  BRA: { name: 'Brazil', flag: '🇧🇷' },
  ARG: { name: 'Argentina', flag: '🇦🇷' },
  NGA: { name: 'Nigeria', flag: '🇳🇬' },
  GHA: { name: 'Ghana', flag: '🇬🇭' },
  CIV: { name: 'Ivory Coast', flag: '🇨🇮' },
  SEN: { name: 'Senegal', flag: '🇸🇳' },
  DEN: { name: 'Denmark', flag: '🇩🇰' },
  SWE: { name: 'Sweden', flag: '🇸🇪' },
  NOR: { name: 'Norway', flag: '🇳🇴' },
  POL: { name: 'Poland', flag: '🇵🇱' },
  CRO: { name: 'Croatia', flag: '🇭🇷' },
  SRB: { name: 'Serbia', flag: '🇷🇸' },
  JPN: { name: 'Japan', flag: '🇯🇵' },
  KOR: { name: 'South Korea', flag: '🇰🇷' },
  USA: { name: 'United States', flag: '🇺🇸' },
  COL: { name: 'Colombia', flag: '🇨🇴' },
  URU: { name: 'Uruguay', flag: '🇺🇾' },
  BEL: { name: 'Belgium', flag: '🇧🇪' },
};

// Weight of each nation by tier (0 = Premier League ... 4 = National League).
export const NATION_WEIGHTS = [
  { ENG: 40, SCO: 4, WAL: 3, IRL: 3, FRA: 8, ESP: 6, POR: 5, NED: 4, GER: 4, ITA: 3, BRA: 5, ARG: 4, NGA: 2, GHA: 1, CIV: 1, SEN: 2, DEN: 2, SWE: 1, NOR: 2, POL: 1, CRO: 1, SRB: 1, JPN: 2, KOR: 1, USA: 2, COL: 1, URU: 1, BEL: 2 },
  { ENG: 62, SCO: 6, WAL: 4, IRL: 5, FRA: 4, ESP: 3, POR: 2, NED: 2, GER: 1, ITA: 1, BRA: 2, ARG: 1, NGA: 2, GHA: 1, CIV: 1, SEN: 1, DEN: 1, SWE: 1, NOR: 1, POL: 1, CRO: 1, SRB: 1, JPN: 1, USA: 1, BEL: 1 },
  { ENG: 76, SCO: 6, WAL: 4, IRL: 5, FRA: 2, ESP: 1, POR: 1, NED: 1, BRA: 1, NGA: 1, GHA: 1, DEN: 1, POL: 1, USA: 1 },
  { ENG: 84, SCO: 5, WAL: 4, IRL: 4, FRA: 1, NGA: 1, GHA: 1 },
  { ENG: 88, SCO: 4, WAL: 4, IRL: 4 },
];

const FIRST = {
  ENG: ['Jack', 'Harry', 'Callum', 'Ollie', 'Reece', 'Tyler', 'Alfie', 'Mason', 'Kieran', 'Louie', 'Declan', 'Jude', 'Marcus', 'Bukayo', 'Conor', 'Ben', 'Josh', 'Lewis', 'Charlie', 'Freddie', 'Archie', 'Ethan', 'Riley', 'Finley', 'Dominic', 'Nathan', 'Sam', 'Joe', 'Luke', 'Ryan', 'Adam', 'Curtis', 'Jordan', 'Tommy', 'Elliot', 'Rhys', 'Bailey', 'Kyle', 'Morgan', 'Spencer'],
  SCO: ['Callum', 'Ryan', 'Stuart', 'Kieran', 'Grant', 'Lewis', 'Angus', 'Fraser', 'Douglas', 'Hamish', 'Struan', 'Blair', 'Euan', 'Rory'],
  WAL: ['Gareth', 'Dylan', 'Rhys', 'Ieuan', 'Owain', 'Morgan', 'Aneurin', 'Gwilym', 'Bryn', 'Cai'],
  IRL: ['Seamus', 'Cillian', 'Ronan', 'Eoin', 'Darragh', 'Fionn', 'Padraig', 'Oisin', 'Conor', 'Niall'],
  FRA: ['Théo', 'Lucas', 'Mattéo', 'Enzo', 'Nathan', 'Hugo', 'Raphaël', 'Adrien', 'Kylian', 'Clément', 'Baptiste', 'Maxence', 'Yanis', 'Ousmane'],
  ESP: ['Álvaro', 'Sergio', 'Iker', 'Pau', 'Marc', 'Nico', 'Javier', 'Rodrigo', 'Diego', 'Unai', 'Aitor', 'Iñigo'],
  POR: ['João', 'Diogo', 'Rúben', 'Gonçalo', 'Tomás', 'Rafael', 'Nuno', 'Vitinha', 'Bernardo', 'Fábio'],
  NED: ['Sven', 'Daan', 'Lars', 'Bram', 'Jurriën', 'Ryan', 'Mees', 'Thijs', 'Koen', 'Stijn'],
  GER: ['Leon', 'Jonas', 'Niklas', 'Florian', 'Maximilian', 'Felix', 'Kai', 'Lukas', 'Tim', 'Moritz'],
  ITA: ['Lorenzo', 'Matteo', 'Alessandro', 'Federico', 'Riccardo', 'Davide', 'Giacomo', 'Nicolò', 'Tommaso'],
  BRA: ['Gabriel', 'Lucas', 'Matheus', 'Rafael', 'Vinícius', 'Bruno', 'Éder', 'Caio', 'Thiago', 'Danilo'],
  ARG: ['Santiago', 'Mateo', 'Julián', 'Facundo', 'Nicolás', 'Emiliano', 'Tomás', 'Valentín', 'Lautaro'],
  NGA: ['Chidi', 'Emeka', 'Tunde', 'Kelechi', 'Ademola', 'Samuel', 'Victor', 'Obi', 'Ifeanyi'],
  GHA: ['Kwame', 'Kofi', 'Yaw', 'Mohammed', 'Daniel', 'Emmanuel', 'Baba', 'Osman'],
  CIV: ['Serge', 'Ibrahim', 'Franck', 'Yao', 'Seydou', 'Amad', 'Wilfried'],
  SEN: ['Idrissa', 'Moussa', 'Pape', 'Cheikh', 'Aliou', 'Habib', 'Boulaye'],
  DEN: ['Mikkel', 'Rasmus', 'Anders', 'Jonas', 'Kasper', 'Emil', 'Victor'],
  SWE: ['Viktor', 'Erik', 'Anton', 'Gustav', 'Oscar', 'Elias', 'Isak'],
  NOR: ['Martin', 'Håkon', 'Sander', 'Erling', 'Kristian', 'Jonas', 'Emil'],
  POL: ['Jakub', 'Piotr', 'Kacper', 'Bartosz', 'Michał', 'Szymon', 'Filip'],
  CRO: ['Luka', 'Ivan', 'Marko', 'Josip', 'Ante', 'Mateo', 'Duje'],
  SRB: ['Nikola', 'Luka', 'Stefan', 'Marko', 'Aleksa', 'Filip', 'Uroš'],
  JPN: ['Takumi', 'Kaoru', 'Daichi', 'Ritsu', 'Yuki', 'Sora', 'Hiroki'],
  KOR: ['Min-jae', 'Heung-min', 'Ji-sung', 'Woo-young', 'Kang-in', 'Hyun-woo'],
  USA: ['Christian', 'Weston', 'Tyler', 'Brenden', 'Gio', 'Josh', 'Ricardo'],
  COL: ['Luis', 'Juan', 'Santiago', 'Andrés', 'Camilo', 'Jhon'],
  URU: ['Facundo', 'Federico', 'Rodrigo', 'Manuel', 'Nicolás'],
  BEL: ['Arthur', 'Jules', 'Lucas', 'Noah', 'Victor', 'Amadou'],
};

const LAST = {
  ENG: ['Carter', 'Whitfield', 'Blakeley', 'Hartley', 'Ashworth', 'Pemberton', 'Radcliffe', 'Sanderson', 'Thornton', 'Merrick', 'Halloway', 'Kingsley', 'Rowntree', 'Beckford', 'Ellwood', 'Marsden', 'Norbury', 'Crossley', 'Fairbanks', 'Winstanley', 'Aldridge', 'Bramley', 'Chadwick', 'Denholm', 'Eastwood', 'Fenwick', 'Garrick', 'Hollis', 'Ingram', 'Kirkby', 'Langford', 'Mowbray', 'Nettleton', 'Oakden', 'Pickering', 'Quinnell', 'Ravenhill', 'Stanbridge', 'Tarleton', 'Underhill', 'Vaughan', 'Wexford', 'Yarwood', 'Ackroyd', 'Birtwistle', 'Colborne', 'Dunmore', 'Everley', 'Fallowfield', 'Grimshaw', 'Hazelwood', 'Ilkeston', 'Jarvis', 'Kettleborough', 'Lindsell', 'Maplethorpe', 'Netherwood', 'Ormerod', 'Prendergast', 'Rushworth', 'Shackleton', 'Tremayne', 'Upton', 'Verity', 'Wainwright'],
  SCO: ['Fergusson', 'McAllister', 'Drummond', 'Kinnaird', 'Buchanan', 'Strachan', 'Lennox', 'Kerrigan', 'Baxter', 'MacLeod', 'Rennie', 'Dalgleish'],
  WAL: ['Llewellyn', 'Pritchard', 'Vaughan', 'Meredith', 'Cadwallader', 'Bevan', 'Trefor', 'Gwynne', 'Maddock'],
  IRL: ['O’Doherty', 'Flanagan', 'Kilbane', 'Mulcahy', 'Devlin', 'Rafferty', 'Coughlan', 'Brennan', 'Hourihane'],
  FRA: ['Lefevre', 'Marchand', 'Dubreuil', 'Rousseau', 'Baptiste', 'Cordier', 'Delacroix', 'Fontaine', 'Guerin', 'Mercier'],
  ESP: ['Zabala', 'Iglesias', 'Cabrera', 'Villalba', 'Sarabia', 'Ferrán', 'Moret', 'Quintana', 'Bardají', 'Olmedo'],
  POR: ['Fonseca', 'Carvalho', 'Salgado', 'Trindade', 'Ferreira', 'Bastos', 'Moreira', 'Pinheiro', 'Queirós'],
  NED: ['van Wijk', 'de Groot', 'Bakhuis', 'Vermeulen', 'Hendriks', 'van Doorn', 'Klaassen', 'Terlouw'],
  GER: ['Brandhorst', 'Wiegand', 'Kellner', 'Osterhagen', 'Zimmerer', 'Rothbauer', 'Lindner', 'Haas'],
  ITA: ['Bellandi', 'Ferraro', 'Moretti', 'Cassano', 'Rinaldi', 'Serafini', 'Pagano', 'Lombardi'],
  BRA: ['Ribeiro', 'Nascimento', 'Andrade', 'Cardoso', 'Teixeira', 'Moraes', 'Barbosa', 'Alencar'],
  ARG: ['Zabaleta', 'Domínguez', 'Ferreyra', 'Ocampos', 'Quiroga', 'Benítez', 'Iturbe', 'Sosa'],
  NGA: ['Okafor', 'Adeyemi', 'Nwachukwu', 'Balogun', 'Eze', 'Iheanacho', 'Obiora', 'Chukwu'],
  GHA: ['Mensah', 'Asante', 'Boateng', 'Amoah', 'Owusu', 'Adjei', 'Nketiah'],
  CIV: ['Kouassi', 'Bakayoko', 'Traoré', 'Diomandé', 'Zoro', 'Gbamin'],
  SEN: ['Diallo', 'Ndiaye', 'Sarr', 'Gueye', 'Mbaye', 'Cissé', 'Fall'],
  DEN: ['Poulsen', 'Nørgaard', 'Kristensen', 'Bendtner', 'Hjulmand', 'Damsgaard'],
  SWE: ['Lindström', 'Bergqvist', 'Nyholm', 'Andersson', 'Ekdal', 'Svensson'],
  NOR: ['Håland', 'Berge', 'Ødegaard', 'Solbakken', 'Nordtveit', 'Ryerson'],
  POL: ['Zieliński', 'Kowalczyk', 'Wójcik', 'Lewandowicz', 'Szymański', 'Kamiński'],
  CRO: ['Petrović', 'Modrić', 'Vlašić', 'Sučić', 'Erlić', 'Juranović'],
  SRB: ['Milinković', 'Jovanović', 'Pavlović', 'Ilić', 'Stanković', 'Radonjić'],
  JPN: ['Nakamura', 'Endo', 'Kubo', 'Tomiyasu', 'Mitoma', 'Hashimoto'],
  KOR: ['Kim', 'Son', 'Hwang', 'Lee', 'Park', 'Jung'],
  USA: ['Pulisic', 'McKennie', 'Reyna', 'Adams', 'Robinson', 'Turner'],
  COL: ['Ospina', 'Cuadrado', 'Sinisterra', 'Arias', 'Lerma', 'Borré'],
  URU: ['Pellistri', 'Valverde', 'Bentancur', 'Araújo', 'Núñez'],
  BEL: ['Doku', 'Vermeeren', 'Onana', 'Theate', 'Openda', 'Trossard'],
};

export function nationsForTier(tier) {
  const weights = NATION_WEIGHTS[Math.max(0, Math.min(4, tier))];
  return { codes: Object.keys(weights), weights: Object.values(weights) };
}

export function firstNames(nation) {
  return FIRST[nation] || FIRST.ENG;
}

export function lastNames(nation) {
  return LAST[nation] || LAST.ENG;
}
