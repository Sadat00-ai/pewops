// weapons.js - weapon stats. "damage" is per bullet, the shotgun fires several pellets.

const WEAPONS = [
  { id: "pistol",  name: "Pistol",        damage: 20, pellets: 1, spread: 0.02,  mag: 12, reserve: 84,  rate: 0.28, reload: 1.0, speed: 720,  shake: 1.5, len: 10 },
  { id: "rifle",   name: "Assault Rifle", damage: 25, pellets: 1, spread: 0.06,  mag: 30, reserve: 150, rate: 0.10, reload: 1.8, speed: 880,  shake: 2,   len: 20 },
  { id: "shotgun", name: "Shotgun",       damage: 10, pellets: 6, spread: 0.24,  mag: 8,  reserve: 40,  rate: 0.85, reload: 2.2, speed: 650,  shake: 6,   len: 18 },
  { id: "sniper",  name: "Sniper Rifle",  damage: 90, pellets: 1, spread: 0.004, mag: 5,  reserve: 25,  rate: 1.30, reload: 2.5, speed: 1500, shake: 5,   len: 26 }
];

// finishing this many campaign levels unlocks the weapon
const WEAPON_UNLOCKS = { shotgun: 2, sniper: 4 };

function weaponIndex(id) {
  return WEAPONS.findIndex(function (w) { return w.id === id; });
}

// Weapon stats after the player's permanent upgrades (bought in the Upgrades screen).
// The base WEAPONS list never changes; every run builds its own copy from this.
function effectiveWeapon(base) {
  const up = (save.weaponUp && save.weaponUp[base.id]) || { dmg: 0, mag: 0, rate: 0 };
  const w = Object.assign({}, base);
  w.damage = Math.round(base.damage * (1 + 0.1 * up.dmg));
  w.mag = base.mag + Math.ceil(base.mag * 0.12 * up.mag);
  w.rate = Math.max(0.05, base.rate * (1 - 0.05 * up.rate));
  w.reload = base.reload * (1 - 0.04 * up.mag);
  return w;
}
