// Demoläge (npm run demo): visar påhittade konversationer utan att logga in
// på Facebook. Bra för att titta på utseendet.

const conversations = [
  { id: '1001', name: 'Anna Svensson', snippet: 'Ses vi ikväll? :)', avatar: null, unread: true },
  { id: '1002', name: 'Johan', snippet: 'Haha (Y)', avatar: null, unread: true },
  { id: '1003', name: 'Mamma', snippet: 'Glöm inte att ringa farmor', avatar: null, unread: false },
  { id: '1004', name: 'Fotbollsgänget', snippet: 'Träning 18.00 på torsdag', avatar: null, unread: false },
  { id: '1005', name: 'Erik Lind', snippet: 'Du: Tack för igår!', avatar: null, unread: false },
];

const messages = new Map([
  ['1001', [
    { text: 'Hej! Hur är läget?', mine: false },
    { text: 'Hej Anna! Bara bra, själv? :D', mine: true },
    { text: 'Toppen! Ses vi ikväll? :)', mine: false },
  ]],
  ['1002', [{ text: 'Såg du matchen igår?', mine: false }, { text: 'Ja! Vilket mål (Y)', mine: true }, { text: 'Haha (Y)', mine: false }]],
]);

module.exports = { conversations, messages };
