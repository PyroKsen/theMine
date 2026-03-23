export function toWallet(wallet) {
  return {
    dollars: Number(wallet?.dollars || 0),
    coins: Number(wallet?.coins || 0)
  };
}

export function toHp(hp) {
  return {
    current: Number(hp?.current || 0),
    max: Number(hp?.max || 0)
  };
}

export function toInventory(inventory) {
  return {
    green: Number(inventory?.green || 0),
    blue: Number(inventory?.blue || 0),
    white: Number(inventory?.white || 0),
    red: Number(inventory?.red || 0),
    pink: Number(inventory?.pink || 0),
    cyan: Number(inventory?.cyan || 0)
  };
}

export function toStorage(storage) {
  return {
    green: Number(storage?.green || 0),
    blue: Number(storage?.blue || 0),
    white: Number(storage?.white || 0),
    red: Number(storage?.red || 0),
    pink: Number(storage?.pink || 0),
    cyan: Number(storage?.cyan || 0)
  };
}
