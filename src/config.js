// Every tuning number in one place. Times are real seconds unless noted.

export const BUILD = 'tf-1.1.5-cook-times';
export const APP_ID = 'two-forks-bistro-game-2026';

export const CFG = {
  tickHz: 30,
  slowHz: 8,     // full game-state snapshots to the partner
  fastHz: 20,    // positions only

  // A service covers 11:00 to 22:00 (660 game minutes) in 15 real minutes.
  serviceStart: 11 * 60,
  doorsLock: 21 * 60 + 30,
  serviceEnd: 22 * 60,
  serviceRealSeconds: 15 * 60,

  move: { speed: 4.6, accel: 30, radius: 0.32, reach: 1.25 },

  cookTimeMultiplier: 0.9,
  burn: { grill: 30, pan: 20, fryer: 15, oven: 40, pot: 0 },
  potOvercook: 60,
  overdoneQuality: 0.75,
  coldAfter: 75,
  coldAfterLamp: 150,
  chopSpeedKnife: 1.6,

  work: { order: 2.0, pay: 1.5, wash: 1.8, unpack: 0.9 },

  party: {
    startMood: 80,
    drain: 0.55,             // mood per second once patience runs out
    queueDrain: 0.45,
    queuePatience: 90,
    browse: [14, 24],
    orderPatience: 60,
    drinkPatience: 75,
    foodGrace: 80,           // plus 25 s per dish before waiting for food hurts
    gracePerDish: 25,
    eat: [50, 70],
    dessertEat: [28, 38],
    payPatience: 50,
    walkSpeed: 2.6,
  },

  traffic: {
    perTable: 2.8,
    capPerTable: 2.7,
    solo: 0.6,
    minGap: { solo: 34, duo: 16 },   // game minutes between arrivals at least
    weekday: [0.8, 0.85, 0.95, 1.0, 1.25, 1.3, 1.1], // Mon..Sun
    // Relative arrivals per game hour from 11:00 to 21:00.
    hourly: [1, 3, 2, 1, 0.4, 0.7, 1, 2, 2.2, 1.2, 0.3],
  },

  money: {
    startCash: 1500,
    rent: 120,
    loan: 40,
    utilities: 30,
    utilityPerStation: 3,
    cardFee: 0.03,
    suppliesPerGuest: 0.6,
    cleaningPerPlate: 2,
    rushMarkup: 1.4,
    rushDelay: 30,
  },

  rep: {
    window: 40,
    levels: [0, 40, 110, 220, 380, 600, 900, 1300, 1800, 2400, 3100],
  },

  plates: 16,
  wellMax: 8,
  potMax: 4,      // identical portions a pot can cook at once
  fryerMax: 2,
  queueMax: 7,
  menuSlots: { main: 5, starter: 4, dessert: 2 },
  menuBoardBonus: { main: 2, starter: 1, dessert: 1 },
};

export const TICK = 1 / CFG.tickHz;
export const GAME_MIN_PER_SEC = (CFG.serviceEnd - CFG.serviceStart) / CFG.serviceRealSeconds;
