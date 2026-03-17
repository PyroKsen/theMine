import React from "react";
import { SHOP_ITEMS } from "../constants.js";
import { BuildingManagePanel } from "./BuildingManagePanel.jsx";

export function ShopModal({
  open,
  shopTab,
  onTabChange,
  shopOwner,
  currentUsername,
  shopBuilding,
  inventory,
  shopSell,
  shopBuy,
  sellTotal,
  buyTotal,
  sellCountTotal,
  buyCountTotal,
  onUpdateSell,
  onUpdateBuy,
  onCollect,
  onSell,
  onBuy,
  onRepair
}) {
  if (!open) return null;
  const manageOnly = Boolean(shopBuilding?.inactive);

  return (
    <div className="storage-backdrop">
      <div className="storage-modal">
        <div className="storage-title">Shop</div>
        <div className="shop-tabs">
          {!manageOnly ? (
            <button
              className={`shop-tab${shopTab === "sell" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("sell")}
            >
              Sell
            </button>
          ) : null}
          {!manageOnly ? (
            <button
              className={`shop-tab${shopTab === "buy" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("buy")}
            >
              Buy
            </button>
          ) : null}
          {shopOwner && shopOwner === currentUsername ? (
            <button
              className={`shop-tab${shopTab === "manage" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("manage")}
            >
              Manage
            </button>
          ) : null}
        </div>
        {shopTab === "sell" && !manageOnly ? (
          <>
            <div className="shop-list">
              {SHOP_ITEMS.map((item) => {
                const count = inventory[item.id] ?? 0;
                const sellCount = shopSell[item.id] ?? 0;
                return (
                  <div key={item.id} className="shop-row">
                    <div className="shop-info">
                      <span className={`shop-name ${item.className}`}>
                        {item.name}
                      </span>
                      <span className="shop-count">x{count}</span>
                    </div>
                    <input
                      className="shop-slider"
                      type="range"
                      min="0"
                      max={count}
                      step="1"
                      value={sellCount}
                      disabled={count <= 0}
                      onChange={(event) =>
                        onUpdateSell(item.id, event.target.value, count)
                      }
                    />
                    <input
                      className="shop-input"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={count}
                      step="1"
                      value={sellCount}
                      disabled={count <= 0}
                      onChange={(event) =>
                        onUpdateSell(item.id, event.target.value, count)
                      }
                    />
                    <div className="shop-price">${item.price}</div>
                  </div>
                );
              })}
            </div>
            <div className="shop-footer">
              <div className="shop-total">Total: ${sellTotal}</div>
              <button
                className="shop-sell"
                type="button"
                disabled={sellCountTotal <= 0}
                onClick={onSell}
              >
                Sell
              </button>
            </div>
          </>
        ) : shopTab === "buy" && !manageOnly ? (
          <>
            <div className="shop-list">
              {SHOP_ITEMS.map((item) => {
                const count = inventory[item.id] ?? 0;
                const buyCount = shopBuy[item.id] ?? 0;
                return (
                  <div key={item.id} className="shop-row is-buy">
                    <div className="shop-info">
                      <span className={`shop-name ${item.className}`}>
                        {item.name}
                      </span>
                      <span className="shop-count">x{count}</span>
                    </div>
                    <input
                      className="shop-input"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={buyCount}
                      onChange={(event) =>
                        onUpdateBuy(item.id, event.target.value)
                      }
                    />
                    <div className="shop-price">${item.price * 2}</div>
                  </div>
                );
              })}
            </div>
            <div className="shop-footer">
              <div className="shop-total">Total: ${buyTotal}</div>
              <button
                className="shop-sell"
                type="button"
                disabled={buyCountTotal <= 0}
                onClick={onBuy}
              >
                Buy
              </button>
            </div>
          </>
        ) : (
          <BuildingManagePanel
            building={shopBuilding}
            inventoryBlue={inventory.blue}
            onCollect={onCollect}
            onRepair={onRepair}
          />
        )}
      </div>
    </div>
  );
}
