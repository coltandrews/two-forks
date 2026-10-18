// Things to buy in the Office. Stations are placed automatically in free
// kitchen space and can be moved in the layout editor.

export const UPGRADES = [
  { id: 'knife', name: "Chef's knife", price: 150, max: 1, desc: 'Chopping is 40% faster.', group: 'Kitchen' },
  { id: 'counter', name: 'Extra counter', price: 120, max: 4, station: 'counter', desc: 'More room to plate and park food.', group: 'Kitchen' },
  { id: 'well', name: 'Extra prep well', price: 150, max: 2, station: 'well', desc: 'Holds 8 prepped portions of one thing.', group: 'Kitchen' },
  { id: 'board', name: 'Extra cutting board', price: 200, max: 2, station: 'board', desc: 'Two people can chop at once.', group: 'Kitchen' },
  { id: 'pot', name: 'Extra pot', price: 350, max: 2, station: 'pot', desc: 'One more boil or simmer at a time.', group: 'Kitchen' },
  { id: 'lamp', name: 'Heat lamp at the pass', price: 400, max: 1, desc: 'Plates stay hot for 90 s instead of 40 s.', group: 'Kitchen' },
  { id: 'grill', name: 'Extra grill', price: 450, max: 2, station: 'grill', desc: 'One more patty, fillet or bun at once.', group: 'Kitchen' },
  { id: 'burner', name: 'Extra burner', price: 450, max: 2, station: 'pan', desc: 'One more pan at once.', group: 'Kitchen' },
  { id: 'fryer', name: 'Second fryer', price: 500, max: 1, station: 'fryer', desc: 'Two fry orders at once.', group: 'Kitchen' },
  { id: 'fridge_temp', name: 'Fridge temperature control', price: 500, max: 1, desc: 'Fresh ingredients keep 1 day longer.', group: 'Kitchen' },
  { id: 'oven', name: 'Second oven', price: 1000, max: 1, station: 'oven', desc: 'Two bakes at once.', group: 'Kitchen' },
  { id: 'dishwasher', name: 'Dishwasher', price: 1200, max: 1, desc: 'Dirty plates in the sink wash themselves. Adds $4 a day to utilities.', group: 'Kitchen' },
  { id: 'table2', name: 'Extra 2-top table', price: 250, max: 4, table: 2, desc: 'Seats two more guests per turn.', group: 'Dining room' },
  { id: 'table4', name: 'Extra 4-top table', price: 400, max: 3, table: 4, desc: 'Seats four more guests per turn.', group: 'Dining room' },
  { id: 'menu_board', name: 'Bigger menu board', price: 300, max: 1, desc: 'Two more mains and one more starter on the menu.', group: 'Dining room' },
  { id: 'decor1', name: 'Plants and art', price: 250, max: 1, desc: 'Guests start 4 points happier.', group: 'Dining room', decor: 1 },
  { id: 'decor2', name: 'Lighting and music', price: 600, max: 1, desc: 'Guests start another 4 points happier.', group: 'Dining room', decor: 2, needs: 'decor1' },
  { id: 'decor3', name: 'Full renovation', price: 1200, max: 1, desc: 'Guests start another 4 points happier and tip a bit more.', group: 'Dining room', decor: 3, needs: 'decor2' },
];

export const MARKETING = [
  { id: 'flyers', name: 'Flyers around the neighborhood', price: 60, days: 1, boost: 0.1 },
  { id: 'blog', name: 'Local food blog feature', price: 250, days: 3, boost: 0.25 },
];
